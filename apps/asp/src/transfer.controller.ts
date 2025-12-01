import { Controller, Post, Body } from '@nestjs/common';
import { RoundService } from './round.service';
import type { ArkTransaction } from '@arkswap/protocol';
import { getTxHash } from '@arkswap/protocol';

@Controller('v1')
export class TransferController {
  constructor(private readonly roundService: RoundService) {}

  @Post('transfer')
  async submitTransfer(@Body() body: ArkTransaction) {
    // Validate basic structure
    if (
      !body.inputs ||
      !Array.isArray(body.inputs) ||
      body.inputs.length === 0
    ) {
      return { error: 'Invalid transaction: inputs required' };
    }
    if (
      !body.outputs ||
      !Array.isArray(body.outputs) ||
      body.outputs.length === 0
    ) {
      return { error: 'Invalid transaction: outputs required' };
    }

    // Submit transaction (validation happens in RoundService.submitTx)
    await this.roundService.submitTx(body);

    // Calculate transferId (hash of the transaction)
    const inputsWithoutSigs = body.inputs.map(({ txid, vout }) => ({
      txid,
      vout,
    }));
    const transferId = await getTxHash(inputsWithoutSigs, body.outputs);

    return {
      status: 'queued',
      transferId,
      nextRound: '5s',
    };
  }
}
