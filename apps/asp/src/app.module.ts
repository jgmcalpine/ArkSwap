import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RoundService } from './round.service';
import { InfoController } from './info.controller';
import { LiftController } from './lift/lift.controller';
import { TransferController } from './transfer.controller';
import { VtxoStore } from './vtxo-store.service';
import { TransferService } from './transfer.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [InfoController, LiftController, TransferController],
  providers: [RoundService, VtxoStore, TransferService],
})
export class AppModule {}

