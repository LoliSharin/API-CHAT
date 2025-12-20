import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Chat } from './chat.entity';

@Entity({ name: 'chat_files' })
export class ChatFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  uploaderId: string;

  @ManyToOne(() => Chat, { nullable: true })
  chat: Chat | null;

  @Column({ nullable: true })
  messageId: string | null; // привязка к сообщению после отправки

  @Column()
  filename: string;

  @Column()
  path: string;

  @Column()
  mimeType: string;

  @Column('int')
  size: number;

  @CreateDateColumn()
  createdAt: Date;
}