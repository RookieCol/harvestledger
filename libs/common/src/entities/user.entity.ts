import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { FarmEntity } from './farms.entity';
export enum Gender {
  male = 1,
  female = 2,
  other = 3,
}

export enum DocumentType {
  CC = 1,
  NIT = 2,
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ nullable: true })
  rol: string;

  @Column({ nullable: true })
  photo: string;

  @Column({ nullable: true, type: 'enum', enum: Gender })
  gender: number;

  @Column({ nullable: true, type: 'enum', enum: DocumentType })
  documentType: number;

  @Column({ nullable: true })
  documentNumber: number;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  forgotPasswordToken: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  city: string;

  @OneToMany(() => FarmEntity, (farm) => farm.user)
  farms: FarmEntity[];
}
