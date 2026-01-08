import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { IngestController } from "./ingest.controller";
import { AdminController } from "./admin.controller";

@Module({
  controllers: [HealthController, IngestController, AdminController],
})
export class AppModule {}