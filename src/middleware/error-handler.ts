import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const httpError = error instanceof HttpError ? error : null;
  const parserError = getJsonParserError(error);
  const statusCode = httpError?.statusCode ?? parserError?.statusCode ?? 500;
  const message = httpError?.message ?? parserError?.message ?? 'Internal server error';

  if (statusCode >= 500) {
    const errorName = getErrorName(error);
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'request_error',
        statusCode,
        errorName,
      }),
    );
  }

  response.status(statusCode).json({
    error: {
      message,
      ...(statusCode < 500 && httpError?.details !== undefined
        ? { details: httpError.details }
        : {}),
      ...(env.NODE_ENV !== 'production' && statusCode >= 500 && !parserError
        ? { details: 'An unexpected server error occurred' }
        : {}),
    },
  });
};

function getErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return String(error.name);
  }
  return 'UnknownError';
}

function getJsonParserError(error: unknown): { statusCode: number; message: string } | null {
  if (typeof error !== 'object' || error === null || !('type' in error)) return null;

  if (error.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'Invalid JSON request body' };
  }
  if (error.type === 'entity.too.large') {
    return { statusCode: 413, message: 'Request body is too large' };
  }
  return null;
}
