import { Controller, Get } from '@nestjs/common';
import { BitcoinService } from './bitcoin.service';

interface BitcoinInfoResponse {
  chain: string;
  blocks: number;
  headers: number;
}

@Controller('bitcoin')
export class BitcoinController {
  constructor(private readonly bitcoinService: BitcoinService) {}

  @Get('info')
  async getInfo(): Promise<BitcoinInfoResponse> {
    const info = await this.bitcoinService.callRpc('getblockchaininfo', []);
    return {
      chain: info.chain || 'unknown',
      blocks: info.blocks || 0,
      headers: info.headers || 0,
    };
  }
}
