import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ChatFile } from '../entities/chat-file.entity';
import { ChatParticipant } from '../entities/chat-participant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatFile, ChatParticipant])],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
