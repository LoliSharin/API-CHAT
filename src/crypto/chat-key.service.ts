import { Injectable } from "@nestjs/common";
import { ChatKeyEntity } from "../entities/chat-key.entity";
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { KeyWrappingService } from "./key-wraped.service";
import { KekService } from "./kek.service";
import { randomBytes } from "crypto";

@Injectable()
export class ChatKeyService {
  private readonly kek: Buffer;
  constructor(
    @InjectRepository(ChatKeyEntity) private readonly chatKeysRepo: Repository<ChatKeyEntity>,
    private readonly keyWrappingService: KeyWrappingService,
    private readonly kekService: KekService,
  ) {
    this.kek = this.kekService.getKek();
  }
  private wrapAad(chatId: string, version: number): string {
    return `chat:${chatId}|keyVersion:${version}`;
  }
  async createInitialChatKey(chatId: string){
    // в случае если ключь есть в бд 
    const existing = await this.chatKeysRepo.findOne({ where: { chatId } });
    if (existing) throw new Error("Chat key уже существует");

    const dek = randomBytes(32);

    const wrappedKey = this.keyWrappingService.wrapKey(
      dek,
      this.kek,
      this.wrapAad(chatId, 1),
    );

    // сохраняем ключ dek в БД
    await this.chatKeysRepo.save({
      chatId,
      version: 1,
      wrappedKeyB64: wrappedKey.wrapped_key_b64,
      wrapIvB64: wrappedKey.wrap_iv_b64,
      wrapTagB64: wrappedKey.wrap_tag_b64,
      isActive: true,
    });
  }

  async getActiveDek(chatId: string): Promise<{ dek: Buffer; version: number }> {
    const row = await this.chatKeysRepo.findOne({
      where: { chatId, isActive: true },
      select: ["version", "wrappedKeyB64", "wrapIvB64", "wrapTagB64"],
    });
    if (!row) throw new Error("Chat key не найдет");
    const dek = this.keyWrappingService.unwrapKey(
      {
        wrapped_key_b64: row.wrappedKeyB64,
        wrap_iv_b64: row.wrapIvB64,
        wrap_tag_b64: row.wrapTagB64,
      },
      this.kek,
      `chat:${chatId}|keyVersion:${row.version}`,
    );
    return { dek, version: row.version };
  }
  async getDekByVersion(chatId: string, version: number): Promise<{ dek: Buffer; version: number }> {
    const row = await this.chatKeysRepo.findOne({
        where: { chatId, version },
        select: ["version", "wrappedKeyB64", "wrapIvB64", "wrapTagB64"],
      });

    if (!row) throw new Error(`Chat key не найдет по версии=${version}`);

    const dek = this.keyWrappingService.unwrapKey(
      {
        wrapped_key_b64: row.wrappedKeyB64,
        wrap_iv_b64: row.wrapIvB64,
        wrap_tag_b64: row.wrapTagB64,
      },
        this.kek,
        this.wrapAad(chatId, row.version),
      );
    return { dek, version: row.version };
  }
}
