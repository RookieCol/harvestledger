import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { CropEntity } from './crops.entity'; // Make sure CropEntity is imported correctly

export enum FarmState {
  ownnotmorgaged = 1,
  ownmorgaged = 2,
  leased = 3,
}

@Entity('farms')
// A farm name is unique per owner, not globally — two users may each have a
// farm called "North field".
@Unique(['name', 'user'])
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

  @ManyToOne(() => UserEntity, (user) => user.farms, { eager: true })
  user: UserEntity;

  @OneToMany(() => CropEntity, (crop) => crop.farm)
  crops: CropEntity[];
}
