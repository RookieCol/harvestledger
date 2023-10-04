import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UserEntity } from './user.entity';

export enum FarmState {
  ownnotmorgaged = 1,
  ownmorgaged = 2,
  leased = 3,
}

@Entity('farms')
export class FarmEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;
  @Column()
  location: string;
  @Column()
  state: FarmState;
  @Column()
  area: number;
  @ManyToOne(() => UserEntity, (user) => user.id)
  user: UserEntity;
  
}
