import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PositionService } from './position.service';
import { SaveRecordsJobData } from '@/teltonika/position.job';
import { Logger } from '@nestjs/common';
import { GpsRecord } from '@/teltonika/codec8.parser';

@Processor('gps-position')
export class PositionProcessor extends WorkerHost {
  constructor(
    private readonly positionService: PositionService,
  ) {
    super();
  }

  private readonly logger = new Logger('PositionProcessor');

  private isValidRecord(record: GpsRecord): boolean {
    if (record.lat === 0 || record.lng === 0) return false;
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

    const validRecords = hydratedRecords.filter((r) => this.isValidRecord(r));

    if (validRecords.length === 0) return;

    this.logger.log(`Job: ${job.id}, carId=${carId}, records=${validRecords.length}`);
    await this.positionService.saveRecords(
      carId,
      validRecords,
      deviceId,
      bytesReceived,
    );
  }
}
