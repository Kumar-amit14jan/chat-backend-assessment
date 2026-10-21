import type { HealthResponse } from '../types/api';
import { HealthRepository } from '../repositories/health.repository';

export class HealthService {
  constructor(private readonly healthRepository = new HealthRepository()) {}

  async getStatus(): Promise<HealthResponse> {
    let database: HealthResponse['dependencies']['database'] = 'up';

    try {
      await this.healthRepository.checkDatabase();
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: { database },
    };
  }
}
