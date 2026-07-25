import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FarmEntity } from './farms.entity';
import { ActivitiesEntity } from './activities.entity';
import { HarvestEntity } from './harvest.entity';

@Entity('crops')
export class CropEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  product: string;

  @Column()
  size: number;

  @Column()
  location: string;

  @Column({ nullable: true })
  photo: string;

  @Column()
  sowingDate: string;

  @Column()
  plants: number;

  @ManyToOne(() => FarmEntity, (farm) => farm.crops)
  farm: FarmEntity;

  @OneToMany(() => ActivitiesEntity, (activities) => activities.crop)
  activities: ActivitiesEntity[];

  @OneToMany(() => HarvestEntity, (harvest) => harvest.crop)
  harvest: HarvestEntity[];
}
