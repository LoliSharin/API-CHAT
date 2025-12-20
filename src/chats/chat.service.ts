import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Chat } from '../entities/chat.entity';
import { ChatParticipant } from '../entities/chat-participant.entity';
import { Message } from '../entities/message.entity';
import { ChatFile } from '../entities/chat-file.entity';
import { FilesService } from '../files/files.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat) private chatRepo: Repository<Chat>,
    @InjectRepository(ChatParticipant) private partRepo: Repository<ChatParticipant>,
    @InjectRepository(Message) private msgRepo: Repository<Message>,
    @InjectRepository(ChatFile) private fileRepo: Repository<ChatFile>,
    private readonly filesService: FilesService,
  ) {}

  
  async isUserInChat(userId: string, chatId: string) {
    const p = await this.partRepo.findOne({ where: { chat: { id: chatId }, userId } });
    return !!p;
  }

  async createChat(
    ownerId: string,
    dto: {
      type: 'single' | 'group';
      title?: string; 
      description?: string; 
      participants: string[];
    }){
    // контракт вроде перед созданием чата
    if (dto.type === 'single'){
      const other = dto.participants?.[0]
      if (!other){
        throw new Error('нету чата в базе данных');
      }
      const existing = await this.partRepo.find({
        where: {userId: In([ownerId, other])},
        relations:['chat']
      }) 
      const found = existing
      .map(p => p.chat)
      .find(c => c.type === 'single') 
      if(found) return found;   
      //создаем чат в базе
      const chat = this.chatRepo.create({
        type: dto.type,
        title: dto.title ?? null,
        description: dto.description ?? null
      })
      const savedChat = await this.chatRepo.save(chat);
      const uniqueParticipants =Array.from(new Set([ownerId, ...(dto.participants ??[])]))
      const participantsEntites = uniqueParticipants.map(uid =>
        this.partRepo.create({
          chat:savedChat,
          userId: uid,
          role: uid == ownerId ? 'owner' : dto.type === 'group' ? 'participant' : 'participant'
        })
      );await this.partRepo.save(participantsEntites);
      return{
        chat: savedChat,
        participants: participantsEntites
      };
    }
      
  }

  async createMessage(senderId: string, chatId: string, encryptedPayloadBuffer: Buffer | null, metadata: any) {
    const isIn = await this.isUserInChat(senderId, chatId);
    if (!isIn) throw new ForbiddenException('User not in chat');

    const msg = this.msgRepo.create({
      chat: { id: chatId } as any,
      senderId,
      encryptedPayload: encryptedPayloadBuffer,
      metadata
    });
    const saved = await this.msgRepo.save(msg);

    const attachments: string[] = metadata?.attachments || [];
    if (attachments && attachments.length > 0) {
      await this.filesService.attachFilesToMessage(attachments, saved.id);
    }

    return {
      id: saved.id,
      chatId,
      senderId,
      metadata: saved.metadata,
      createdAt: saved.createdAt,
      encryptedPayload: encryptedPayloadBuffer ? encryptedPayloadBuffer.toString('base64') : null
    };
  }
  async joinChat(userId: string, chatId: string) {
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
    
    const msg = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('не существует такого сообщения');
    await this.msgRepo.query(
      `INSERT INTO message_read_status (message_id, user_id, read_at, delivered_at)
       VALUES ($1, $2, NULL, now())
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET delivered_at = now()`,
      [messageId, userId],
    );
  }

  async markMessageRead(messageId: string, userId: string) {
    const msg = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('не существует такого сообщения');
    await this.msgRepo.query(
      `INSERT INTO message_read_status (message_id, user_id, read_at, delivered_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET read_at = now()`,
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
          }
        : null,
    });
  }

  return result;
}


//Добавить участника в чат (групповой).
//Право: только owner или admin могут добавлять (в простом варианте) и удалаять тоже.

async addParticipant(chatId: string, actorUserId: string, userIdToAdd: string) {
  // Проверяем, что чат существует
  const chat = await this.chatRepo.findOne({ where: { id: chatId } });
  if (!chat) throw new NotFoundException('Chat not found');

  if (chat.type !== 'group') {
    throw new ForbiddenException('Cannot add participants to single chat');
  }

  // Проверяем права актёра
  const actor = await this.partRepo.findOne({
    where: { chat: { id: chatId }, userId: actorUserId },
  });
  if (!actor) throw new ForbiddenException('Actor is not participant');
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    throw new ForbiddenException('No rights to add participants');
  }

  // Не добавляем, если уже есть
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


//Удалить участника из чата.
async removeParticipant(chatId: string, actorUserId: string, userIdToRemove: string) {
  const chat = await this.chatRepo.findOne({ where: { id: chatId } });
  if (!chat) throw new NotFoundException('Chat not found');

  if (chat.type !== 'group') {
    throw new ForbiddenException('Cannot remove participants from single chat');
  }

  const actor = await this.partRepo.findOne({
    where: { chat: { id: chatId }, userId: actorUserId },
  });
  if (!actor) throw new ForbiddenException('Actor is not participant');

  // Найдём цель
  const target = await this.partRepo.findOne({
    where: { chat: { id: chatId }, userId: userIdToRemove },
  });
  if (!target) throw new NotFoundException('Participant not found');
  if (target.role === 'owner') {
    throw new ForbiddenException('Cannot remove owner');
  }

  // Разрешаем:
  //  Owner может удалить любого (кроме себя, выше проверка)
  //  Admin может удалить только participant (не другого admin и не owner)
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
}
