import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
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
import { BitcoinService } from './bitcoin/bitcoin.service';
import { SignatureVerifierService } from './assets/signature-verifier.service';

@Module({
  imports: [ScheduleModule.forRoot(), HttpModule],
  controllers: [
    InfoController,
    LiftController,
    TransferController,
    AssetsController,
    PondController,
  ],
  providers: [
    RoundService,
    VtxoStore,
    TransferService,
    AssetStore,
    BitcoinService,
    SignatureVerifierService,
  ],
})
export class AppModule {}
