import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { Request } from 'express';

class CreateChatDto {
  type: 'single' | 'group';
  title?: string;
  description?: string;
  participants: string[];
}
class AddParticipantDto {
  userId: string;
}
class SendMessageDto{
  encryptedPayload?: string; // 64 база
  metadata?: any;
}

@Controller('api/chats')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}
   // Создание чата
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createChat(@Body() dto: CreateChatDto, @Req() req: Request) {
    const user = (req as any).user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.createChat(user.id, dto);
  }
  // Получить список чатов пользователя
  @Get()
  async getChats(@Req() req: Request) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.listChatsForUser(user.id);
  }
  //подключение юзера к чату
  @Post(':chatId/join')
  async joinChat(
    @Param('chatId')
    chatId:string,
    @Req()
    req:Request
  ){
    const user =req.user;
    if(!user) throw new ForbiddenException("Неавторизован")
    return this.chatService.joinChat(user.id, chatId);
  }
  //покинуть чат
  @Post(':chatId/leave')
  async leaveChat(@Param('chatId') chatId: string, @Req() req: Request){
    const user = req.user;
    if(!user)throw new ForbiddenException("Неавторизован")
    return this.chatService.leaveChat(user.id, chatId);
  }

  // Добавить участника в групповой чат
  @Post(':chatId/participants')
  async addParticipant(
    @Param('chatId') chatId: string,
    @Body() body: AddParticipantDto,
    @Req() req: Request
  ) {
    const actor = (req as any).user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.addParticipant(chatId, actor.id, body.userId);
  }
  // Получить участников чата
  @Get(':chatId/participants')
  async getParticipants(@Param('chatId') chatId: string) {
    return this.chatService.getChatParticipants(chatId);
  }

  // Отправка сообщения
  @Post(':chatId/messages')
  async sendMessage(
    @Param('chatId') chatId: string,
    @Body() body: SendMessageDto,
    @Req() req: Request
  ) {
    const user = (req as any).user;
    if (!user) throw new ForbiddenException('Unauthorized');
    const buffer = body.encryptedPayload
      ? Buffer.from(body.encryptedPayload, 'base64')
      : null;
    return this.chatService.createMessage(user.id, chatId, buffer, body.metadata);
  }

  // Статус доставки
  @Post('messages/:messageId/delivered')
  async markDelivered(
    @Param('messageId') messageId: string,
    @Req() req: Request
  ) {
    const user = (req as any).user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.markMessageDelivered(messageId, user.id);
  }

  // Статус прочтения
  @Post('messages/:messageId/read')
  async markRead(
    @Param('messageId') messageId: string,
    @Req() req: Request
  ) {
    const user = (req as any).user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.markMessageRead(messageId, user.id);
  }
  // Уделине юзера из чата
  @Delete(':chatId/participant/:userId')
  async removeParticipant(@Param('chatId') chatId: string, @Param('userId') userIdToRemove:string, @Req() req: Request){
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.removeParticipant(chatId, actor.id, userIdToRemove);
  }
  
}