import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { CropEntity } from './crops.entity'; // Asegúrate de importar correctamente CropEntity

export enum FarmState {
  ownnotmorgaged = 1,
  ownmorgaged = 2,
  leased = 3,
}

@Entity('farms')
export class FarmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  location: string;

  @Column()
  state: FarmState;

  @Column()
  area: number;

  @ManyToOne(() => UserEntity, (user) => user.id,{eager: true})
  user: UserEntity;

  @OneToMany(() => CropEntity, (crop) => crop.id)
  crops: CropEntity[];
}
