import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PositionService } from './position.service';
import { MotionStateService } from './motion-state.service';
import { SaveRecordsJobData } from '@/teltonika/position.job';
import { Logger } from '@nestjs/common';
import { GpsRecord } from '@/teltonika/codec8.parser';

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

    const recordDate = new Date(record.timestamp);
    if (recordDate.getFullYear() < 2026) return false;

    return recordDate.getTime() <= Date.now() + 3600000;
  }

  async process(job: Job<SaveRecordsJobData>) {
    const { carId, records, deviceId, bytesReceived } = job.data;

    const validRecords = records.filter((r) => {
      if (!this.isValidRecord(r)) {
        this.logger.warn(
          `Noto'g'ri record: carId=${carId}, lat=${r.lat}, lng=${r.lng}, ` +
            `ignition=${r.io.ignition}, time=${r?.timestamp.toISOString()} — skip`,
        );
        return false;
      }
      return true;
    });

    if (validRecords.length === 0) {
      this.logger.warn(
        `carId=${carId}: barcha ${records.length} ta record noto'g'ri, job skip`,
      );
      return;
    }

    if (validRecords.length < records.length) {
      this.logger.warn(
        `carId=${carId}: ${records.length - validRecords.length}/${records.length} ta record filtrlandi`,
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
      await this.motionStateService.processRecords(carId, validRecords);
    } catch (error) {
      this.logger.error(`MotionState xato: carId=${carId}`, error);
    }
  }
}
