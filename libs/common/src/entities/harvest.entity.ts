import { Column, Entity, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CropEntity } from './crops.entity';

@Entity('harvests')
export class HarvestEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  harvestDate: string;
  @Column()
  amount: number;
  @Column()
  unit: string;
  @Column()
  category: string;
  @Column({ nullable: true })
  description: string;
  @OneToMany(() => CropEntity, (crop) => crop.id)
  crop: CropEntity;
}
