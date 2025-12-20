import { Controller, Post, Body, Res, Req, UnauthorizedException } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { UserService } from './user.service';
import { Response, Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly userService: UserService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  @Post('login')
  async login(
  @Body() body: { username: string; password: string }, 
  @Res({ passthrough: true }) res: Response) {
    const { username, password } = body;
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const sessionId = await this.sessionService.createSessionForUser(user.id);

    // устанавливаем cookie сессии
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 14 * 24 * 3600 * 1000,
      path: '/'
    });

    return res.json({ ok: true, user: { id: user.id, username: user.username, displayName: user.displayName }});
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const cookies = require('cookie').parse(req.headers.cookie || '');
    const sessionId = cookies['sessionId'];
    if (sessionId) {
      await this.sessionService.destroySession(sessionId);
      res.clearCookie('sessionId', { path: '/' });
    }
    return res.json({ ok: true });
  }
  @Post('register')
  async register(
    @Body() body: { username: string; password: string; displayName: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { username, password, displayName } = body;

    const user = await this.userService.createUser(username, password, displayName);

    const sessionId = await this.sessionService.createSessionForUser(user.id);

    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 14 * 24 * 3600 * 1000,
      path: '/',
    });

    return {
      ok: true,
      user: { id: user.id, username: user.username, displayName: user.displayName },
    };
  }
}