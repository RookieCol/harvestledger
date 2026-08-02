import { buildPostgresOptions } from './db.module';

const configOf = (env: Record<string, string | undefined>) =>
  ({ get: (key: string) => env[key] }) as any;

describe('buildPostgresOptions', () => {
  const migrations: any[] = [];

  it('uses the URI of the env key this service was given', () => {
    const options = buildPostgresOptions(
      { migrations, uriEnvKey: 'FARMS_POSTGRES_URI' },
      configOf({
        FARMS_POSTGRES_URI: 'postgresql://user:pass@postgres-farms:5432/farms',
        AUTH_POSTGRES_URI: 'postgresql://user:pass@postgres-auth:5432/auth',
      }),
    );

    // Connecting to the other service's database would defeat the whole split.
    expect(options).toEqual(
      expect.objectContaining({
        url: 'postgresql://user:pass@postgres-farms:5432/farms',
        synchronize: false,
      }),
    );
  });

  // The regression this exists for: the two URIs are optional in the *shared*
  // env schema, because the gateway applies that schema and owns no database.
  // The "cannot boot without your own connection string" guarantee therefore
  // has to live here, or a database-owning service starts happily and only
  // fails at the first query.
  it('refuses to build when this service’s own URI is missing', () => {
    expect(() =>
      buildPostgresOptions(
        { migrations, uriEnvKey: 'AUTH_POSTGRES_URI' },
        // Another service's URI is present; this one's is not.
        configOf({
          FARMS_POSTGRES_URI:
            'postgresql://user:pass@postgres-farms:5432/farms',
        }),
      ),
    ).toThrow('AUTH_POSTGRES_URI is required');
  });

  it('runs migrations only when DB_RUN_MIGRATIONS is exactly "true"', () => {
    const uri = { AUTH_POSTGRES_URI: 'postgresql://u:p@h:5432/d' };
    const build = (env: Record<string, string>) =>
      buildPostgresOptions(
        { migrations, uriEnvKey: 'AUTH_POSTGRES_URI' },
        configOf(env),
      ) as any;

    expect(build(uri).migrationsRun).toBe(false);
    expect(build({ ...uri, DB_RUN_MIGRATIONS: 'false' }).migrationsRun).toBe(
      false,
    );
    expect(build({ ...uri, DB_RUN_MIGRATIONS: 'true' }).migrationsRun).toBe(
      true,
    );
  });
});
