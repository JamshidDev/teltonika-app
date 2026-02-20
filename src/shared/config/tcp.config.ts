// src/config/tcp.config.ts
import { Configuration, Value } from '@itgorillaz/configify';

@Configuration()
export class TcpConfig {
  @Value('TCP_PORT')
  port: number = 5027;

  @Value('TCP_HOST')
  host: string = '0.0.0.0';
}