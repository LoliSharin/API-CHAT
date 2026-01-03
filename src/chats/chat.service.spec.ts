import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { ChatService } from './chat.service';
import { Chat } from '../entities/chat.entity';
import { ChatParticipant } from '../entities/chat-participant.entity';
import { ChatFile } from '../entities/chat-file.entity';
import { Message } from '../entities/message.entity';
import { MessageReaction } from '../entities/message-reaction.entity';
import { FilesService } from '../files/files.service';
import { NotificationService } from '../notifications/notification.service';

type RepoMock<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const repoMock = <T>(): RepoMock<T> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  query: jest.fn(),
});

const filesServiceMock = (): jest.Mocked<FilesService> =>
  ({
    attachFilesToMessage: jest.fn(),
    createFileRecord: jest.fn(),
    checkAccessToFile: jest.fn(),
    getFileById: jest.fn(),
  }) as any;

const notificationServiceMock = (): jest.Mocked<NotificationService> =>
  ({
    notifyMessageSent: jest.fn(),
    notifyGroupCreated: jest.fn(),
    notifyReaction: jest.fn(),
  }) as any;

describe('ChatService', () => {
  let service: ChatService;
  let chatRepo: RepoMock<Chat>;
  let partRepo: RepoMock<ChatParticipant>;
  let msgRepo: RepoMock<Message>;
  let fileRepo: RepoMock<ChatFile>;
  let reactionRepo: RepoMock<MessageReaction>;
  let filesService: jest.Mocked<FilesService>;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(async () => {
    chatRepo = repoMock();
    partRepo = repoMock();
    msgRepo = repoMock();
    fileRepo = repoMock();
    reactionRepo = repoMock();
    filesService = filesServiceMock();
    notificationService = notificationServiceMock();

    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(Chat), useValue: chatRepo },
        { provide: getRepositoryToken(ChatParticipant), useValue: partRepo },
        { provide: getRepositoryToken(Message), useValue: msgRepo },
        { provide: getRepositoryToken(ChatFile), useValue: fileRepo },
        { provide: getRepositoryToken(MessageReaction), useValue: reactionRepo },
        { provide: FilesService, useValue: filesService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  describe('createChat', () => {
    it('создает single чат если нет существующего', async () => {
      const cb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (chatRepo.createQueryBuilder as jest.Mock).mockReturnValue(cb);
      (chatRepo.create as jest.Mock).mockReturnValue({ id: 'new-chat' });
      (chatRepo.save as jest.Mock).mockResolvedValue({ id: 'chat-1' });
      (partRepo.save as jest.Mock).mockResolvedValue(true);
      (partRepo.create as jest.Mock).mockImplementation((x) => x);

      const result = await service.createChat('u1', {
        type: 'single',
        participants: ['u2'],
      });

      expect(result).toEqual({ id: 'chat-1' });
      expect(partRepo.save).toHaveBeenCalled();
    });

    it('возвращает существующий single чат', async () => {
      const existing = { id: 'c1', participants: [{ userId: 'u1' }, { userId: 'u2' }] } as any;
      const cb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([existing]),
      };
      (chatRepo.createQueryBuilder as jest.Mock).mockReturnValue(cb);

      const result = await service.createChat('u1', {
        type: 'single',
        participants: ['u2'],
      });

      expect(result).toBe(existing);
    });

    it('создает group чат и шлет уведомление', async () => {
      (chatRepo.create as jest.Mock).mockReturnValue({ id: 'new' });
      (chatRepo.save as jest.Mock).mockResolvedValue({ id: 'chat-2' });
      (partRepo.create as jest.Mock).mockImplementation((x) => x);
      (partRepo.save as jest.Mock).mockResolvedValue(true);

      await service.createChat('owner', {
        type: 'group',
        title: 'Test',
        description: 'Desc',
        participants: ['u2', 'u3'],
      });

      expect(notificationService.notifyGroupCreated).toHaveBeenCalledWith(
        'chat-2',
        'owner',
        ['u2', 'u3'],
      );
    });
  });

  describe('createMessage', () => {
    it('создает сообщение и проверяет вложения', async () => {
      jest.spyOn(service, 'isUserInChat').mockResolvedValue(true);
      (fileRepo.find as jest.Mock).mockResolvedValue([
        { id: 'f1', uploaderId: 'u1', chat: { id: 'c1' } },
      ]);
      (msgRepo.create as jest.Mock).mockImplementation((x) => x);
      (msgRepo.save as jest.Mock).mockResolvedValue({
        id: 'm1',
        metadata: { attachments: ['f1'] },
        createdAt: new Date(),
      });

      const result = await service.createMessage('u1', 'c1', Buffer.from('a'), {
        attachments: ['f1'],
      });

      expect(filesService.attachFilesToMessage).toHaveBeenCalledWith(['f1'], 'm1');
      expect(result.id).toBe('m1');
      expect(notificationService.notifyMessageSent).toHaveBeenCalled();
    });

    it('кидает Forbidden если не в чате', async () => {
      jest.spyOn(service, 'isUserInChat').mockResolvedValue(false);
      await expect(
        service.createMessage('u1', 'c1', null, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('reactions', () => {
    it('добавляет реакцию', async () => {
      (msgRepo.findOne as jest.Mock).mockResolvedValue({ id: 'm1', chat: { id: 'c1' } });
      jest.spyOn(service, 'isUserInChat').mockResolvedValue(true);
      (reactionRepo.findOne as jest.Mock).mockResolvedValue(null);
      (reactionRepo.create as jest.Mock).mockImplementation((x) => x);
      (reactionRepo.save as jest.Mock).mockResolvedValue({ id: 'r1' });

      const res = await service.addReaction('u1', 'm1', 'like');

      expect(res).toEqual({ id: 'r1' });
      expect(notificationService.notifyReaction).toHaveBeenCalledWith('c1', 'm1', 'u1', 'like', 'add');
    });

    it('удаляет реакцию и проверяет участие в чате', async () => {
      (msgRepo.findOne as jest.Mock).mockResolvedValue({ id: 'm1', chat: { id: 'c1' } });
      jest.spyOn(service, 'isUserInChat').mockResolvedValue(true);
      (reactionRepo.findOne as jest.Mock).mockResolvedValue({ id: 'r1', message: { id: 'm1' } });
      (reactionRepo.remove as jest.Mock).mockResolvedValue(true);

      await service.removeReaction('u1', 'm1', 'like');

      expect(reactionRepo.remove).toHaveBeenCalled();
      expect(notificationService.notifyReaction).toHaveBeenCalledWith('c1', 'm1', 'u1', 'like', 'remove');
    });
  });

  describe('mark read/delivered', () => {
    it('отклоняет если пользователь не в чате', async () => {
      (msgRepo.findOne as jest.Mock).mockResolvedValue({ id: 'm1', chat: { id: 'c1' } });
      jest.spyOn(service, 'isUserInChat').mockResolvedValue(false);
      await expect(service.markMessageDelivered('m1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('проставляет delivered', async () => {
      (msgRepo.findOne as jest.Mock).mockResolvedValue({ id: 'm1', chat: { id: 'c1' } });
      jest.spyOn(service, 'isUserInChat').mockResolvedValue(true);
      (msgRepo.query as jest.Mock).mockResolvedValue(true);
      await service.markMessageDelivered('m1', 'u1');
      expect(msgRepo.query).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('возвращает пусто если нет чатов', async () => {
      (partRepo.find as jest.Mock).mockResolvedValue([]);
      const res = await service.search('u1', 'hi');
      expect(res).toEqual({ chats: [], messages: [] });
    });
  });
});
