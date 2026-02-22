import { Configuration, Value } from '@itgorillaz/configify';

@Configuration()
export class RedisConfig {
  @Value('REDIS_HOST', { default: '127.0.0.1' })
  host!: string;

  @Value('REDIS_PORT', {
    parse: (v) => parseInt(v as string, 10),
    default: 6379,
  })
  port!: number;
}
