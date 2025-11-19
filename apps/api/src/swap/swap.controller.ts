import { Controller, Post, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SwapService } from './swap.service';

interface SwapQuoteRequest {
  amount: number;
}

interface SwapQuoteResponse {
  id: string;
  amount: number;
  preimageHash: string;
  makerPubkey: string;
}

interface SwapCommitRequest {
  swapId: string;
  txid: string;
  userL1Address: string;
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
  async createQuote(@Body() body: SwapQuoteRequest): Promise<SwapQuoteResponse> {
    try {
      if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
        throw new HttpException(
          {
            success: false,
            message: 'Amount must be a positive number',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`📋 Quote requested for amount: ${body.amount}`);

      const quote = this.swapService.createQuote(body.amount);

      this.logger.log(`✅ Quote created: id=${quote.id}, preimageHash=${quote.preimageHash}`);

      return quote;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to create quote',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('commit')
  async commitSwap(@Body() body: SwapCommitRequest): Promise<SwapCommitResponse> {
    try {
      if (!body.swapId || typeof body.swapId !== 'string') {
        throw new HttpException(
          {
            success: false,
            message: 'swapId must be a valid string',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!body.txid || typeof body.txid !== 'string') {
        throw new HttpException(
          {
            success: false,
            message: 'txid must be a valid string',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!body.userL1Address || typeof body.userL1Address !== 'string') {
        throw new HttpException(
          {
            success: false,
            message: 'userL1Address must be a valid string',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`🔄 Commit requested: swapId=${body.swapId}, txid=${body.txid}`);

      const l1TxId = await this.swapService.processSwap(
        body.swapId,
        body.txid,
        body.userL1Address,
      );

      this.logger.log(`✅ Swap committed: swapId=${body.swapId}, l1TxId=${l1TxId}`);

      return {
        success: true,
        l1TxId,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to commit swap',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

