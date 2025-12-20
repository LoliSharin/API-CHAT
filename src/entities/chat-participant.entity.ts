import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Chat } from './chat.entity';

@Entity('chat_participants')
export class ChatParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ default: 'participant' })
  role: 'owner' | 'admin' | 'participant';

  @ManyToOne(() => Chat, (c) => c.participants, { onDelete: 'CASCADE' })
  chat: Chat;
}