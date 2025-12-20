import { Injectable, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async createUser(username: string, password: string, displayName: string): Promise<User> {
    if (!username || !password || !displayName) {
      throw new BadRequestException('username, password, displayName are required');
    }

    const existing = await this.userRepo.findOne({ where: { username } });
    if (existing) {
      throw new BadRequestException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = this.userRepo.create({
      username,
      passwordHash,
      displayName,
    });

    return this.userRepo.save(user);
  }
}
