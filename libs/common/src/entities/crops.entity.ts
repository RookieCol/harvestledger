import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FarmEntity } from './farms.entity';

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
}
