import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
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
  
  @Column()
  sowingDate: string;
  
  @Column()
  plants: number;

  @Column({ default: null })
  metadataLink: string;

  @Column({ default: null })
  nftId: number;
  
  @ManyToOne(() => FarmEntity, (farm) => farm.id)
  farm: FarmEntity;
  
  @OneToMany(() => ActivitiesEntity, (activities) => activities.id)
  activities: ActivitiesEntity[];
  
  @OneToMany(() => HarvestEntity, (harvest) => harvest.id)
  harvest: HarvestEntity[];
}
