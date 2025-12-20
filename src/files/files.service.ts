import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatFile } from '../entities/chat-file.entity';
import { ChatParticipant } from '../entities/chat-participant.entity';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(ChatFile) private filesRepo: Repository<ChatFile>,
    @InjectRepository(ChatParticipant) private partRepo: Repository<ChatParticipant>,
  ) {}

  async createFileRecord(uploaderId: string, { filename, path, mimeType, size, chatId }: { filename: string; path: string; mimeType: string; size: number; chatId?: string | null }) {
    const rec = this.filesRepo.create({
      uploaderId,
      filename,
      path,
      mimeType,
      size,
      chat: chatId ? ({ id: chatId } as any) : null,
      messageId: null,
    });
    return this.filesRepo.save(rec);
  }

  async getFileById(id: string) {
    const f = await this.filesRepo.findOne({ where: { id } });
    if (!f) throw new NotFoundException('File not found');
    return f;
  }

  // Проверка доступа: uploader или участник чата
  async checkAccessToFile(userId: string, fileId: string) {
    const f = await this.filesRepo.findOne({ where: { id: fileId }, relations: ['chat'] });
    if (!f) throw new NotFoundException('File not found');
    if (f.uploaderId === userId) return f;
    if (!f.chat) throw new ForbiddenException('No access');
    const part = await this.partRepo.findOne({ where: { chat: { id: f.chat.id }, userId } });
    if (!part) throw new ForbiddenException('No access to file');
    return f;
  }

  async attachFilesToMessage(fileIds: string[], messageId: string) {
    if (!fileIds || fileIds.length === 0) return;
    await this.filesRepo.createQueryBuilder()
      .update()
      .set({ messageId })
      .where('id = ANY(:ids)', { ids: fileIds })
      .execute();
  }
}
