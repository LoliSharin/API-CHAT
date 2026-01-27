import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { UserService } from './user.service';
import { SessionService } from '../session/session.service';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));

describe('AuthController', () => {
  let controller: AuthController;
  let sessionService: jest.Mocked<SessionService>;
  let userService: jest.Mocked<UserService>;
  let userRepo: { findOne: jest.Mock };

  const makeResponse = () => ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    json: jest.fn((body) => body),
  });

  const makeRequest = (cookieHeader: string) => ({
    headers: { cookie: cookieHeader },
  });

  beforeEach(async () => {
    sessionService = {
      createSessionForUser: jest.fn(),
      destroySession: jest.fn(),
      getUserBySession: jest.fn(),
    } as any;
    userService = {
      createUser: jest.fn(),
    } as any;
    userRepo = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: SessionService, useValue: sessionService },
        { provide: UserService, useValue: userService },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('логинит пользователя и ставит cookie', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      username: 'john',
      passwordHash: 'hash',
      displayName: 'John',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    sessionService.createSessionForUser.mockResolvedValue('sess-1');

    const res = makeResponse();
    const result = await controller.login({ username: 'john', password: 'pwd' }, res as any);

    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { username: 'john' } });
    expect(bcrypt.compare).toHaveBeenCalledWith('pwd', 'hash');
    expect(sessionService.createSessionForUser).toHaveBeenCalledWith('user-1');
    expect(res.cookie).toHaveBeenCalledWith(
      'sessionId',
      'sess-1',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(result).toEqual({
      ok: true,
      user: { id: 'user-1', username: 'john', displayName: 'John' },
    });
  });

  it('бросает Unauthorized если пользователь не найден', async () => {
    userRepo.findOne.mockResolvedValue(null);
    const res = makeResponse();
    await expect(controller.login({ username: 'ghost', password: 'pwd' }, res as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('бросает Unauthorized при неверном пароле', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      username: 'john',
      passwordHash: 'hash',
      displayName: 'John',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const res = makeResponse();
    await expect(controller.login({ username: 'john', password: 'wrong' }, res as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('регистрирует пользователя и ставит cookie', async () => {
    userService.createUser.mockResolvedValue({
      id: 'user-2',
      username: 'alice',
      displayName: 'Alice',
      passwordHash: 'hash',
      createdAt: new Date(),
    });
    sessionService.createSessionForUser.mockResolvedValue('sess-2');
    const res = makeResponse();
    const result = await controller.register({ username: 'alice', password: 'pwd', displayName: 'Alice' }, res as any);

    expect(userService.createUser).toHaveBeenCalledWith('alice', 'pwd', 'Alice');
    expect(sessionService.createSessionForUser).toHaveBeenCalledWith('user-2');
    expect(res.cookie).toHaveBeenCalledWith(
      'sessionId',
      'sess-2',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(result).toEqual({
      ok: true,
      user: { id: 'user-2', username: 'alice', displayName: 'Alice' },
    });
  });

  it('выходит из системы и очищает cookie', async () => {
    sessionService.destroySession.mockResolvedValue(undefined);
    const req = makeRequest('sessionId=sess-3');
    const res = makeResponse();
    const result = await controller.logout(req as any, res as any);

    expect(sessionService.destroySession).toHaveBeenCalledWith('sess-3');
    expect(res.clearCookie).toHaveBeenCalledWith('sessionId', { path: '/' });
    expect(result).toEqual({ ok: true });
  });

  it('ничего не делает если cookie сессии нет', async () => {
    const req = makeRequest('');
    const res = makeResponse();
    const result = await controller.logout(req as any, res as any);

    expect(sessionService.destroySession).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
