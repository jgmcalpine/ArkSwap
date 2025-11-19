import { Module } from '@nestjs/common';
import { FaucetController } from './faucet.controller';
import { BitcoinModule } from '../bitcoin/bitcoin.module';

@Module({
  imports: [BitcoinModule],
  controllers: [FaucetController],
})
export class FaucetModule {}

