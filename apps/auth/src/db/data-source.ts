import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { OutboxEntity, UserEntity } from '@app/common';
import { migrations } from './migrations';

/**
 * DataSource for the TypeORM CLI (migration:generate / migration:run), run via
 * ts-node so `@app/common` resolves through tsconfig-paths. AUTH_POSTGRES_URI
 * comes from the environment. Migrations live alongside this file so they are
 * bundled into auth's build and can also run at startup (see PostgresDBModule).
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.AUTH_POSTGRES_URI,
  entities: [UserEntity, OutboxEntity],
  migrations,
  synchronize: false,
});
