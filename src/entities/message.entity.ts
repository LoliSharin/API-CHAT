import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
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

  @ManyToOne(() => Message, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replyToId' })
  replyTo?: Message | null;

  @Column({ nullable: true })
  replyToId?: string | null;

  @Column({ default: false })
  pinned: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column("text", { nullable: true })
  ciphertextB64: string | null;

  @Column("text", { nullable: true })
  ivB64: string | null;

  @Column("text", { nullable: true })
  tagB64: string | null;

  @Column("int", { nullable: true })
  keyVersion: number | null;
}
