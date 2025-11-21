import { Controller, Post, Body, Logger, BadRequestException } from '@nestjs/common';
import { SwapService } from './swap.service';
import { z, ZodError } from 'zod';

const SwapQuoteRequestSchema = z.object({
  amount: z.number().positive(),
});

const SwapCommitRequestSchema = z.object({
  swapId: z.string().min(1),
  txid: z.string().min(1),
  userL1Address: z.string().min(1),
});

interface SwapQuoteResponse {
  id: string;
  amount: number;
  preimageHash: string;
  makerPubkey: string;
}

interface SwapCommitResponse {
  success: boolean;
  l1TxId: string;
}

@Controller('swap')
export class SwapController {
  private readonly logger = new Logger(SwapController.name);

  constructor(private readonly swapService: SwapService) {}

  @Post('quote')
  async createQuote(@Body() body: unknown): Promise<SwapQuoteResponse> {
    try {
      const validatedBody = SwapQuoteRequestSchema.parse(body);

      this.logger.log(`📋 Quote requested for amount: ${validatedBody.amount}`);

      const quote = this.swapService.createQuote(validatedBody.amount);

      this.logger.log(`✅ Quote created: id=${quote.id}, preimageHash=${quote.preimageHash}`);

      return quote;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException(
          `Validation failed: ${error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }
      // Handle other errors...
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  @Post('commit')
  async commitSwap(@Body() body: unknown): Promise<SwapCommitResponse> {
    try {
      const validatedBody = SwapCommitRequestSchema.parse(body);

      this.logger.log(`🔄 Commit requested: swapId=${validatedBody.swapId}, txid=${validatedBody.txid}`);

      const l1TxId = await this.swapService.processSwap(
        validatedBody.swapId,
        validatedBody.txid,
        validatedBody.userL1Address,
      );

      this.logger.log(`✅ Swap committed: swapId=${validatedBody.swapId}, l1TxId=${l1TxId}`);

      return {
        success: true,
        l1TxId,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException(
          `Validation failed: ${error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }
      // Handle other errors...
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

