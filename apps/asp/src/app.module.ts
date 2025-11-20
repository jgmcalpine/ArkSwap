import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RoundService } from './round.service';
import { InfoController } from './info.controller';
import { LiftController } from './lift/lift.controller';
import { VtxoStore } from './vtxo-store.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [InfoController, LiftController],
  providers: [RoundService, VtxoStore],
})
export class AppModule {}

