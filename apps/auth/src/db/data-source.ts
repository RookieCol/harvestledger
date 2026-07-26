import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  ActivitiesEntity,
  CropEntity,
  FarmEntity,
  HarvestEntity,
  UserEntity,
  migrations,
} from '@app/common';

/**
 * DataSource for the TypeORM CLI (migration:generate / migration:run), run via
 * ts-node so `@app/common` resolves through tsconfig-paths. POSTGRES_URI comes
 * from the environment. Migrations live in libs/common so they are bundled into
 * every app's build and can also run at startup (see PostgresDBModule).
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.POSTGRES_URI,
  entities: [
    UserEntity,
    FarmEntity,
    CropEntity,
    ActivitiesEntity,
    HarvestEntity,
  ],
  migrations,
  synchronize: false,
});
