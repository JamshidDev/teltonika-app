import { Injectable } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import {
  carPositions,
  cars,
  carStopEvents,
  devices,
  drivers,
} from '@/shared/database/schema';
import { and, between, count, desc, eq, or, sql } from 'drizzle-orm';
import { CarHistoryDto, CarRouteDto } from './history.dto';
import simplify from '@turf/simplify';
import { lineString } from '@turf/helpers';
import { RouteConfig } from '@config/route.config';
import { MOTION } from '@/teltonika/motion-state.constants';

interface RoutePoint {
  lat: number;
  lng: number;
  speed: number | null;
  angle: number | null;
  recordedAt: Date;
}

interface TimelineRoute {
  type: 'route';
  points: RoutePoint[];
  startPoint: { lat: number; lng: number }; // A nuqta (route boshlanishi)
  endPoint: { lat: number; lng: number }; // B nuqta (route tugashi)
  distance: number;
  confidence: number; // 0-1 GPS sifat ko'rsatkichi
}

interface TimelineEvent {
  type: 'stop' | 'parking';
  lat: number;
  lng: number;
  startAt: string;
  endAt: string | null;
  duration: number | null;
  confidence: number; // 0-1
  suspicious: boolean; // true = shubhali event
}

type TimelineItem = TimelineRoute | TimelineEvent;

@Injectable()
export class HistoryService {
  constructor(
    @InjectDb() private db: DataSource,
    private readonly routeConfig: RouteConfig,
  ) {}

  async getCarPositions(dto: CarHistoryDto) {
    const page = Math.max(dto.page ?? 1, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const whereClause = dto.carId
      ? eq(carPositions.carId, dto.carId)
      : undefined;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: carPositions.id,
          carId: carPositions.carId,
          carName: cars.name,
          carNumber: cars.carNumber,
          latitude: carPositions.latitude,
          longitude: carPositions.longitude,
          speed: carPositions.speed,
          angle: carPositions.angle,
          satellites: carPositions.satellites,
          ignition: carPositions.ignition,
          recordedAt: carPositions.recordedAt,
          createdAt: carPositions.createdAt,
          bytesReceived: carPositions.bytesReceived,
          distanceFromPrev: carPositions.distanceFromPrev,
          rawIo: carPositions.rawIo,
          device: {
            id: devices.id,
            imei: devices.imei,
            model: devices.model,
          },
          driver: {
            id: drivers.id,
            fullName: drivers.fullName,
            phone: drivers.phone,
          },
        })
        .from(carPositions)
        .leftJoin(cars, eq(carPositions.carId, cars.id))
        .leftJoin(devices, eq(carPositions.deviceId, devices.id))
        .leftJoin(drivers, eq(carPositions.driverId, drivers.id))
        .where(whereClause)
        .orderBy(desc(carPositions.recordedAt))
        .offset(offset)
        .limit(pageSize),

      this.db.select({ total: count() }).from(carPositions).where(whereClause),
    ]);

    const total = Number(countResult[0]?.total ?? 0);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getCarRoute(dto: CarRouteDto) {
    const rawPoints = await this.queryRoutePoints(
      dto.carId,
      new Date(dto.from),
      new Date(dto.to),
    );

    // Pipeline: filter → chain → jitter smooth → simplify
    const chained = this.filterRouteChain(rawPoints);
    if (chained.length < 2) return chained;

    const smoothed = this.smoothJitter(chained);
    return this.simplifyRoute(smoothed);
  }

  async getCarRouteWithEvents(carId: number, from: string, to: string) {
    const dayStart = new Date(from);
    const dayEnd = new Date(to);

    // 1. Stop/parking eventlar
    const events = await this.db
      .select({
        type: carStopEvents.type,
        startAt: carStopEvents.startAt,
        endAt: carStopEvents.endAt,
        durationSeconds: carStopEvents.durationSeconds,
        lat: carStopEvents.latitude,
        lng: carStopEvents.longitude,
      })
      .from(carStopEvents)
      .where(
        and(
          eq(carStopEvents.carId, carId),
          or(
            between(carStopEvents.startAt, dayStart, dayEnd),
            and(
              sql`${carStopEvents.startAt} < ${dayStart}`,
              or(
                between(carStopEvents.endAt, dayStart, dayEnd),
                sql`${carStopEvents.endAt} IS NULL`,
              ),
            ),
          ),
        ),
      )
      .orderBy(carStopEvents.startAt);

    // 2. Route nuqtalari — movement-based (ignition-dan mustaqil)
    const rawPoints = await this.queryRoutePoints(carId, dayStart, dayEnd);

    // Pipeline: filter → chain
    const routePoints = this.filterRouteChain(rawPoints);

    const clippedEvents = this.clipEventsToRange(events, dayStart, dayEnd);
    const mergedEvents = this.mergeConsecutiveEvents(clippedEvents, routePoints);

    // 3. Timeline yaratish (snap + confidence + validation)
    const timeline = this.buildTimeline(routePoints, mergedEvents);

    return {
      carId,
      from,
      to,
      totalEvents: mergedEvents.length,
      totalRoutePoints: routePoints.length,
      timeline,
    };
  }

  /** Raw pozitsiyalar — filtrsiz, debugging uchun */
  async getRawPositions(carId: number, from: string, to: string) {
    const result = await this.db.execute(sql`
      SELECT latitude    as lat,
             longitude   as lng,
             speed,
             angle,
             ignition,
             satellites,
             recorded_at as "recordedAt"
      FROM car_positions
      WHERE car_id = ${carId}
        AND recorded_at BETWEEN ${new Date(from)} AND ${new Date(to)}
        AND latitude != 0 AND longitude != 0
      ORDER BY recorded_at ASC
    `);

    return result.rows;
  }

  /**
   * DIAGNOSTIKA: Qaysi filter qancha nuqtani yo'q qilayotganini ko'rsatadi.
   * Production da o'chirib qo'yish mumkin.
   */
  async diagnosRouteFilters(carId: number, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const result = await this.db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE latitude != 0 AND longitude != 0) as valid_coords,
        COUNT(*) FILTER (WHERE latitude != 0 AND longitude != 0 AND ignition = true) as with_ignition,
        COUNT(*) FILTER (WHERE latitude != 0 AND longitude != 0 AND speed >= ${this.routeConfig.minSpeed}) as above_min_speed,
        COUNT(*) FILTER (WHERE latitude != 0 AND longitude != 0 AND satellites >= ${MOTION.MIN_SATELLITES}) as sat_gte_4,
        COUNT(*) FILTER (WHERE latitude != 0 AND longitude != 0 AND satellites >= 3) as sat_gte_3,
        COUNT(*) FILTER (WHERE latitude != 0 AND longitude != 0 AND satellites >= 2) as sat_gte_2,
        COUNT(*) FILTER (WHERE latitude != 0 AND longitude != 0
          AND (ignition = true OR speed >= ${MOTION.NO_IGNITION_MIN_SPEED})
          AND speed >= ${this.routeConfig.minSpeed}
          AND satellites >= ${MOTION.MIN_SATELLITES}
        ) as route_query_result,
        COUNT(*) FILTER (WHERE latitude != 0 AND longitude != 0
          AND (ignition = true OR speed >= ${MOTION.NO_IGNITION_MIN_SPEED})
          AND speed >= ${this.routeConfig.minSpeed}
          AND satellites >= 3
        ) as route_with_sat3,
        AVG(satellites) FILTER (WHERE latitude != 0 AND longitude != 0) as avg_satellites,
        MIN(satellites) FILTER (WHERE latitude != 0 AND longitude != 0) as min_satellites,
        MAX(satellites) FILTER (WHERE latitude != 0 AND longitude != 0) as max_satellites,
        AVG(speed) FILTER (WHERE latitude != 0 AND longitude != 0 AND speed > 0) as avg_speed
      FROM car_positions
      WHERE car_id = ${carId}
        AND recorded_at BETWEEN ${fromDate} AND ${toDate}
    `);

    const stats = result.rows[0] as Record<string, unknown>;

    return {
      carId,
      from,
      to,
      filters: {
        total: Number(stats.total),
        validCoords: Number(stats.valid_coords),
        withIgnition: Number(stats.with_ignition),
        aboveMinSpeed: Number(stats.above_min_speed),
        satellitesGte4: Number(stats.sat_gte_4),
        satellitesGte3: Number(stats.sat_gte_3),
        satellitesGte2: Number(stats.sat_gte_2),
        routeQueryResult: Number(stats.route_query_result),
        routeWithSat3: Number(stats.route_with_sat3),
      },
      gpsQuality: {
        avgSatellites: Number(Number(stats.avg_satellites).toFixed(1)),
        minSatellites: Number(stats.min_satellites),
        maxSatellites: Number(stats.max_satellites),
        avgSpeed: Number(Number(stats.avg_speed).toFixed(1)),
      },
      config: {
        minSpeed: this.routeConfig.minSpeed,
        minSatellites: MOTION.MIN_SATELLITES,
        noIgnitionMinSpeed: MOTION.NO_IGNITION_MIN_SPEED,
      },
    };
  }

  // ─── Route query ───

  /**
   * Route nuqtalarini olish.
   *
   * Speed filter OLIB TASHLANDI — sabab:
   * - speed >= 2 parking yaqinidagi sekin nuqtalarni chiqarib tashlar edi
   * - Bu Route B → Parking orasida 2-8 km gap hosil qilar edi
   * - Buning o'rniga filterRouteChain (minDistance) sekin/to'xtagan nuqtalarni filtrlaydi
   *
   * Ignition filter yengilroq: ignition=true YOKI speed > 0 (har qanday harakat)
   */
  private async queryRoutePoints(
    carId: number,
    from: Date,
    to: Date,
  ): Promise<RoutePoint[]> {
    const result = await this.db.execute(sql`
      SELECT latitude    as lat,
             longitude   as lng,
             speed,
             angle,
             recorded_at as "recordedAt"
      FROM car_positions
      WHERE car_id = ${carId}
        AND recorded_at BETWEEN ${from} AND ${to}
        AND latitude != 0 AND longitude != 0
        AND (ignition = true OR speed >= ${MOTION.NO_IGNITION_MIN_SPEED})
        AND satellites >= ${MOTION.MIN_SATELLITES}
      ORDER BY recorded_at ASC
    `);

    return result.rows as unknown as RoutePoint[];
  }

  // ─── Pipeline: filter → chain → jitter → smooth → snap → simplify ───

  /**
   * Application-level route chain filter.
   * Oxirgi QABUL QILINGAN nuqtadan masofa hisoblaydi (SQL LAG bug fix).
   */
  private filterRouteChain(points: RoutePoint[]): RoutePoint[] {
    if (points.length === 0) return [];

    const result: RoutePoint[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const last = result[result.length - 1];
      const curr = points[i];
      const distance = this.calculateDistance(
        last.lat,
        last.lng,
        curr.lat,
        curr.lng,
      );

      if (
        distance >= this.routeConfig.minDistance &&
        distance <= this.routeConfig.maxDistance
      ) {
        result.push(curr);
      }
    }

    return result;
  }

  /**
   * Jitter smoothing — kichik GPS noise uchun 3 nuqtali weighted average.
   * Faqat juda yaqin nuqtalar smooth qilinadi, haqiqiy harakat saqlanadi.
   */
  private smoothJitter(points: RoutePoint[]): RoutePoint[] {
    if (points.length <= 2) return points;

    const threshold = this.routeConfig.jitterThreshold;
    const result: RoutePoint[] = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const next = points[i + 1];

      const distPrev = this.calculateDistance(
        prev.lat,
        prev.lng,
        curr.lat,
        curr.lng,
      );
      const distNext = this.calculateDistance(
        curr.lat,
        curr.lng,
        next.lat,
        next.lng,
      );

      // Ikkala qo'shni juda yaqin = jitter, smooth qilish
      if (distPrev < threshold && distNext < threshold) {
        result.push({
          ...curr,
          lat: (prev.lat + curr.lat + next.lat) / 3,
          lng: (prev.lng + curr.lng + next.lng) / 3,
        });
      } else {
        result.push(curr);
      }
    }

    result.push(points[points.length - 1]);
    return result;
  }

  /** Route boshi va oxirini smoothPoints nuqtaning o'rtachasi bilan smooth qilish */
  private smoothRouteEndpoints(points: RoutePoint[]): RoutePoint[] {
    const n = this.routeConfig.smoothPoints;
    if (points.length <= n) return points;

    const result = [...points];

    const startSlice = points.slice(0, n);
    const startAvg = this.averagePoint(startSlice);
    result[0] = { ...result[0], lat: startAvg.lat, lng: startAvg.lng };

    const endSlice = points.slice(-n);
    const endAvg = this.averagePoint(endSlice);
    result[result.length - 1] = {
      ...result[result.length - 1],
      lat: endAvg.lat,
      lng: endAvg.lng,
    };

    return result;
  }

  private averagePoint(points: RoutePoint[]): { lat: number; lng: number } {
    const sum = points.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 },
    );
    return {
      lat: sum.lat / points.length,
      lng: sum.lng / points.length,
    };
  }

  /**
   * Adaptive simplification:
   * - Tolerance nuqtalar soniga qarab moslashadi
   * - Birinchi va oxirgi nuqtalar DOIM saqlanadi (event boundary)
   */
  private simplifyRoute(points: RoutePoint[]): RoutePoint[] {
    if (points.length <= 10) return points;

    const tolerance =
      points.length > 500
        ? 0.0003
        : points.length > 200
          ? 0.0002
          : points.length > 50
            ? 0.00015
            : 0.0001;

    const line = lineString(points.map((p) => [p.lng, p.lat]));
    const simplified = simplify(line, { tolerance, highQuality: true });

    const simplifiedCoords = new Set(
      simplified.geometry.coordinates.map(([lng, lat]) => `${lat},${lng}`),
    );

    // Birinchi va oxirgi nuqtalar doim saqlanadi
    simplifiedCoords.add(`${points[0].lat},${points[0].lng}`);
    simplifiedCoords.add(
      `${points[points.length - 1].lat},${points[points.length - 1].lng}`,
    );

    return points.filter((p) => simplifiedCoords.has(`${p.lat},${p.lng}`));
  }

  // ─── Snap to route ───

  /**
   * Stop nuqtasini routega snap qilish — fallback zanjiri:
   * 1. Segment proeksiya (eng aniq)
   * 2. Eng yaqin nuqta (segment yo'q bo'lsa)
   * 3. Original koordinata (route juda uzoq)
   */
  private snapStopToRoute(
    stopLat: number,
    stopLng: number,
    routePoints: RoutePoint[],
  ): { lat: number; lng: number; snapDistance: number } {
    const maxSnap = this.routeConfig.maxSnapDistance;

    if (routePoints.length === 0) {
      return { lat: stopLat, lng: stopLng, snapDistance: -1 };
    }

    let minDist = Infinity;
    let closestLat = stopLat;
    let closestLng = stopLng;

    // 1. Segment proeksiya — eng yaqin segmentga perpendicular proeksiya
    if (routePoints.length >= 2) {
      for (let i = 0; i < routePoints.length - 1; i++) {
        const a = routePoints[i];
        const b = routePoints[i + 1];

        const projected = this.projectPointToSegment(
          stopLat,
          stopLng,
          a.lat,
          a.lng,
          b.lat,
          b.lng,
        );

        const dist = this.calculateDistance(
          stopLat,
          stopLng,
          projected.lat,
          projected.lng,
        );

        if (dist < minDist) {
          minDist = dist;
          closestLat = projected.lat;
          closestLng = projected.lng;
        }
      }
    }

    // 2. Fallback: eng yaqin bitta nuqta (1 nuqtali route yoki segment proeksiya ishlamasa)
    if (minDist > maxSnap) {
      for (const p of routePoints) {
        const d = this.calculateDistance(stopLat, stopLng, p.lat, p.lng);
        if (d < minDist) {
          minDist = d;
          closestLat = p.lat;
          closestLng = p.lng;
        }
      }
    }

    // 3. Faqat maxSnap ichida bo'lsa snap, aks holda original
    if (minDist <= maxSnap) {
      return { lat: closestLat, lng: closestLng, snapDistance: minDist };
    }

    return { lat: stopLat, lng: stopLng, snapDistance: minDist };
  }

  private projectPointToSegment(
    pLat: number,
    pLng: number,
    aLat: number,
    aLng: number,
    bLat: number,
    bLng: number,
  ): { lat: number; lng: number } {
    const dx = bLng - aLng;
    const dy = bLat - aLat;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return { lat: aLat, lng: aLng };

    const t = Math.max(
      0,
      Math.min(1, ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq),
    );

    return {
      lat: aLat + t * dy,
      lng: aLng + t * dx,
    };
  }

  // ─── Timeline builder ───

  private buildTimeline(
    points: RoutePoint[],
    events: {
      type: string | null;
      startAt: Date;
      endAt: Date | null;
      durationSeconds: number | null;
      lat: number | null;
      lng: number | null;
    }[],
  ): TimelineItem[] {
    if (points.length === 0 && events.length === 0) return [];

    // Route vaqtlarini pre-compute (performance: mergeConsecutiveEvents uchun)
    const routeTimes = points.map((p) => new Date(p.recordedAt).getTime());

    const sortedEvents = events.map((e) => ({
      type: (e.type ?? 'stop') as 'stop' | 'parking',
      startAt: e.startAt,
      endAt: e.endAt,
      durationSeconds: e.durationSeconds,
      lat: e.lat ?? 0,
      lng: e.lng ?? 0,
    }));

    const timeline: TimelineItem[] = [];
    let pointIndex = 0;

    for (const event of sortedEvents) {
      // Event oldidagi route nuqtalari
      const segment: RoutePoint[] = [];
      while (
        pointIndex < points.length &&
        routeTimes[pointIndex] < event.startAt.getTime()
      ) {
        segment.push(points[pointIndex]);
        pointIndex++;
      }

      // Route → Event connector: route oxirgi nuqtasi eventdan uzoq bo'lsa,
      // event koordinatasini route oxiriga qo'shib, uzluksiz polyline hosil qilish
      if (segment.length >= 1) {
        const lastPt = segment[segment.length - 1];
        const gapToEvent = this.calculateDistance(
          lastPt.lat,
          lastPt.lng,
          event.lat,
          event.lng,
        );
        if (gapToEvent > 100 && gapToEvent < 10000) {
          // Event nuqtasini route oxiriga connector sifatida qo'shish
          segment.push({
            lat: event.lat,
            lng: event.lng,
            speed: 0,
            angle: lastPt.angle,
            recordedAt: event.startAt,
          });
        }
        this.pushRouteSegment(timeline, segment);
      }

      // Event marker — adaptive time window snap
      const nearbyPoints = this.getNearbyPoints(
        points,
        routeTimes,
        event.startAt,
        event.endAt,
      );
      const snapped = this.snapStopToRoute(
        event.lat,
        event.lng,
        nearbyPoints,
      );

      // Event validation — confidence + suspicious
      const { confidence, suspicious } = this.computeEventConfidence(
        event,
        snapped.snapDistance,
      );

      timeline.push({
        type: event.type,
        lat: snapped.lat,
        lng: snapped.lng,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt?.toISOString() ?? null,
        duration: event.durationSeconds,
        confidence,
        suspicious,
      });

      // Event davomidagi nuqtalarni o'tkazish
      if (event.endAt) {
        const endTime = event.endAt.getTime();
        while (pointIndex < points.length && routeTimes[pointIndex] <= endTime) {
          pointIndex++;
        }
      }

      // Event → keyingi Route connector: agar keyingi route nuqtasi uzoq bo'lsa,
      // event koordinatasini keyingi segmentning boshiga qo'shish
      if (
        event.endAt &&
        pointIndex < points.length
      ) {
        const nextPt = points[pointIndex];
        const gapFromEvent = this.calculateDistance(
          event.lat,
          event.lng,
          nextPt.lat,
          nextPt.lng,
        );
        if (gapFromEvent > 100 && gapFromEvent < 10000) {
          // Keyingi segment oldiga event nuqtasini qo'shish
          // (pointIndex o'zgarmaydi — segment loop da yig'iladi)
          points.splice(pointIndex, 0, {
            lat: event.lat,
            lng: event.lng,
            speed: 0,
            angle: nextPt.angle,
            recordedAt: event.endAt,
          } as RoutePoint);
          // routeTimes ni ham yangilash
          routeTimes.splice(pointIndex, 0, event.endAt.getTime());
        }
      }
    }

    // Oxirgi eventdan keyingi qolgan nuqtalar
    const remaining: RoutePoint[] = [];
    while (pointIndex < points.length) {
      remaining.push(points[pointIndex]);
      pointIndex++;
    }

    // Event → Route connector: oxirgi eventdan qolgan nuqtalar uchun
    if (remaining.length >= 1 && sortedEvents.length > 0) {
      const lastEvent = sortedEvents[sortedEvents.length - 1];
      const firstRemaining = remaining[0];
      const gapFromEvent = this.calculateDistance(
        lastEvent.lat,
        lastEvent.lng,
        firstRemaining.lat,
        firstRemaining.lng,
      );
      if (gapFromEvent > 100 && gapFromEvent < 10000 && lastEvent.endAt) {
        remaining.unshift({
          lat: lastEvent.lat,
          lng: lastEvent.lng,
          speed: 0,
          angle: firstRemaining.angle,
          recordedAt: lastEvent.endAt,
        });
      }
      this.pushRouteSegment(timeline, remaining);
    } else if (remaining.length >= 1) {
      this.pushRouteSegment(timeline, remaining);
    }

    // Edge case: eventlar bor lekin route yo'q — eventlarni bo'sh route bilan qaytarish
    if (points.length === 0 && events.length > 0) {
      for (const event of sortedEvents) {
        const { confidence, suspicious } = this.computeEventConfidence(
          event,
          -1,
        );
        timeline.push({
          type: event.type,
          lat: event.lat,
          lng: event.lng,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt?.toISOString() ?? null,
          duration: event.durationSeconds,
          confidence,
          suspicious,
        });
      }
    }

    return timeline;
  }

  /**
   * Route segmentni timeline'ga qo'shish.
   * Pipeline: jitter smooth → simplify (chain filter QILINMAYDI — allaqachon filtered)
   *
   * MUHIM: Segment nuqtalari buildTimeline dan keladi — ular allaqachon
   * filterRouteChain orqali o'tgan. Qayta filter qilish XATO — chunki
   * timeline split dan keyin segmentdagi birinchi nuqta oldingi segmentning
   * oxirgi nuqtasidan uzoq bo'lishi mumkin (event orasidagi masofa).
   */
  private pushRouteSegment(
    timeline: TimelineItem[],
    segment: RoutePoint[],
  ): void {
    if (segment.length === 0) return;

    // A va B nuqtalar — RAW (smooth qilinmagan) birinchi va oxirgi nuqta
    const startPoint = { lat: segment[0].lat, lng: segment[0].lng };
    const endPoint = {
      lat: segment[segment.length - 1].lat,
      lng: segment[segment.length - 1].lng,
    };

    if (segment.length === 1) {
      timeline.push({
        type: 'route',
        points: segment,
        startPoint,
        endPoint,
        distance: 0,
        confidence: 0.3,
      });
      return;
    }

    // Pipeline: jitter → simplify (chain filter YO'Q)
    const jitterSmoothed = this.smoothJitter(segment);
    const simplified = this.simplifyRoute(jitterSmoothed);
    const confidence = this.computeRouteConfidence(jitterSmoothed);

    timeline.push({
      type: 'route',
      points: simplified,
      startPoint,
      endPoint,
      distance: this.calculateSegmentDistanceKm(jitterSmoothed),
      confidence,
    });
  }

  // ─── Confidence scoring ───

  /**
   * Route segment confidence: nuqtalar zichligi (points per km) asosida.
   * Ko'p nuqta = GPS signal yaxshi = yuqori ishonch.
   */
  private computeRouteConfidence(points: RoutePoint[]): number {
    if (points.length === 0) return 0;
    if (points.length === 1) return 0.3;

    const distanceKm = this.calculateSegmentDistanceKm(points);
    if (distanceKm === 0) return points.length > 1 ? 0.5 : 0.3;

    // 20 nuqta/km = ideal Teltonika configuration
    const density = points.length / distanceKm;
    const densityScore = Math.min(density / 20, 1);

    return Math.round(densityScore * 100) / 100;
  }

  /**
   * Event confidence: duration va route uzoqligi asosida.
   * Suspicious: juda qisqa, routedan juda uzoq, yoki route yo'q.
   */
  private computeEventConfidence(
    event: { durationSeconds: number | null; lat: number; lng: number },
    snapDistance: number,
  ): { confidence: number; suspicious: boolean } {
    let confidence = 1;
    let suspicious = false;

    // Duration juda qisqa
    if (
      event.durationSeconds !== null &&
      event.durationSeconds < MOTION.EVENT_MIN_DURATION
    ) {
      confidence -= 0.3;
      suspicious = true;
    }

    // Routedan juda uzoq
    if (snapDistance >= 0) {
      if (snapDistance > MOTION.EVENT_MAX_ROUTE_DIST) {
        confidence -= 0.4;
        suspicious = true;
      } else if (snapDistance > this.routeConfig.maxSnapDistance) {
        confidence -= 0.2;
      }
    }

    // Route umuman yo'q (snap distance = -1)
    if (snapDistance === -1) {
      confidence -= 0.1; // route yo'q = biroz past, lekin xato emas
    }

    return {
      confidence: Math.max(0, Math.round(confidence * 100) / 100),
      suspicious,
    };
  }

  // ─── Nearby points (adaptive time window + binary search) ───

  /**
   * Event atrofidagi route nuqtalarini olish.
   * Adaptive margin: event davomiyligining 50% yoki min 5 minut.
   * Binary search: sorted array'da O(log n) qidiruv.
   */
  private getNearbyPoints(
    allPoints: RoutePoint[],
    routeTimes: number[],
    eventStart: Date,
    eventEnd: Date | null,
  ): RoutePoint[] {
    if (allPoints.length === 0) return [];

    // Adaptive margin: event davomiyligining 50% yoki min 5 minut
    const eventDuration =
      (eventEnd?.getTime() ?? eventStart.getTime()) - eventStart.getTime();
    const margin = Math.max(5 * 60 * 1000, eventDuration * 0.5);

    const rangeStart = eventStart.getTime() - margin;
    const rangeEnd = (eventEnd?.getTime() ?? eventStart.getTime()) + margin;

    // Binary search: start index topish
    let lo = 0;
    let hi = routeTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (routeTimes[mid] < rangeStart) lo = mid + 1;
      else hi = mid;
    }

    // Range ichidagi nuqtalarni yig'ish
    const result: RoutePoint[] = [];
    for (let i = lo; i < allPoints.length; i++) {
      if (routeTimes[i] > rangeEnd) break;
      result.push(allPoints[i]);
    }

    return result;
  }

  // ─── Event merging ───

  /**
   * Ketma-ket eventlarni birlashtirish — lokatsiya-aware.
   *
   * Merge strategiyasi (3 darajali):
   * 1. Qisqa gap (< 120s) → doim merge (lokatsiyadan mustaqil)
   * 2. O'rta gap (< 600s) + bir lokatsiya (< 200m) → merge
   * 3. Uzun gap (600s+) yoki uzoq lokatsiya → merge QILINMAYDI
   *
   * Bu tarzda bir joyda qayta-qayta ignition on/off qilish → bitta event bo'ladi.
   */
  private mergeConsecutiveEvents(
    events: {
      type: string | null;
      startAt: Date;
      endAt: Date | null;
      durationSeconds: number | null;
      lat: number | null;
      lng: number | null;
    }[],
    routePoints: RoutePoint[],
  ) {
    if (events.length <= 1) return events;

    const routeTimes = routePoints.map((p) => new Date(p.recordedAt).getTime());

    const merged: typeof events = [];

    for (const event of events) {
      const prev = merged[merged.length - 1];

      if (!prev) {
        merged.push({ ...event });
        continue;
      }

      const gap = prev.endAt
        ? (event.startAt.getTime() - prev.endAt.getTime()) / 1000
        : 0;

      // Ikki event orasidagi masofa
      const distance =
        prev.lat !== null &&
        prev.lng !== null &&
        event.lat !== null &&
        event.lng !== null
          ? this.calculateDistance(prev.lat, prev.lng, event.lat, event.lng)
          : Infinity;

      // Oradagi route nuqtalarida haqiqiy harakat bormi
      const hasSignificantRoute = this.hasSignificantRouteBetween(
        routePoints,
        routeTimes,
        prev.endAt?.getTime() ?? prev.startAt.getTime(),
        event.startAt.getTime(),
      );

      // Merge qaror:
      const shouldMerge =
        // 1) Juda qisqa gap — noise (ignition bounce)
        (gap <= MOTION.MERGE_SHORT_GAP && !hasSignificantRoute) ||
        // 2) O'rta gap + bir lokatsiya — bir joyda qayta parking
        (gap <= MOTION.MERGE_MAX_GAP &&
          distance <= MOTION.MERGE_MAX_DISTANCE);

      if (shouldMerge) {
        // Merge: prev event ni kengaytirish
        prev.endAt = event.endAt;
        prev.durationSeconds = prev.endAt
          ? Math.floor(
              (prev.endAt.getTime() - prev.startAt.getTime()) / 1000,
            )
          : null;
        // Agar biri parking bo'lsa, merged ham parking
        if (event.type === 'parking') prev.type = 'parking';
        // Centroid yangilash (ikki nuqtaning o'rtasi)
        if (
          prev.lat !== null &&
          prev.lng !== null &&
          event.lat !== null &&
          event.lng !== null
        ) {
          prev.lat = (prev.lat + event.lat) / 2;
          prev.lng = (prev.lng + event.lng) / 2;
        }
      } else {
        merged.push({ ...event });
      }
    }

    return merged;
  }

  /**
   * Ikki vaqt orasida HAQIQIY harakat bormi (nafaqat nuqta, balki masofa).
   * Agar route nuqtalari orasida 200m+ masofa bo'lsa = haqiqiy harakat.
   * Agar faqat GPS jitter bo'lsa = harakat emas.
   */
  private hasSignificantRouteBetween(
    routePoints: RoutePoint[],
    routeTimes: number[],
    afterMs: number,
    beforeMs: number,
  ): boolean {
    // Binary search: afterMs dan keyingi birinchi nuqtani topish
    let lo = 0;
    let hi = routeTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (routeTimes[mid] <= afterMs) lo = mid + 1;
      else hi = mid;
    }

    // Oradagi nuqtalarni yig'ish
    const betweenPoints: RoutePoint[] = [];
    for (let i = lo; i < routePoints.length; i++) {
      if (routeTimes[i] >= beforeMs) break;
      betweenPoints.push(routePoints[i]);
    }

    if (betweenPoints.length < 2) return false;

    // Umumiy masofa hisoblash
    let totalDistance = 0;
    for (let i = 1; i < betweenPoints.length; i++) {
      totalDistance += this.calculateDistance(
        betweenPoints[i - 1].lat,
        betweenPoints[i - 1].lng,
        betweenPoints[i].lat,
        betweenPoints[i].lng,
      );
    }

    // 200m+ = haqiqiy harakat
    return totalDistance > MOTION.MERGE_MAX_DISTANCE;
  }

  /**
   * Binary search: ikki vaqt orasida route nuqtasi bormi.
   * O(log n) — .some() O(n) o'rniga.
   */
  private hasRoutePointBetween(
    sortedTimes: number[],
    afterMs: number,
    beforeMs: number,
  ): boolean {
    // afterMs dan keyingi birinchi elementni topish
    let lo = 0;
    let hi = sortedTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedTimes[mid] <= afterMs) lo = mid + 1;
      else hi = mid;
    }

    // Topilgan element beforeMs dan oldinmi?
    return lo < sortedTimes.length && sortedTimes[lo] < beforeMs;
  }

  private clipEventsToRange(
    events: {
      type: string | null;
      startAt: Date;
      endAt: Date | null;
      durationSeconds: number | null;
      lat: number | null;
      lng: number | null;
    }[],
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    return events.map((e) => {
      const clippedStart = e.startAt < rangeStart ? rangeStart : e.startAt;
      const clippedEnd = e.endAt
        ? e.endAt > rangeEnd
          ? rangeEnd
          : e.endAt
        : null;

      const duration = clippedEnd
        ? Math.floor((clippedEnd.getTime() - clippedStart.getTime()) / 1000)
        : null;

      return {
        ...e,
        startAt: clippedStart,
        endAt: clippedEnd,
        durationSeconds: duration,
      };
    });
  }

  // ─── Geo utils ───

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private calculateSegmentDistanceKm(points: RoutePoint[]): number {
    if (points.length < 2) return 0;
    let totalMeters = 0;
    for (let i = 1; i < points.length; i++) {
      totalMeters += this.calculateDistance(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
    }
    return Math.round((totalMeters / 1000) * 10) / 10;
  }
}
