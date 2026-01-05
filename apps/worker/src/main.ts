import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { logger, onShutdown } from "@pkg/shared";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  logger.info({ service: "worker" }, "worker started");

  const interval = setInterval(() => {
    // keep event loop alive; real processing will be added later
  }, 60_000);

  onShutdown(async (signal) => {
    logger.info({ service: "worker", signal }, "worker stopping");
    clearInterval(interval);
    await app.close();
    logger.info({ service: "worker" }, "worker stopped");
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});