import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { CropEntity } from './crops.entity';

@Entity('activities')
export class ActivitiesEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  photo: string;

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  inputDate: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  manufactureLocation: string;

  @Column({ nullable: true })
  appRatio: string;

  @Column({ nullable: true })
  appMethod: string;

  @Column({ nullable: true })
  comment: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  bioName: string;

  @Column({ nullable: true })
  bioType: string;

  @ManyToOne(() => CropEntity, (crop) => crop.activities)
  crop: CropEntity;
}
