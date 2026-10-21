import { prisma } from '../config/prisma';

export class HealthRepository {
  async checkDatabase(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  }
}
