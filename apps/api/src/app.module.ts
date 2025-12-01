import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { BitcoinModule } from './bitcoin/bitcoin.module';
import { FaucetModule } from './faucet/faucet.module';
import { SwapModule } from './swap/swap.module';

@Module({
  imports: [BitcoinModule, FaucetModule, SwapModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
