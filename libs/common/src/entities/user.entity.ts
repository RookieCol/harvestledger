import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

  @Column()
  lastName: string;

  @Column()
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ nullable: true, type: 'enum', enum: Gender })
  gender: number; // Store gender as a number

  @Column({ nullable: true, type: 'enum', enum: DocumentType })
  documentType: number; // Store documentType as a number

  @Column({ nullable: true })
  documentNumber: number;

  @Column({ type: 'date', nullable: true }) 
  dateOfBirth: Date;

  @Column({ nullable: true }) 
  country: string;

  @Column({ nullable: true }) 
  state: string;

  @Column({ nullable: true }) 
  city: string;
}
