import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { migrations } from '../migrations';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('POSTGRES_URI'),
        autoLoadEntities: true,
        // Schema is owned by migrations now, never by synchronize (which can
        // silently drop/alter columns and lose data).
        synchronize: false,
        migrations,
        // Run pending migrations on startup only where DB_RUN_MIGRATIONS is set.
        // One service (auth) owns this, so services don't race to migrate.
        migrationsRun: configService.get('DB_RUN_MIGRATIONS') === 'true',
      }),

      inject: [ConfigService],
    }),
  ],
})
export class PostgresDBModule {}
