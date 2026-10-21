import './config/firebase';
import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';

const server = app.listen(env.PORT, () => {
  console.info(`Server listening on port ${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received; shutting down gracefully.`);
  server.close(async (error) => {
    if (error) {
      console.error('Error while closing HTTP server:', error);
      process.exitCode = 1;
    }

    await prisma.$disconnect();
    process.exit();
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
