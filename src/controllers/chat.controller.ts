import type { RequestHandler } from 'express';
import type { ChatService } from '../services/chat.service';
import type { MessageService } from '../services/message.service';
import { HttpError } from '../utils/http-error';

export function createChatController(chatService: ChatService): RequestHandler {
  return async (request, response, next) => {
    try {
      const { userAId, userBId } = request.body as { userAId: string; userBId: string };
      const result = await chatService.createDirectChat(userAId, userBId);
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export function createGetUserChatsController(chatService: ChatService): RequestHandler {
  return async (request, response, next) => {
    try {
      const userId = request.params.userId;
      if (typeof userId !== 'string') {
        throw new HttpError(400, 'userId must be a single string');
      }
      const chats = await chatService.getUserChats(userId);
      response.status(200).json({ chats });
    } catch (error) {
      next(error);
    }
  };
}

export function createSendMessageController(messageService: MessageService): RequestHandler {
  return async (request, response, next) => {
    try {
      const chatId = request.params.chatId;
      if (typeof chatId !== 'string') throw new HttpError(400, 'chatId must be a single string');

      const { senderId, text } = request.body as { senderId: string; text: string };
      const message = await messageService.sendMessage(chatId, senderId, text);
      response.status(201).json({ messageId: message.messageId, timestamp: message.timestamp });
    } catch (error) {
      next(error);
    }
  };
}

export function createListMessagesController(messageService: MessageService): RequestHandler {
  return async (request, response, next) => {
    try {
      const chatId = request.params.chatId;
      const userId = request.header('x-user-id');
      if (typeof chatId !== 'string') throw new HttpError(400, 'chatId must be a single string');
      if (!userId) throw new HttpError(400, 'x-user-id header is required');

      const query = request.query as { limit?: string; cursor?: string };
      const page = await messageService.getMessages(
        chatId,
        userId,
        query.limit === undefined ? 50 : Number(query.limit),
        query.cursor,
      );
      response.status(200).json(page);
    } catch (error) {
      next(error);
    }
  };
}

export function createReadReceiptController(messageService: MessageService): RequestHandler {
  return async (request, response, next) => {
    try {
      const { chatId, messageId } = request.params;
      if (typeof chatId !== 'string' || typeof messageId !== 'string') {
        throw new HttpError(400, 'chatId and messageId must be single strings');
      }

      const { userId } = request.body as { userId: string };
      const result = await messageService.markMessageRead(chatId, messageId, userId);
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export function createLastSeenController(messageService: MessageService): RequestHandler {
  return async (request, response, next) => {
    try {
      const chatId = request.params.chatId;
      if (typeof chatId !== 'string') throw new HttpError(400, 'chatId must be a single string');

      const { userId, messageId } = request.body as { userId: string; messageId: string };
      const result = await messageService.updateLastSeen(chatId, messageId, userId);
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
