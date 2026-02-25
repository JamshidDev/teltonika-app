import { GpsRecord } from './codec8.parser';

export const POSITION_QUEUE = 'gps-position';

export const POSITION_JOBS = {
  SAVE_RECORDS: 'save-records',
} as const;

export interface SaveRecordsJobData {
  carId: number;
  deviceId: number;
  bytesReceived: number;
  records: GpsRecord[];
}
