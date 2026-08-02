import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

export interface PostgresDBModuleOptions {
  // The migration classes this app's database owns (its own migrations/index.ts).
  migrations: TypeOrmModuleOptions['migrations'];
  // The env var holding this app's own Postgres connection string, e.g.
  // 'AUTH_POSTGRES_URI' or 'FARMS_POSTGRES_URI'.
  uriEnvKey: string;
}

@Module({})
export class PostgresDBModule {
  static forApp(options: PostgresDBModuleOptions): DynamicModule {
    return {
      module: PostgresDBModule,
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            url: configService.get(options.uriEnvKey),
            autoLoadEntities: true,
            // Schema is owned by migrations now, never by synchronize (which can
            // silently drop/alter columns and lose data).
            synchronize: false,
            migrations: options.migrations,
            // Each service now owns its own database, so each can safely run
            // its own migrations on startup — no more shared-instance race.
            migrationsRun: configService.get('DB_RUN_MIGRATIONS') === 'true',
          }),
          inject: [ConfigService],
        }),
      ],
    };
  }
}
