import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RoundService } from './round.service';
import { InfoController } from './info.controller';
import { LiftController } from './lift/lift.controller';
import { TransferController } from './transfer.controller';
import { VtxoStore } from './vtxo-store.service';
import { TransferService } from './transfer.service';
import { AssetStore } from './assets/asset.store';
import { AssetsController } from './assets/assets.controller';
import { PondController } from './pond/pond.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [InfoController, LiftController, TransferController, AssetsController, PondController],
  providers: [RoundService, VtxoStore, TransferService, AssetStore],
})
export class AppModule {}

