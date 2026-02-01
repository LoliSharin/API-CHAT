import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_public_keys')
@Index(['userId'])
@Index(['userId', 'isActive'])
export class UserPublicKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('text')
  publicKeyPem: string;

  @Column('text', { nullable: true })
  keyId: string | null;

  @Column('boolean', { default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
