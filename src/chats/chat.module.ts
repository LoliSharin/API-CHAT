import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chat } from '../entities/chat.entity';
import { ChatParticipant } from '../entities/chat-participant.entity';
import { Message } from '../entities/message.entity';
import { MessageReaction } from '../entities/message-reaction.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatFile } from '../entities/chat-file.entity';
import { ChatKeyEntity } from '../entities/chat-key.entity';
import { UserPublicKeyEntity } from '../entities/userPublicKey.entity';
import { SessionService } from '../session/session.service';
import { NotificationService } from '../notifications/notification.service';
import { FilesModule } from '../files/files.module';
import { ChatKeyService } from '../crypto/chat-key.service';
import { KeyWrappingService } from '../crypto/key-wraped.service';
import { KekService } from '../crypto/kek.service';

@Module({
  imports: [TypeOrmModule.forFeature([Chat, ChatParticipant, Message, ChatFile, MessageReaction, ChatKeyEntity, UserPublicKeyEntity]), FilesModule],
  providers: [ChatService, ChatGateway, SessionService, NotificationService, ChatKeyService, KeyWrappingService, KekService],
  controllers: [ChatController],
  exports: [ChatService]
})
export class ChatModule {}
