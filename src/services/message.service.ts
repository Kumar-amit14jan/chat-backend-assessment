import type { ChatRepositoryContract } from '../repositories/chat.repository';
import {
  FirestoreMessageRepository,
  InvalidMessageCursorError,
  MissingMessageError,
  type MessagePage,
  type MessageRepositoryContract,
  type ChatMessage,
} from '../repositories/message.repository';
import { ChatRepository } from '../repositories/chat.repository';
import { HttpError } from '../utils/http-error';

const MAX_PAGE_SIZE = 100;

export class MessageService {
  constructor(
    private readonly chatRepository: Pick<
      ChatRepositoryContract,
      'getChatAccess'
    > = new ChatRepository(),
    private readonly messageRepository: MessageRepositoryContract = new FirestoreMessageRepository(),
  ) {}

  async sendMessage(chatId: string, senderId: string, text: string): Promise<ChatMessage> {
    await this.assertMember(chatId, senderId);

    try {
      return await this.messageRepository.create(chatId, senderId, text.trim());
    } catch {
      throw new HttpError(503, 'Message storage is temporarily unavailable');
    }
  }

  async getMessages(
    chatId: string,
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<MessagePage> {
    await this.assertMember(chatId, userId);

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new HttpError(400, `limit must be between 1 and ${MAX_PAGE_SIZE}`);
    }

    try {
      return await this.messageRepository.list(chatId, limit, cursor);
    } catch (error) {
      if (error instanceof InvalidMessageCursorError) {
        throw new HttpError(400, error.message);
      }
      throw new HttpError(503, 'Message storage is temporarily unavailable');
    }
  }

  async markMessageRead(
    chatId: string,
    messageId: string,
    userId: string,
  ): Promise<{ readAt: string }> {
    await this.assertMember(chatId, userId);
    try {
      return await this.messageRepository.markRead(chatId, messageId, userId);
    } catch (error) {
      if (error instanceof MissingMessageError) throw new HttpError(404, error.message);
      throw new HttpError(503, 'Message storage is temporarily unavailable');
    }
  }

  async updateLastSeen(
    chatId: string,
    messageId: string,
    userId: string,
  ): Promise<{ lastSeenMessageId: string; lastSeenAt: string; updated: boolean }> {
    await this.assertMember(chatId, userId);
    try {
      return await this.messageRepository.updateLastSeen(chatId, messageId, userId);
    } catch (error) {
      if (error instanceof MissingMessageError) throw new HttpError(404, error.message);
      throw new HttpError(503, 'Message storage is temporarily unavailable');
    }
  }

  private async assertMember(chatId: string, userId: string): Promise<void> {
    const access = await this.chatRepository.getChatAccess(chatId, userId);
    if (access === 'chat-not-found') throw new HttpError(404, 'Chat not found');
    if (access === 'not-a-participant')
      throw new HttpError(403, 'User is not a participant in this chat');
  }
}
