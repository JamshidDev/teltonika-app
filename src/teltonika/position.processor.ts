import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PositionService } from './position.service';
import { SaveRecordsJobData } from '@/teltonika/position.job';
import { TrackingGateway } from '@/shared/gateway/tracking.gateway';
import { Logger } from '@nestjs/common';

@Processor('gps-position')
export class PositionProcessor extends WorkerHost {
  constructor(
    private readonly positionService: PositionService,
    private readonly trackingGateway: TrackingGateway,
  ) {
    super();
  }

  private readonly logger = new Logger('PositionProcessor');

  async process(job: Job<SaveRecordsJobData>) {
    const { carId, records, deviceId } = job.data;
    this.logger.log(`Job boshlandi: ${job.id}`);
    await this.positionService.saveRecords(carId, records, deviceId);
    const last = records[records.length - 1];
    this.trackingGateway.emitCarLocation({
      carId,
      lat: last.lat,
      lng: last.lng,
      speed: last.speed,
      angle: last.angle,
      ignition: last.io.ignition,
      movement: last.io.movement,
    });
  }
}
