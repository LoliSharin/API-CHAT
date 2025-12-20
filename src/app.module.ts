import { Module, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chats/chat.module';
import { User } from './entities/user.entity';
import { Chat } from './entities/chat.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { Message } from './entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgresql://chat_user:chat_pass@127.0.0.1:5432/chat_db?schema=public',
      entities: [User, Chat, ChatParticipant, Message],
      synchronize: true, 
    }),
    AuthModule,
    ChatModule,
    
  ],
  
})
export class AppModule {
}