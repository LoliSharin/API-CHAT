import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../session/session.service';
import * as cookie from 'cookie';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(
    private readonly sessionService: SessionService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const cookies = cookie.parse(req.headers.cookie || '');
    const sessionId = cookies['sessionId'];

    if (sessionId) {
      const session = await this.sessionService.getUserBySession(sessionId);

      if (session?.userId) {
        const user = await this.userRepo.findOne({
          where: { id: session.userId },
        });

        if (user) {
          (req as any).user = {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
          };
        }
      }
    }

    next();
  }
}
