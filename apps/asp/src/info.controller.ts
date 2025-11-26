import { Controller, Get } from '@nestjs/common';
import { RoundService } from './round.service';

@Controller('v1')
export class InfoController {
  // Hardcoded pubkey for now
  private readonly pubkey = '02a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c';

  constructor(private readonly roundService: RoundService) {}

  @Get('info')
  getInfo() {
    return {
      pubkey: this.pubkey,
      roundInterval: 5000,
      network: 'regtest',
      currentBlock: this.roundService.getRoundHeight(),
    };
  }
}

