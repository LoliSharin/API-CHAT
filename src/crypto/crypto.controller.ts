import { Controller, Post, Body, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPublicKeyEntity } from '../entities/userPublicKey.entity';
import { createPublicKey } from 'crypto';

@Controller('api/keys')
export class CryptoController {
  constructor(
    @InjectRepository(UserPublicKeyEntity) private userPublicKeyRepo: Repository<UserPublicKeyEntity>,)
    {}
    @Post('public')
    async postPublicKey(@Body() body: { publicKey: string }, @Req() req: Request) {
        const actor = req.user;
        if (!actor) throw new UnauthorizedException('Неавторизован');
        if (!body?.publicKey || typeof body.publicKey !== 'string') {
          throw new BadRequestException('Требуется публичный ключ');
        }
        const normalized = body.publicKey.includes('\\n') ? body.publicKey.replace(/\\n/g, '\n') : body.publicKey;
        try {
          createPublicKey(normalized);
        } catch {
          throw new BadRequestException('Неподходящий формат публичного ключа');
        }

        await this.userPublicKeyRepo.update({ userId: actor.id, isActive: true }, { isActive: false });

        const userPublicKey = new UserPublicKeyEntity();
        userPublicKey.userId = actor.id;
        userPublicKey.publicKeyPem = normalized;
        userPublicKey.keyId = null;
        userPublicKey.isActive = true;
        await this.userPublicKeyRepo.save(userPublicKey);
        return { ok: true };
    }
}
