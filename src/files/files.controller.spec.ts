import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import * as fs from 'fs';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, createReadStream: jest.fn() };
});

describe('FilesController', () => {
  let controller: FilesController;
  let service: jest.Mocked<FilesService>;

  const createServiceMock = (): jest.Mocked<FilesService> =>
    ({
      createFileRecord: jest.fn(),
      checkAccessToFile: jest.fn(),
      getFileById: jest.fn(),
      attachFilesToMessage: jest.fn(),
    }) as any;

  const makeReq = (userId?: string, body?: any) => ({
    user: userId ? { id: userId } : undefined,
    body: body || {},
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: FilesService, useValue: createServiceMock() }],
    }).compile();

    controller = module.get(FilesController);
    service = module.get(FilesService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('загружает файл и создает запись', async () => {
    const file = {
      originalname: 'file.txt',
      path: './uploads/file.txt',
      mimetype: 'text/plain',
      size: 123,
    } as any;
    const saved = {
      id: 'file-1',
      filename: 'file.txt',
      size: 123,
      mimeType: 'text/plain',
      createdAt: new Date(),
      path: './uploads/file.txt',
      uploaderId: 'user-1',
      chat: null,
      messageId: null,
    };
    service.createFileRecord.mockResolvedValue(saved as any);

    const result = await controller.upload(file, makeReq('user-1', { chatId: 'chat-1' }) as any);

    expect(service.createFileRecord).toHaveBeenCalledWith('user-1', {
      filename: 'file.txt',
      path: './uploads/file.txt',
      mimeType: 'text/plain',
      size: 123,
      chatId: 'chat-1',
    });
    expect(result).toEqual({
      id: saved.id,
      filename: saved.filename,
      size: saved.size,
      mimeType: saved.mimeType,
      createdAt: saved.createdAt,
    });
  });

  it('бросает BadRequest если файл не передан', async () => {
    await expect(controller.upload(undefined as any, makeReq('user-1') as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('бросает BadRequest если нет пользователя', async () => {
    const file = {
      originalname: 'file.txt',
      path: './uploads/file.txt',
      mimetype: 'text/plain',
      size: 123,
    } as any;
    await expect(controller.upload(file, makeReq() as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('выдает файл при наличии доступа', async () => {
    const res = {
      setHeader: jest.fn(),
    } as any;
    const streamMock = { pipe: jest.fn() };
    (fs.createReadStream as jest.Mock).mockReturnValue(streamMock as any);
    service.checkAccessToFile.mockResolvedValue({
      id: 'file-1',
      path: '/tmp/file.txt',
      filename: 'file.txt',
      mimeType: 'text/plain',
    } as any);

    await controller.download('file-1', makeReq('user-1') as any, res);

    expect(service.checkAccessToFile).toHaveBeenCalledWith('user-1', 'file-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="file.txt"');
    expect(streamMock.pipe).toHaveBeenCalledWith(res);
  });

  it('бросает BadRequest если нет пользователя при загрузке файла', async () => {
    await expect(controller.download('file-1', makeReq() as any, {} as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('бросает NotFound если файл не найден', async () => {
    service.checkAccessToFile.mockResolvedValue(null as any);
    await expect(controller.download('file-1', makeReq('user-1') as any, {} as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
