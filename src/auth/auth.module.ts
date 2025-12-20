import { SessionService } from '../session/session.service';
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NestModule } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UserService } from './user.service';
import { SessionMiddleware } from './session.middleware';
@Module({
  imports: [
    TypeOrmModule.forFeature([User]), 
  ],
  controllers: [AuthController],
  providers: [
    SessionService,
    UserService,
    SessionMiddleware, 
  ],
  exports: [SessionService], 
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}