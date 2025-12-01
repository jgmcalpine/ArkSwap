import { Module } from '@nestjs/common';
import { SwapController } from './swap.controller';
import { SwapService } from './swap.service';
import { BitcoinModule } from '../bitcoin/bitcoin.module';

@Module({
  imports: [BitcoinModule],
  controllers: [SwapController],
  providers: [SwapService],
})
export class SwapModule {}
