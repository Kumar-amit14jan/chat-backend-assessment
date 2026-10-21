import { Router } from 'express';
import { createGetUserChatsController } from '../controllers/chat.controller';
import type { ChatService } from '../services/chat.service';
import { validateRequest } from '../validators/validate-request';
import { userIdParamsSchema } from '../validators/chat.validators';

export function createUserRouter(chatService: ChatService): Router {
  const router = Router();
  router.get(
    '/:userId/chats',
    validateRequest(userIdParamsSchema, 'params'),
    createGetUserChatsController(chatService),
  );
  return router;
}
