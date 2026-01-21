import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import * as cookie from 'cookie';
import { randomUUID } from 'crypto';

@Injectable()
export class SessionService {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD ?? undefined,
    });
  }

  
  async createSessionForUser(
    userId: string,
    ttlSeconds = 14 * 24 * 3600
  ): Promise<string> {
    const sessionId = randomUUID();
    const key = `session:${sessionId}`;

    await this.redis.set(
      key,
      JSON.stringify({ userId }),
      'EX',
      ttlSeconds
    );

    return sessionId;
  }

  
  async destroySession(sessionId: string) {
    await this.redis.del(`session:${sessionId}`);
  }
  
  async getUserBySession(sessionId: string): Promise<{ userId: string } | null> {
    const raw = await this.redis.get(`session:${sessionId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  
  async getUserFromHandshake(handshake: any) {
    const cookieHeader = handshake.headers?.cookie;
    const authHeader = handshake.headers?.authorization;

    let sessionId: string | undefined;

    if (cookieHeader) {
      const cookies = cookie.parse(cookieHeader);
      sessionId = cookies['sessionId'];
    }

    if (!sessionId && typeof authHeader === 'string') {
      const [, token] = authHeader.split(' ');
      sessionId = token;
    }

    if (!sessionId) return null;

    return await this.getUserBySession(sessionId);
  }

  // Онлайн статус
  private userSockets = new Map<string, Set<string>>();
  addUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }
  removeUserSocket(userId: string, socketId: string) {
    const set = this.userSockets.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.userSockets.delete(userId);
  }
  isUserOnline(userId: string) {
    return this.userSockets.has(userId);
  }
  getUserSockets(userId: string) {
    return Array.from(this.userSockets.get(userId) || []);
  }
}
