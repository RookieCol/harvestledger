import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { FarmEntity } from './farms.entity';
import { ActivitiesEntity } from './activities.entity';

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
  @Column()
  sowingDate: Date;
  @Column()
  plants: number;
  @ManyToOne(() => FarmEntity, (farm) => farm.id)
  farm: FarmEntity;
  @OneToMany(() => ActivitiesEntity, (activities) => activities.id)
  activities: ActivitiesEntity[];
}
