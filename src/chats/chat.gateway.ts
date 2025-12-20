import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SessionService } from '../session/session.service';
import { FilesService } from '../files/files.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer() server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly sessionService: SessionService,
    private readonly filesService: FilesService,
  ) {}
  async handleConnection(client: Socket) {
    try {
      const user = await this.sessionService.getUserFromHandshake(client.handshake);
      if (!user) {
        this.logger.warn(`Unauthorized socket attempted to connect: ${client.id}`);
        client.emit('error', { message: 'Unauthorized' });
        return client.disconnect(true);
      }

  
  client.data.userId = user.userId;
  client.data.username = null;

  this.sessionService.addUserSocket(user.userId, client.id);
  this.server.emit('presence.update', { userId: user.userId, status: 'online' });

  this.logger.log(`Socket connected: ${client.id} user:${user.userId}`);
    } catch (err) {
      this.logger.error('Connection handling error', err as any);
      return client.disconnect(true);
    }
  }
  
  async handleDisconnect(client: Socket) {
    const userId: string | undefined = client.data.userId;
    if (!userId) return;
    this.sessionService.removeUserSocket(userId, client.id);
    if (!this.sessionService.isUserOnline(userId)) {
      this.server.emit('presence.update', { userId, status: 'offline' });
    }
    this.logger.log(`Socket disconnected: ${client.id} user:${userId}`);
  }
  //подключение к чату
  @SubscribeMessage('join_chat')
  async onJoinChat(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string }) {
    const userId = client.data.userId;
    if (!userId) throw new ForbiddenException();

    const allowed = await this.chatService.isUserInChat(userId, payload.chatId);
    if (!allowed) {
      client.emit('error', { message: 'Not a participant' });
      return;
    }
    await this.chatService.joinChat(userId, payload.chatId); // idempotent
    client.join(`chat:${payload.chatId}`);
    client.emit('joined_chat', { chatId: payload.chatId });
    this.logger.log(`User ${userId} joined chat ${payload.chatId}`);
  }

  // выход из чата
  @SubscribeMessage('leave_chat')
  async onLeaveChat(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string }) {
    const userId = client.data.userId;
    if (!userId) throw new ForbiddenException();
    await this.chatService.leaveChat(userId, payload.chatId);
    client.leave(`chat:${payload.chatId}`);
    client.emit('left_chat', { chatId: payload.chatId });
    this.logger.log(`User ${userId} left chat ${payload.chatId}`);
  }

  
  // отправка сообщения
  @SubscribeMessage('send_message')
  async onSendMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string; encryptedPayload?: string; metadata?: any }) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    const { chatId, encryptedPayload, metadata } = payload;
    if (!chatId) {
      client.emit('error', { message: 'chatId required' });
      return;
    }

    const allowed = await this.chatService.isUserInChat(userId, chatId);
    if (!allowed) {
      client.emit('error', { message: 'User not in chat' });
      return;
    }

    // валидация вложений
    const attachments: string[] = metadata?.attachments ?? [];
    for (const fileId of attachments) {
      try {
        const f = await this.filesService.getFileById(fileId);
        if (f.uploaderId !== userId && (!f.chat || f.chat.id !== chatId)) {
          client.emit('error', { message: `No access to attachment ${fileId}` });
          return;
        }
      } catch (err) {
        client.emit('error', { message: `Attachment ${fileId} not found` });
        return;
      }
    }

    const buff = encryptedPayload ? Buffer.from(encryptedPayload, 'base64') : null;
    const saved = await this.chatService.createMessage(userId, chatId, buff, metadata || {});

    // бродкаст сообщения
    this.server.to(`chat:${chatId}`).emit('message.new', saved);


    client.emit('message.sent', { id: saved.id, chatId });
  }

 
  // доставка сообщения
  @SubscribeMessage('message_delivered')
  async onMessageDelivered(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string; messageId: string }) {
    const userId = client.data.userId;
    if (!userId) return;

    await this.chatService.markMessageDelivered(payload.messageId, userId);

    this.server.to(`chat:${payload.chatId}`).emit('message.delivered', {
      messageId: payload.messageId,
      userId,
      deliveredAt: new Date().toISOString(),
    });
  }

 
  // чтение сообщения
  @SubscribeMessage('message_read')
  async onMessageRead(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string; messageId: string }) {
    const userId = client.data.userId;
    if (!userId) return;

    await this.chatService.markMessageRead(payload.messageId, userId);

    this.server.to(`chat:${payload.chatId}`).emit('message.read', {
      messageId: payload.messageId,
      userId,
      readAt: new Date().toISOString(),
    });
  }

 
  // начало/остановка набора текста
  @SubscribeMessage('typing.start')
  async onTypingStart(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string }) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`chat:${payload.chatId}`).emit('typing.update', {
      chatId: payload.chatId,
      userId,
      action: 'start',
    });
  }
  @SubscribeMessage('typing.stop')
  async onTypingStop(@ConnectedSocket() client: Socket, @MessageBody() payload: { chatId: string }) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`chat:${payload.chatId}`).emit('typing.update', {
      chatId: payload.chatId,
      userId,
      action: 'stop',
    });
  }
}