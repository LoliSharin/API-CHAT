import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, CreateDateColumn } from 'typeorm';
import { Message } from './message.entity';

@Entity({ name: 'message_reactions' })
@Unique(['message', 'userId', 'type'])
export class MessageReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE' })
  message: Message;

  @Column()
  userId: string;

  @Column()
  type: string;

  @CreateDateColumn()
  createdAt: Date;
}
