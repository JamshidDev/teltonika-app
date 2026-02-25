import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PositionService } from './position.service';
import { SaveRecordsJobData } from '@/teltonika/position.job';
import { Logger } from '@nestjs/common';

@Processor('gps-position')
export class PositionProcessor extends WorkerHost {
  constructor(
    private readonly positionService: PositionService,
  ) {
    super();
  }

  private readonly logger = new Logger('PositionProcessor');

  async process(job: Job<SaveRecordsJobData>) {
    const { carId, records, deviceId, bytesReceived } = job.data;
    this.logger.log(`Job boshlandi: ${job.id}`);
    await this.positionService.saveRecords(
      carId,
      records,
      deviceId,
      bytesReceived,
    );
  }
}
