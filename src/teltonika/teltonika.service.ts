// src/teltonika/teltonika.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as net from 'net';
import { TcpConfig } from '@config/tcp.config';
import { Codec8Parser } from './codec8.parser';
import { PositionService } from './position.service';
import {
  POSITION_JOBS,
  POSITION_QUEUE,
  SaveRecordsJobData,
} from '@/teltonika/position.job';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

interface Session {
  imei: string | null;
  carId: number | null;
  buffer: Buffer;
}

@Injectable()
export class TeltonikaService implements OnModuleInit {
  private readonly logger = new Logger('Teltonika');
  private sessions = new Map<net.Socket, Session>();

  constructor(
    private readonly tcpConfig: TcpConfig,
    private readonly codec8Parser: Codec8Parser,
    private readonly positionService: PositionService,
    @InjectQueue(POSITION_QUEUE)
    private readonly positionQueue: Queue<SaveRecordsJobData>,
  ) {}

  onModuleInit() {
    const server = net.createServer((socket) => {
      this.sessions.set(socket, {
        imei: null,
        carId: null,
        buffer: Buffer.alloc(0),
      });
      this.logger.log(`Yangi ulanish: ${socket.remoteAddress}`);

      socket.on('data', (data) => void this.handleData(socket, data));
      socket.on('error', (err) => this.logger.error(err.message));
      socket.on('close', () => {
        const session = this.sessions.get(socket);
        this.logger.log(`Uzildi: ${session?.imei || "noma'lum"}`);
        this.sessions.delete(socket);
      });
    });

    server.listen(this.tcpConfig.port, this.tcpConfig.host, () => {
      this.logger.log(
        `TCP server: ${this.tcpConfig.host}:${this.tcpConfig.port}`,
      );
    });
  }

  private async handleData(socket: net.Socket, data: Buffer) {
    const session = this.sessions.get(socket);
    if (!session) return;

    this.logger.debug(`Data keldi: ${data.length} byte, imei: ${session.imei}`);

    // 1-qadam: IMEI
    if (!session.imei) {
      const imeiLength = data.readUInt16BE(0);
      session.imei = data.subarray(2, 2 + imeiLength).toString('ascii');
      this.logger.log(`IMEI: ${session.imei}`);

      const car = await this.positionService.findCarByImei(session.imei);
      if (!car) {
        this.logger.warn(`Noma'lum IMEI: ${session.imei}`);
        socket.write(Buffer.from([0x00]));
        socket.destroy();
        return;
      }

      session.carId = car.id;
      socket.write(Buffer.from([0x01]));
      return;
    }

    // 2-qadam: Buffer ga yig'ish
    session.buffer = Buffer.concat([session.buffer, data]);

    // To'liq paketlarni parse qilish
    while (session.buffer.length >= 10) {
      const dataLength = session.buffer.readUInt32BE(4);
      const totalLength = 8 + dataLength + 4; // preamble(4) + dataLen(4) + data + CRC(4)

      this.logger.debug(
        `dataLength: ${dataLength}, totalLength: ${totalLength}, buffer: ${session.buffer.length}`,
      );
      // Paket to'liq kelmagan — kutamiz
      if (session.buffer.length < totalLength) break;

      // To'liq paket — ajratib olish
      const packet = session.buffer.subarray(0, totalLength);
      session.buffer = session.buffer.subarray(totalLength);

      try {
        const parsed = this.codec8Parser.parse(packet);
        this.logger.log(`${session.imei}: ${parsed.records.length} ta record`);
        this.logger.log(
          `Codec: 0x${parsed.codecId.toString(16)}, records: ${parsed.records.length}`,
        );

        if (session.carId) {
          await this.positionQueue.add(POSITION_JOBS.SAVE_RECORDS, {
            carId: session.carId,
            records: parsed.records,
          });
        }

        // ACK
        const ack = Buffer.alloc(4);
        ack.writeInt32BE(parsed.records.length);
        socket.write(ack);
      } catch (err) {
        this.logger.error(`Parse xatolik: ${(err as Error).message}`);
        session.buffer = Buffer.alloc(0); // reset
        break;
      }
    }
  }
}
