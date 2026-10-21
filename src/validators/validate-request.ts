import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { HttpError } from '../utils/http-error';

type RequestPart = 'body' | 'params' | 'query';

export function validateRequest(schema: ZodTypeAny, part: RequestPart = 'body'): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request[part]);

    if (!result.success) {
      next(new HttpError(400, 'Request validation failed', result.error.flatten()));
      return;
    }

    next();
  };
}
