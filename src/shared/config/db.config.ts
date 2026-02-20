
import { Configuration, Value } from '@itgorillaz/configify';

@Configuration()
export class DbConfig {
  @Value('DB_HOST')
  host: string = 'localhost';

  @Value('DB_PORT')
  port: number = 5432;

  @Value('DB_USER')
  user: string = 'postgres';

  @Value('DB_PASSWORD')
  password: string = 'password';

  @Value('DB_NAME')
  database: string = 'teltonika_db';
}