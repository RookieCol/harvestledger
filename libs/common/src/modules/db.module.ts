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

/**
 * Builds this app's TypeORM options from its own env. Exported (rather than
 * inlined into the module) so it can be unit-tested directly — the rules it
 * encodes are the ones a misconfigured deployment trips over.
 */
export function buildPostgresOptions(
  options: PostgresDBModuleOptions,
  configService: Pick<ConfigService, 'get'>,
): TypeOrmModuleOptions {
  // Fail fast, and only for the service that actually owns this database: a
  // missing URI would otherwise surface as a connection error at the first
  // query, long after boot.
  const url = configService.get<string>(options.uriEnvKey);
  if (!url) {
    throw new Error(
      `${options.uriEnvKey} is required: this service owns a Postgres database and cannot start without its connection string.`,
    );
  }

  return {
    type: 'postgres',
    url,
    autoLoadEntities: true,
    // Schema is owned by migrations now, never by synchronize (which can
    // silently drop/alter columns and lose data).
    synchronize: false,
    migrations: options.migrations,
    // Each service now owns its own database, so each can safely run its own
    // migrations on startup — no more shared-instance race.
    migrationsRun: configService.get('DB_RUN_MIGRATIONS') === 'true',
  };
}

@Module({})
export class PostgresDBModule {
  static forApp(options: PostgresDBModuleOptions): DynamicModule {
    return {
      module: PostgresDBModule,
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: (configService: ConfigService) =>
            buildPostgresOptions(options, configService),
          inject: [ConfigService],
        }),
      ],
    };
  }
}
