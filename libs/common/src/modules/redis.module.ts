import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from '../services/redis.service';

/**
 * Global Redis module. Provides a single shared ioredis client (built from
 * REDIS_URL) and the RedisService wrapper. Global so any service can inject
 * RedisService without re-importing the module.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const url =
          configService.get<string>('REDIS_URL') ?? 'redis://redis:6379';
        return new Redis(url, { maxRetriesPerRequest: null });
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
