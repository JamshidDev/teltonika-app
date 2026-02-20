import { Global, Module } from '@nestjs/common';
import { ConfigifyModule } from '@itgorillaz/configify';

@Global()
@Module({
  imports: [ConfigifyModule.forRootAsync({})],
})
export class ConfigModule {}
