import morgan from 'morgan';

export const requestLogger = morgan((tokens, request, response) =>
  JSON.stringify({
    level: 'info',
    event: 'http_request',
    method: tokens.method(request, response),
    statusCode: Number(tokens.status(request, response)) || response.statusCode,
    responseTimeMs: Number(tokens['response-time'](request, response)) || 0,
  }),
);
