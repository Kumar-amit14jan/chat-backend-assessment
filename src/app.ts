import express from 'express';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { requestLogger } from './middleware/request-logger';

export const app = express();

app.disable('x-powered-by');
app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
