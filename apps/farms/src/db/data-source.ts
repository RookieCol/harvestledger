import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  ActivitiesEntity,
  CropEntity,
  FarmEntity,
  HarvestEntity,
  OutboxEntity,
  UserProjectionEntity,
} from '@app/common';
import { migrations } from './migrations';

/**
 * DataSource for the TypeORM CLI (migration:generate / migration:run), run via
 * ts-node so `@app/common` resolves through tsconfig-paths. FARMS_POSTGRES_URI
 * comes from the environment. Migrations live alongside this file so they are
 * bundled into farms' build and can also run at startup (see PostgresDBModule).
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.FARMS_POSTGRES_URI,
  entities: [
    FarmEntity,
    CropEntity,
    ActivitiesEntity,
    HarvestEntity,
    OutboxEntity,
    UserProjectionEntity,
  ],
  migrations,
  synchronize: false,
});
