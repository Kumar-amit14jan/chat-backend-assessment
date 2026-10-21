import { Router } from 'express';
import { createChatController } from '../controllers/chat.controller';
import type { ChatService } from '../services/chat.service';
import { validateRequest } from '../validators/validate-request';
import { createChatBodySchema } from '../validators/chat.validators';

export function createChatRouter(chatService: ChatService): Router {
  const router = Router();
  router.post('/create', validateRequest(createChatBodySchema), createChatController(chatService));
  return router;
}
