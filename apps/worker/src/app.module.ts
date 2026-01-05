import { Module } from "@nestjs/common";
import { WorkerService } from "./worker.service";

@Module({
  controllers: [],
  providers: [WorkerService],
})
export class AppModule {}