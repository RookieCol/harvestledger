import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CropEntity } from './crops.entity';

export enum FarmState {
  ownnotmorgaged = 1,
  ownmorgaged = 2,
  leased = 3,
}

@Entity('farms')
// A farm name is unique per owner, not globally — two users may each have a
// farm called "North field".
@Unique(['name', 'userId'])
export class FarmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  location: string;

  @Column({ nullable: true })
  photo: string;

  @Column()
  state: FarmState;

  @Column()
  area: number;

  // Plain FK-shaped column, not a TypeORM relation: `users` lives in a
  // different database (auth's) once split, so there is no engine-level FK
  // and no join. Ownership checks compare this value directly
  // (see OwnershipService); farms' local UserProjectionEntity carries the
  // denormalized profile data for reports.
  @Column()
  userId: number;

  @OneToMany(() => CropEntity, (crop) => crop.farm)
  crops: CropEntity[];
}
