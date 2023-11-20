import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CropEntity } from './crops.entity';

@Entity('harvests')
export class HarvestEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  photo: string;
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
  @ManyToOne(() => CropEntity, (crop) => crop.id)
  crop: CropEntity;
}
