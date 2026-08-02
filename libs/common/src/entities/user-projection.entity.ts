import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Local, read-only projection of the subset of `auth`'s UserEntity that
// `farms` needs (report ownership metadata, admin-role check). Kept in sync by
// consuming `user.created`/`user.updated` events emitted from auth's own
// transactional outbox — never written to directly by farms' own code paths.
// `id` is NOT a generated column: it is the id assigned by auth, applied via
// upsert.
@Entity('user_projection')
export class UserProjectionEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  lastName: string | null;

  @Column()
  email: string;

  @Column({ nullable: true })
  rol: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
