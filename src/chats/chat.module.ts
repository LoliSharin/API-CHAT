import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chat } from '../entities/chat.entity';
import { ChatParticipant } from '../entities/chat-participant.entity';
import { Message } from '../entities/message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatFile } from '../entities/chat-file.entity';
import { FilesService } from '../files/files.service';
import { SessionService } from '../session/session.service';


@Module({
  imports: [TypeOrmModule.forFeature([Chat, ChatParticipant, Message, ChatFile])],
  providers: [ChatService, FilesService, ChatGateway, SessionService],
  controllers: [ChatController],
  exports: [ChatService]
})
export class ChatModule {}