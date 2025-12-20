import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Chat } from './chat.entity';

@Entity({ name: 'messages' })
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Chat)
  chat: Chat;

  @Column()
  senderId: string;

  @Column({ type: 'bytea', nullable: true })
  encryptedPayload: Buffer | null; 

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    text?: string;
    attachments?: string[]; 
    replyTo?: string;
    pinned?: boolean;
    location?: { lat: number; lon: number };
    [key: string]: any;
  } | null;

  @CreateDateColumn()
  createdAt: Date;
}