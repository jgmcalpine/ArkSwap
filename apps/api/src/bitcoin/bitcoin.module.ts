import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BitcoinService } from './bitcoin.service';
import { BitcoinController } from './bitcoin.controller';

@Module({
  imports: [HttpModule],
  controllers: [BitcoinController],
  providers: [BitcoinService],
  exports: [BitcoinService],
})
export class BitcoinModule {}

