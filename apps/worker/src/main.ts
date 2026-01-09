import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger, onShutdown } from '@pkg/shared';
import { WorkerService } from './worker.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const workerService = app.get(WorkerService);

  onShutdown(async (signal) => {
    logger.info({ service: 'worker', signal }, 'worker stopping');
    workerService.stop();
    await app.close();
    logger.info({ service: 'worker' }, 'worker stopped');
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
