import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoController } from './crypto.controller';
import { UserPublicKeyEntity } from '../entities/userPublicKey.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserPublicKeyEntity])],
  controllers: [CryptoController],
})
export class CryptoModule {}
