import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, ILike, Repository } from 'typeorm';
import { Chat } from '../entities/chat.entity';
import { ChatParticipant } from '../entities/chat-participant.entity';
import { ChatFile } from '../entities/chat-file.entity';
import { Message } from '../entities/message.entity';
import { MessageReaction } from '../entities/message-reaction.entity';
import { FilesService } from '../files/files.service';
import { NotificationService } from '../notifications/notification.service';
import { ChatKeyService } from '../crypto/chat-key.service';
import { CryptoService } from '../crypto/message-crypto.service'; 
import { randomUUID } from "crypto"; 

type CreateChatDto = {
  type: 'single' | 'group';
  title?: string;
  description?: string;
  participants: string[];
};

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat) private readonly chatRepo: Repository<Chat>,
    @InjectRepository(ChatParticipant) private readonly partRepo: Repository<ChatParticipant>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(ChatFile) private readonly fileRepo: Repository<ChatFile>,
    @InjectRepository(MessageReaction) private readonly reactionRepo: Repository<MessageReaction>,
    private readonly filesService: FilesService,
    private readonly notificationService: NotificationService,
    private readonly chatKeyService: ChatKeyService,
    private readonly cryptoService: CryptoService,
  ){}

  async isUserInChat(userId: string, chatId: string) {
    const p = await this.partRepo.findOne({ where: { chat: { id: chatId }, userId } });
    return !!p;
  }

  private async getParticipant(chatId: string, userId: string) {
    return this.partRepo.findOne({ where: { chat: { id: chatId }, userId } });
  }

  private ensureGroup(chat: Chat) {
    if (chat.type !== 'group') {
      throw new ForbiddenException('Action allowed only in group chat');
    }
  }

  private assertCanManageParticipants(actor: ChatParticipant | null) {
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
      throw new ForbiddenException('No rights to manage participants');
    }
  }

  private buildMessageAad(chatId: string, messageId: string, senderId: string, version: number) {
    return `chat:${chatId}|msg:${messageId}|sender:${senderId}|v:${version}`;
  }
  async createChat(ownerId: string, dto: CreateChatDto) {
    if (dto.type === 'single') {
      const other = dto.participants?.[0];
      if (!other) {
        throw new BadRequestException('Other user is required for single chat');
      }

      // ищем существующий single чат между двумя пользователями
      const existing = await this.chatRepo
        .createQueryBuilder('chat')
        .leftJoinAndSelect('chat.participants', 'p')
        .where('chat.type = :type', { type: 'single' })
        .andWhere('p.userId IN (:...uids)', { uids: [ownerId, other] })
        .getMany();

      const found = existing.find((c) => {
        const userIds = c.participants?.map((p) => p.userId) || [];
        return userIds.includes(ownerId) && userIds.includes(other);
      });
      if (found) return found;

      const chat = this.chatRepo.create({
        type: 'single',
        ownerId,
        title: null,
        description: null,
      });
      const savedChat = await this.chatRepo.save(chat);
      
      //здесь мы создаем dek ключ для чата b pfgbcsdftv d ,l
      await this.chatKeyService.createInitialChatKey(chat.id);


      const uniqueParticipants = Array.from(new Set([ownerId, other]));
      const participantsEntities = uniqueParticipants.map((uid) =>
        this.partRepo.create({
          chat: savedChat,
          userId: uid,
          role: uid === ownerId ? 'owner' : 'participant',
        }),
      );
      await this.partRepo.save(participantsEntities);
      return savedChat;
    }

    // group
    const chat = this.chatRepo.create({
      type: 'group',
      ownerId: ownerId,
      title: dto.title ?? null,
      description: dto.description ?? null,
    });
    const savedChat = await this.chatRepo.save(chat);
    const uniqueParticipants = Array.from(new Set([ownerId, ...(dto.participants ?? [])]));
    const participantsEntities = uniqueParticipants.map((uid) =>
      this.partRepo.create({
        chat: savedChat,
        userId: uid,
        role: uid === ownerId ? 'owner' : 'participant',
      }),
    );
    await this.partRepo.save(participantsEntities);
    await this.notificationService.notifyGroupCreated(
      savedChat.id,
      ownerId,
      uniqueParticipants.filter((id) => id !== ownerId),
    );
    return savedChat;

  }

  async createMessage(
    senderId: string,
    chatId: string,
    encryptedPayloadBuffer: Buffer | null,
    metadata: any,
  ) {
    //проверки
    const isIn = await this.isUserInChat(senderId, chatId);
    if (!isIn) throw new ForbiddenException('User not in chat');

    const replyToId = metadata?.replyTo ?? null;
    if (replyToId) {
      const replyMsg = await this.msgRepo.findOne({ where: { id: replyToId }, relations: ['chat'] });
      if (!replyMsg || replyMsg.chat.id !== chatId) {
        throw new ForbiddenException('Reply message not accessible');
      }
    }

    const attachments: string[] = metadata?.attachments || [];
    if (attachments.length > 0) {
      // проверяем, что вложения принадлежат этому чату или загружены пользователем
      const files = await this.fileRepo.find({ where: { id: In(attachments) }, relations: ['chat'] });
      if (files.length !== attachments.length) {
        throw new NotFoundException('One or more attachments not found');
      }
      for (const f of files) {
        if (f.uploaderId !== senderId && (!f.chat || f.chat.id !== chatId)) {
          throw new ForbiddenException(`No access to attachment ${f.id}`);
        }
      }
    }

    // шифрование 
    const messageId = randomUUID();
    const { dek, version } = await this.chatKeyService.getActiveDek(chatId);
    const aad = this.buildMessageAad(chatId, messageId, senderId, version);
    let ciphertextB64: string | null = null;
    let ivB64: string | null = null;
    let tagB64: string | null = null;
    let keyVersion: number | null = null
    if (encryptedPayloadBuffer && encryptedPayloadBuffer.length > 0) {
      const enc = this.cryptoService.encryptBytes(encryptedPayloadBuffer, dek, aad);
      ciphertextB64 = enc.ciphertext.toString("base64");
      ivB64 = enc.iv.toString("base64");
      tagB64 = enc.tag.toString("base64");
      keyVersion = version;
    }

    //запись в бд
    const msg = this.msgRepo.create({
      id: messageId,
      chat: { id: chatId } as any,
      senderId,
      metadata,
      replyTo: replyToId ? ({ id: replyToId } as any) : null,
      replyToId: replyToId ?? null,
      pinned: false,
      ciphertextB64,
      ivB64,
      tagB64,
      keyVersion,
    });

    const saved = await this.msgRepo.save(msg);

    if (attachments && attachments.length > 0) {
      await this.filesService.attachFilesToMessage(attachments, saved.id);
    }

    await this.notificationService.notifyMessageSent(chatId, saved.id, senderId);

    return {
      id: saved.id,
      chatId,
      senderId,
      metadata: saved.metadata,
      createdAt: saved.createdAt,
      payload: encryptedPayloadBuffer ? encryptedPayloadBuffer.toString("base64") : null,
      replyToId: saved.replyToId,
      pinned: saved.pinned,
    };
  }

  async listMessages(
    userId: string,
    chatId: string,
    opts: { limit?: number; before?: string } = {},
  ) {
    const inChat = await this.isUserInChat(userId, chatId);
    if (!inChat) throw new ForbiddenException('User not in chat');

    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.chatId = :chatId', { chatId })
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(limit);

    if (opts.before) {
      const beforeDate = new Date(opts.before);
      if (!Number.isNaN(beforeDate.getTime())) {
        qb.andWhere('m.createdAt < :before', { before: beforeDate.toISOString() });
      }
    }

    const rows = await qb.getMany();

    const dekCache = new Map<number, Buffer>();

    const items = await Promise.all(
      rows.map(async (m) => {
        let encryptedPayload: string | null = null;
        if (m.ciphertextB64 && m.ivB64 && m.tagB64 && typeof m.keyVersion === 'number') {
          let dek = dekCache.get(m.keyVersion);
          if (!dek) {
            const res = await this.chatKeyService.getDekByVersion(chatId, m.keyVersion);
            dek = res.dek;
            dekCache.set(m.keyVersion, dek);
          }
          const aad = this.buildMessageAad(chatId, m.id, m.senderId, m.keyVersion);
          const plaintext = this.cryptoService.decryptBytes(
            Buffer.from(m.ciphertextB64, 'base64'),
            dek,
            aad,
            Buffer.from(m.ivB64, 'base64'),
            Buffer.from(m.tagB64, 'base64'),
          );
          encryptedPayload = plaintext.toString('base64');
        }

        return {
          id: m.id,
          chatId,
          senderId: m.senderId,
          metadata: m.metadata,
          createdAt: m.createdAt,
          encryptedPayload,
          replyToId: m.replyToId ?? null,
          pinned: m.pinned,
        };
      }),
    );

    return items;
  }
  
  async joinChat(userId: string, chatId: string) {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    const exists = await this.partRepo.findOne({ where: { chat: { id: chatId }, userId } });
    if (exists) return exists;
    const part = this.partRepo.create({ chat: { id: chatId } as any, userId, role: 'participant' });
    return this.partRepo.save(part);
  }

  async leaveChat(userId: string, chatId: string) {
    const p = await this.partRepo.findOne({ where: { chat: { id: chatId }, userId } });
    if (!p) throw new NotFoundException('Not participant');
    return this.partRepo.remove(p);
  }

  async getChatParticipants(chatId: string) {
    return this.partRepo.find({ where: { chat: { id: chatId } } });
  }

  async markMessageDelivered(messageId: string, userId: string) {
    const msg = await this.msgRepo.findOne({ where: { id: messageId }, relations: ['chat'] });
    if (!msg) throw new NotFoundException('Message not found');
    const inChat = await this.isUserInChat(userId, msg.chat.id);
    if (!inChat) throw new ForbiddenException('User not in chat');
    await this.msgRepo.query(
      `INSERT INTO message_read_status ("messageId", "userId", "readAt", "deliveredAt")
       VALUES ($1, $2, NULL, now())
       ON CONFLICT ("messageId", "userId")
       DO UPDATE SET "deliveredAt" = now()`,
      [messageId, userId],
    );
  }

  async markMessageRead(messageId: string, userId: string) {
    const msg = await this.msgRepo.findOne({ where: { id: messageId }, relations: ['chat'] });
    if (!msg) throw new NotFoundException('Message not found');
    const inChat = await this.isUserInChat(userId, msg.chat.id);
    if (!inChat) throw new ForbiddenException('User not in chat');
    await this.msgRepo.query(
      `INSERT INTO message_read_status ("messageId", "userId", "readAt", "deliveredAt")
       VALUES ($1, $2, now(), now())
       ON CONFLICT ("messageId", "userId")
       DO UPDATE SET "readAt" = now()`,
      [messageId, userId],
    );
  }

  async listChatsForUser(userId: string) {
    const parts = await this.partRepo.find({
      where: { userId },
      relations: ['chat'],
      order: { id: 'ASC' },
    });

    const result = [];
    for (const p of parts) {
      const last = await this.msgRepo.findOne({
        where: { chat: { id: p.chat.id } },
        order: { createdAt: 'DESC' },
      });

      result.push({
        chat: p.chat,
        role: p.role,
        lastMessage: last
          ? {
              id: last.id,
              senderId: last.senderId,
              metadata: last.metadata,
              createdAt: last.createdAt,
              pinned: last.pinned,
            }
          : null,
      });
    }

    return result;
  }

  async addParticipant(chatId: string, actorUserId: string, userIdToAdd: string) {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    this.ensureGroup(chat);

    const actor = await this.getParticipant(chatId, actorUserId);
    this.assertCanManageParticipants(actor);

    const existing = await this.partRepo.findOne({
      where: { chat: { id: chatId }, userId: userIdToAdd },
    });
    if (existing) return existing;

    const part = this.partRepo.create({
      chat: { id: chatId } as any,
      userId: userIdToAdd,
      role: 'participant',
    });
    return this.partRepo.save(part);
  }

  async removeParticipant(chatId: string, actorUserId: string, userIdToRemove: string) {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    this.ensureGroup(chat);

    const actor = await this.getParticipant(chatId, actorUserId);
    if (!actor) throw new ForbiddenException('Actor is not participant');

    const target = await this.partRepo.findOne({
      where: { chat: { id: chatId }, userId: userIdToRemove },
    });
    if (!target) throw new NotFoundException('Participant not found');
    if (target.role === 'owner') {
      throw new ForbiddenException('Cannot remove owner');
    }

    if (actor.role === 'owner') {
      return this.partRepo.remove(target);
    } else if (actor.role === 'admin') {
      if (target.role === 'participant') {
        return this.partRepo.remove(target);
      } else {
        throw new ForbiddenException('Admin cannot remove other admins or owner');
      }
    } else {
      throw new ForbiddenException('No rights to remove participants');
    }
  }

  async setAdmin(chatId: string, actorId: string, userId: string, makeAdmin: boolean) {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    this.ensureGroup(chat);

    const actor = await this.getParticipant(chatId, actorId);
    if (!actor || actor.role !== 'owner') {
      throw new ForbiddenException('Only owner can change admin rights');
    }

    const target = await this.getParticipant(chatId, userId);
    if (!target) throw new NotFoundException('Participant not found');
    if (target.role === 'owner') throw new ForbiddenException('Cannot change owner role');

    target.role = makeAdmin ? 'admin' : 'participant';
    return this.partRepo.save(target);
  }

  async updateGroupInfo(chatId: string, actorId: string, data: { title?: string; description?: string }) {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    this.ensureGroup(chat);

    const actor = await this.getParticipant(chatId, actorId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
      throw new ForbiddenException('No rights to update group');
    }

    chat.title = data.title ?? chat.title;
    chat.description = data.description ?? chat.description;
    return this.chatRepo.save(chat);
  }

  async pinMessage(chatId: string, actorId: string, messageId: string, pin: boolean) {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    this.ensureGroup(chat);

    const actor = await this.getParticipant(chatId, actorId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
      throw new ForbiddenException('No rights to pin messages');
    }

    const msg = await this.msgRepo.findOne({ where: { id: messageId }, relations: ['chat'] });
    if (!msg || msg.chat.id !== chatId) throw new NotFoundException('Message not found');

    msg.pinned = pin;
    await this.msgRepo.save(msg);
    return { id: msg.id, pinned: msg.pinned };
  }

  async addReaction(userId: string, messageId: string, type: string) {
    const msg = await this.msgRepo.findOne({ where: { id: messageId }, relations: ['chat'] });
    if (!msg) throw new NotFoundException('Message not found');

    const inChat = await this.isUserInChat(userId, msg.chat.id);
    if (!inChat) throw new ForbiddenException('User not in chat');

    const existing = await this.reactionRepo.findOne({
      where: { message: { id: messageId }, userId, type },
    });
    if (existing) return existing;

    const reaction = this.reactionRepo.create({
      message: { id: messageId } as any,
      userId,
      type,
    });
    const saved = await this.reactionRepo.save(reaction);
    await this.notificationService.notifyReaction(msg.chat.id, messageId, userId, type, 'add');
    return saved;
  }

  async removeReaction(userId: string, messageId: string, type: string) {
    const msg = await this.msgRepo.findOne({ where: { id: messageId }, relations: ['chat'] });
    if (!msg) throw new NotFoundException('Message not found');
    const inChat = await this.isUserInChat(userId, msg.chat.id);
    if (!inChat) throw new ForbiddenException('User not in chat');
    const existing = await this.reactionRepo.findOne({
      where: { message: { id: messageId }, userId, type },
    });
    if (!existing) return;
    await this.reactionRepo.remove(existing);
    await this.notificationService.notifyReaction(msg.chat.id, messageId, userId, type, 'remove');
  }

  async search(userId: string, query: string) {
    if (!query) return { chats: [], messages: [] };

    const chatIds = (
      await this.partRepo.find({
        where: { userId },
        relations: ['chat'],
      })
    ).map((p) => p.chat.id);

    if (chatIds.length === 0) return { chats: [], messages: [] };

    const chats = await this.chatRepo.find({
      where: [
        { id: In(chatIds), title: ILike(`%${query}%`) },
        { id: In(chatIds), description: ILike(`%${query}%`) },
      ],
    });

    const messages = await this.msgRepo
      .createQueryBuilder('m')
      .where('m.chatId IN (:...chatIds)', { chatIds })
      .andWhere(
        new Brackets((qb) => {
          qb.where("m.metadata ->> 'text' ILIKE :q", { q: `%${query}%` }).orWhere(
            'm.senderId ILIKE :q',
            { q: `%${query}%` },
          );
        }),
      )
      .orderBy('m.createdAt', 'DESC')
      .limit(50)
      .getMany();

    return { chats, messages };
  }
}
