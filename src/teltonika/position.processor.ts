import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PositionService } from './position.service';
import { MotionStateService } from './motion-state.service';
import { SaveRecordsJobData } from '@/teltonika/position.job';
import { Logger } from '@nestjs/common';
import { GpsRecord } from '@/teltonika/codec8.parser';
import { MOTION } from '@/teltonika/motion-state.constants';

@Processor('gps-position')
export class PositionProcessor extends WorkerHost {
  constructor(
    private readonly positionService: PositionService,
    private readonly motionStateService: MotionStateService,
  ) {
    super();
  }

  private readonly logger = new Logger('PositionProcessor');

  private isValidRecord(record: GpsRecord): boolean {
    if (record.lat === 0 || record.lng === 0) return false;

    if (record.io.ignition === null) return false;

    // Satellite < 2 = GPS fix yo'q (hard discard). 2-3 = low quality (DB ga saqlash)
    if (record.satellites < MOTION.MIN_SATELLITES_SAVE) return false;

    const recordDate = new Date(record.timestamp);
    if (recordDate.getFullYear() < 2026) return false;

    return recordDate.getTime() <= Date.now() + 3600000;
  }

  async process(job: Job<SaveRecordsJobData>) {
    const { carId, records, deviceId, bytesReceived } = job.data;

    // BullMQ JSON serialization: Date → string. Qaytaramiz.
    const hydratedRecords = records.map((r) => ({
      ...r,
      timestamp: new Date(r.timestamp),
    }));

    this.logger.debug(
      `[DEBUG] carId=${carId}: ${hydratedRecords.length} ta record keldi, ` +
        `birinchi: speed=${hydratedRecords[0]?.speed}, ign=${hydratedRecords[0]?.io?.ignition}, ` +
        `lat=${hydratedRecords[0]?.lat}, lng=${hydratedRecords[0]?.lng}`,
    );

    const validRecords = hydratedRecords.filter((r) => {
      if (!this.isValidRecord(r)) {
        this.logger.warn(
          `[FILTER] carId=${carId}: lat=${r.lat}, lng=${r.lng}, ` +
            `ign=${r.io.ignition}, sat=${r.satellites}, speed=${r.speed}, ` +
            `time=${r.timestamp.toISOString()} — SKIP`,
        );
        return false;
      }
      return true;
    });

    if (validRecords.length === 0) {
      this.logger.warn(
        `[FILTER] carId=${carId}: barcha ${hydratedRecords.length} ta record filtrlandi, job skip`,
      );
      return;
    }

    if (validRecords.length < hydratedRecords.length) {
      this.logger.warn(
        `[FILTER] carId=${carId}: ${hydratedRecords.length - validRecords.length}/${hydratedRecords.length} ta record filtrlandi`,
      );
    }

    this.logger.log(`Job boshlandi: ${job.id}`);
    await this.positionService.saveRecords(
      carId,
      validRecords,
      deviceId,
      bytesReceived,
    );

    try {
      this.logger.debug(`[DEBUG] carId=${carId}: motionState.processRecords chaqirilmoqda, ${validRecords.length} ta record`);
      await this.motionStateService.processRecords(carId, validRecords);
      this.logger.debug(`[DEBUG] carId=${carId}: motionState.processRecords tugadi`);
    } catch (error) {
      this.logger.error(`[ERROR] MotionState xato: carId=${carId}`, error);
    }
  }
}
