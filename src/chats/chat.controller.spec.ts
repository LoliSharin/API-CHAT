import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  let controller: ChatController;
  let service: jest.Mocked<ChatService>;

  const serviceMock = (): jest.Mocked<ChatService> =>
    ({
      createChat: jest.fn(),
      listChatsForUser: jest.fn(),
      joinChat: jest.fn(),
      leaveChat: jest.fn(),
      addParticipant: jest.fn(),
      getChatParticipants: jest.fn(),
      createMessage: jest.fn(),
      markMessageDelivered: jest.fn(),
      markMessageRead: jest.fn(),
      removeParticipant: jest.fn(),
      updateGroupInfo: jest.fn(),
      setAdmin: jest.fn(),
      addReaction: jest.fn(),
      removeReaction: jest.fn(),
      pinMessage: jest.fn(),
      deleteMessage: jest.fn(),
      getChatKeyForUser: jest.fn(),
      search: jest.fn(),
    }) as any;

  const makeReq = (userId?: string) =>
    ({
      user: userId ? { id: userId } : undefined,
    } as unknown as Request);

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: serviceMock() }],
    }).compile();

    controller = module.get(ChatController);
    service = module.get(ChatService) as jest.Mocked<ChatService>;
  });

  it('создает чат', async () => {
    (service.createChat as jest.Mock).mockResolvedValue({ id: 'c1' });
    const res = await controller.createChat({ type: 'group', participants: [] }, makeReq('u1'));
    expect(res).toEqual({ id: 'c1' });
  });

  it('кидает Forbidden если нет пользователя', async () => {
    await expect(controller.createChat({ type: 'group', participants: [] }, makeReq())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('отправляет сообщение', async () => {
    (service.createMessage as jest.Mock).mockResolvedValue({ id: 'm1' });
    const res = await controller.sendMessage(
      'c1',
      {
        ciphertextB64: Buffer.from('x').toString('base64'),
        ivB64: Buffer.alloc(12).toString('base64'),
        tagB64: Buffer.alloc(16).toString('base64'),
        keyVersion: 1,
        metadata: {},
      },
      makeReq('u1'),
    );
    expect(service.createMessage).toHaveBeenCalledWith(
      'u1',
      'c1',
      {
        ciphertextB64: expect.any(String),
        ivB64: expect.any(String),
        tagB64: expect.any(String),
        keyVersion: 1,
      },
      {},
    );
    expect(res).toEqual({ id: 'm1' });
  });

  it('поиск требует авторизации', async () => {
    await expect(controller.search('hi', makeReq())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('добавляет реакцию', async () => {
    (service.addReaction as jest.Mock).mockResolvedValue({ ok: true });
    await controller.addReaction('m1', { type: 'like' }, makeReq('u1'));
    expect(service.addReaction).toHaveBeenCalledWith('u1', 'm1', 'like');
  });
});
