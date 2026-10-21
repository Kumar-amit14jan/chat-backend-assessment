import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const httpError = error instanceof HttpError ? error : null;
  const statusCode = httpError?.statusCode ?? 500;
  const message = httpError?.message ?? 'Internal server error';

  if (statusCode >= 500) {
    console.error(error);
  }

  response.status(statusCode).json({
    error: {
      message,
      ...(httpError?.details !== undefined ? { details: httpError.details } : {}),
      ...(env.NODE_ENV !== 'production' && !httpError ? { details: String(error) } : {}),
    },
  });
};
