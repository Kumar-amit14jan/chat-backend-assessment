import express from 'express';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { requestLogger } from './middleware/request-logger';
import { createChatRouter } from './routes/chat.routes';
import { createUserRouter } from './routes/user.routes';
import { ChatService } from './services/chat.service';

export function createApp(chatService = new ChatService()) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', apiRouter);
  app.use('/api/chat', createChatRouter(chatService));
  app.use('/api/user', createUserRouter(chatService));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
