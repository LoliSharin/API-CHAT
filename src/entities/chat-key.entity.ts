import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from "typeorm";

@Entity("chat_keys")
@Unique(["chatId", "version"])
@Index(["chatId", "isActive"])
export class ChatKeyEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  chatId: string;

  @Column("int")
  version: number;

  // dek
  @Column("text")
  wrappedKeyB64: string;

  @Column("text")
  wrapIvB64: string;

  @Column("text")
  wrapTagB64: string;

  @Column("boolean", { default: true })
  isActive: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
