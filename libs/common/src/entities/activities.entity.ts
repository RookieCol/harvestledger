import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { CropEntity } from './crops.entity';

@Entity()
export class ActivitiesEntity {
  @PrimaryGeneratedColumn()
  id: number;

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

  @ManyToMany(() => CropEntity, (crop) => crop.id)
  crop: CropEntity;
  
}
