import type { RequestHandler } from 'express';
import type { ChatService } from '../services/chat.service';
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
