import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { RoundService } from '../round.service';
import { VtxoStore } from '../vtxo-store.service';

interface LiftRequestDto {
  address: string;
  amount: number;
}

@Controller('v1')
export class LiftController {
  constructor(
    private readonly roundService: RoundService,
    private readonly vtxoStore: VtxoStore,
  ) {}

  @Post('lift')
  async scheduleLift(@Body() body: LiftRequestDto) {
    const { address, amount } = body;
    
    if (!address || typeof amount !== 'number' || amount <= 0) {
      return { error: 'Invalid address or amount' };
    }
    
    this.roundService.scheduleLift(address, amount);
    
    return {
      status: 'queued',
      nextRound: '5s',
    };
  }

  @Get('vtxos/:address')
  getVtxos(@Param('address') address: string) {
    return this.vtxoStore.getForAddress(address);
  }
}

