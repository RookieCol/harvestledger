import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { CropEntity } from './crops.entity'; // Make sure CropEntity is imported correctly

export enum FarmState {
  ownnotmorgaged = 1,
  ownmorgaged = 2,
  leased = 3,
}

@Entity('farms')
export class FarmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column()
  location: string;

  @Column({ nullable: true })
  photo: string;

  @Column()
  state: FarmState;

  @Column()
  area: number;

  @ManyToOne(() => UserEntity, (user) => user.id, { eager: true })
  user: UserEntity;

  @OneToMany(() => CropEntity, (crop) => crop.id)
  crops: CropEntity[];
}
