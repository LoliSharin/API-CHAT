import { Entity, Column, PrimaryGeneratedColumn, Unique, CreateDateColumn } from 'typeorm';

@Entity({ name: 'message_read_status' })
@Unique(['messageId', 'userId'])
export class MessageReadStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  messageId: string;

  @Column()
  userId: string;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
