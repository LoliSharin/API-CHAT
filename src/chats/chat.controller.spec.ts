import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { CryptoService } from './massage-crypto.service';

describe('ChatController', () => {
  let controller: ChatController;
  let service: jest.Mocked<ChatService>;
  let crypto: jest.Mocked<CryptoService>;

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
      search: jest.fn(),
    }) as any;

  const cryptoMock = (): jest.Mocked<CryptoService> =>
    ({
      getPublicKey: jest.fn().mockReturnValue('PUB'),
      encryptWithPublic: jest.fn(),
      decryptWithPrivate: jest.fn(),
    }) as any;

  const makeReq = (userId?: string) =>
    ({
      user: userId ? { id: userId } : undefined,
    } as unknown as Request);

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: serviceMock() },
        { provide: CryptoService, useValue: cryptoMock() },
      ],
    }).compile();

    controller = module.get(ChatController);
    service = module.get(ChatService) as jest.Mocked<ChatService>;
    crypto = module.get(CryptoService) as jest.Mocked<CryptoService>;
  });

  it('создает чат', async () => {
    (service.createChat as jest.Mock).mockResolvedValue({ id: 'c1' });
    const res = await controller.createChat(
      { type: 'group', participants: [] },
      makeReq('u1'),
    );
    expect(res).toEqual({ id: 'c1' });
  });

  it('кидает Forbidden если нет пользователя', async () => {
    await expect(
      controller.createChat({ type: 'group', participants: [] }, makeReq()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('отправляет сообщение', async () => {
    (service.createMessage as jest.Mock).mockResolvedValue({ id: 'm1' });
    const res = await controller.sendMessage(
      'c1',
      { encryptedPayload: Buffer.from('a').toString('base64'), metadata: {} },
      makeReq('u1'),
    );
    expect(service.createMessage).toHaveBeenCalledWith('u1', 'c1', expect.any(Buffer), {});
    expect(res).toEqual({ id: 'm1' });
  });

  it('возвращает публичный ключ', () => {
    const res = controller.getPublicKey();
    expect(res).toEqual({ publicKey: 'PUB' });
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
