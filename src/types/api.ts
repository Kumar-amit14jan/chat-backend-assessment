export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  dependencies: {
    database: 'up' | 'down';
  };
}

export interface ErrorResponse {
  error: {
    message: string;
    details?: unknown;
  };
}
