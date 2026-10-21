import { HttpError } from '../utils/http-error';
import { UserNotFoundError } from '../utils/user-not-found-error';
import {
  ChatRepository,
  type ChatRepositoryContract,
  type UserChatSummary,
} from '../repositories/chat.repository';

export class ChatService {
  constructor(private readonly chatRepository: ChatRepositoryContract = new ChatRepository()) {}

  async createDirectChat(userAId: string, userBId: string): Promise<{ chatId: string }> {
    if (userAId === userBId) {
      throw new HttpError(400, 'A direct chat requires two different users');
    }

    const [userLowId, userHighId] =
      Buffer.compare(Buffer.from(userAId), Buffer.from(userBId)) < 0
        ? [userAId, userBId]
        : [userBId, userAId];

    try {
      const result = await this.chatRepository.createOrGetDirectChat(userLowId, userHighId);
      return { chatId: result.chatId };
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new HttpError(404, error.message, { missingUserIds: error.userIds });
      }
      throw error;
    }
  }

  async getUserChats(userId: string): Promise<UserChatSummary[]> {
    try {
      return await this.chatRepository.listUserChats(userId);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new HttpError(404, error.message, { missingUserIds: error.userIds });
      }
      throw error;
    }
  }
}
