import type { RequestHandler } from 'express';
import { HealthService } from '../services/health.service';

const healthService = new HealthService();

export const getHealth: RequestHandler = async (_request, response, next) => {
  try {
    const health = await healthService.getStatus();
    response.status(health.status === 'ok' ? 200 : 503).json(health);
  } catch (error) {
    next(error);
  }
};
