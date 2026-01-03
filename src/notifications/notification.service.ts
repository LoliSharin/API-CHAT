import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async notifyMessageSent(chatId: string, messageId: string, senderId: string) {
    this.logger.debug(`Notify message sent chat=${chatId} msg=${messageId} sender=${senderId}`);
  }

  async notifyGroupCreated(chatId: string, actorId: string, userIds: string[]) {
    this.logger.debug(`Notify group created chat=${chatId} actor=${actorId} users=${userIds.join(',')}`);
  }

  async notifyReaction(chatId: string, messageId: string, userId: string, type: string, action: 'add' | 'remove') {
    this.logger.debug(`Notify reaction ${action} chat=${chatId} msg=${messageId} user=${userId} type=${type}`);
  }
}
