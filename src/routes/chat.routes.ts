import { Router } from 'express';
import {
  createChatController,
  createLastSeenController,
  createListMessagesController,
  createReadReceiptController,
  createSendMessageController,
} from '../controllers/chat.controller';
import type { ChatService } from '../services/chat.service';
import type { MessageService } from '../services/message.service';
import { validateRequest } from '../validators/validate-request';
import {
  chatIdParamsSchema,
  chatMessageParamsSchema,
  createChatBodySchema,
  getMessagesQuerySchema,
  lastSeenBodySchema,
  readReceiptBodySchema,
  sendMessageBodySchema,
} from '../validators/chat.validators';

export function createChatRouter(chatService: ChatService, messageService: MessageService): Router {
  const router = Router();
  router.post('/create', validateRequest(createChatBodySchema), createChatController(chatService));
  router.post(
    '/:chatId/message/send',
    validateRequest(chatIdParamsSchema, 'params'),
    validateRequest(sendMessageBodySchema),
    createSendMessageController(messageService),
  );
  router.get(
    '/:chatId/messages',
    validateRequest(chatIdParamsSchema, 'params'),
    validateRequest(getMessagesQuerySchema, 'query'),
    createListMessagesController(messageService),
  );
  router.post(
    '/:chatId/message/:messageId/read',
    validateRequest(chatMessageParamsSchema, 'params'),
    validateRequest(readReceiptBodySchema),
    createReadReceiptController(messageService),
  );
  router.post(
    '/:chatId/lastseen',
    validateRequest(chatIdParamsSchema, 'params'),
    validateRequest(lastSeenBodySchema),
    createLastSeenController(messageService),
  );
  return router;
}
