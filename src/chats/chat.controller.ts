import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  Param,
  Delete,
  Patch,
  Query,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { Request } from 'express';
import { CryptoService } from '../crypto/massage-crypto.service';

class CreateChatDto {
  type: 'single' | 'group';
  title?: string;
  description?: string;
  participants: string[];
}
class AddParticipantDto {
  userId: string;
}
class SendMessageDto {
  encryptedPayload?: string;
  metadata?: any;
}
class ReactionDto {
  type: string;
}
class UpdateGroupDto {
  title?: string;
  description?: string;
}

@Controller('api/chats')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly cryptoService: CryptoService,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createChat(@Body() dto: CreateChatDto, @Req() req: Request) {
    const user = (req as any).user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.createChat(user.id, dto);
  }

  @Get()
  async getChats(@Req() req: Request) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.listChatsForUser(user.id);
  }

  @Post(':chatId/join')
  async joinChat(@Param('chatId') chatId: string, @Req() req: Request) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.joinChat(user.id, chatId);
  }

  @Post(':chatId/leave')
  async leaveChat(@Param('chatId') chatId: string, @Req() req: Request) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.leaveChat(user.id, chatId);
  }

  @Post(':chatId/participants')
  async addParticipant(
    @Param('chatId') chatId: string,
    @Body() body: AddParticipantDto,
    @Req() req: Request,
  ) {
    const actor = (req as any).user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.addParticipant(chatId, actor.id, body.userId);
  }

  @Get(':chatId/participants')
  async getParticipants(@Param('chatId') chatId: string) {
    return this.chatService.getChatParticipants(chatId);
  }

  @Post(':chatId/messages')
  async sendMessage(
    @Param('chatId') chatId: string,
    @Body() body: SendMessageDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    if (!user) throw new ForbiddenException('Unauthorized');
    const buffer = body.encryptedPayload ? Buffer.from(body.encryptedPayload, 'base64') : null;
    return this.chatService.createMessage(user.id, chatId, buffer, body.metadata);
  }

  @Post('messages/:messageId/delivered')
  async markDelivered(@Param('messageId') messageId: string, @Req() req: Request) {
    const user = (req as any).user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.markMessageDelivered(messageId, user.id);
  }

  @Post('messages/:messageId/read')
  async markRead(@Param('messageId') messageId: string, @Req() req: Request) {
    const user = (req as any).user;
    if (!user) throw new ForbiddenException('Unauthorized');
    return this.chatService.markMessageRead(messageId, user.id);
  }

  @Delete(':chatId/participant/:userId')
  async removeParticipant(
    @Param('chatId') chatId: string,
    @Param('userId') userIdToRemove: string,
    @Req() req: Request,
  ) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.removeParticipant(chatId, actor.id, userIdToRemove);
  }

  @Patch(':chatId')
  async updateGroup(@Param('chatId') chatId: string, @Body() body: UpdateGroupDto, @Req() req: Request) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.updateGroupInfo(chatId, actor.id, body);
  }

  @Post(':chatId/admins/:userId')
  async addAdmin(@Param('chatId') chatId: string, @Param('userId') userId: string, @Req() req: Request) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.setAdmin(chatId, actor.id, userId, true);
  }

  @Delete(':chatId/admins/:userId')
  async removeAdmin(
    @Param('chatId') chatId: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.setAdmin(chatId, actor.id, userId, false);
  }

  @Post('messages/:messageId/reactions')
  async addReaction(@Param('messageId') messageId: string, @Body() body: ReactionDto, @Req() req: Request) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.addReaction(actor.id, messageId, body.type);
  }

  @Delete('messages/:messageId/reactions')
  async removeReaction(@Param('messageId') messageId: string, @Body() body: ReactionDto, @Req() req: Request) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.removeReaction(actor.id, messageId, body.type);
  }

  @Post('messages/:messageId/pin')
  async pinMessage(@Param('messageId') messageId: string, @Body() body: { chatId: string }, @Req() req: Request) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.pinMessage(body.chatId, actor.id, messageId, true);
  }

  @Delete('messages/:messageId/pin')
  async unpinMessage(
    @Param('messageId') messageId: string,
    @Body() body: { chatId: string },
    @Req() req: Request,
  ) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.pinMessage(body.chatId, actor.id, messageId, false);
  }

  @Get('search')
  async search(@Query('q') q: string, @Req() req: Request) {
    const actor = req.user;
    if (!actor) throw new ForbiddenException('Unauthorized');
    return this.chatService.search(actor.id, q);
  }
}
