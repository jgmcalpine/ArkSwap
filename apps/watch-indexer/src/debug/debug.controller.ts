import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/database.module';
import { AggregatorService } from '../stats/aggregator.service';
import { BitcoinService } from '../bitcoin.service';

interface SimulateExitDto {
  percentage: number;
  aspId?: string; // Optional ASP ID, defaults to first ASP found
}

@Controller('debug')
export class DebugController {
  private readonly logger = new Logger(DebugController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregatorService: AggregatorService,
    private readonly bitcoinService: BitcoinService,
  ) {}

  @Post('simulate-exit')
  async simulateExit(@Body() body: SimulateExitDto) {
    const { percentage, aspId } = body;

    if (!percentage || percentage < 0 || percentage > 100) {
      throw new HttpException(
        {
          message: 'Invalid percentage. Must be between 0 and 100',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Get ASP (use provided aspId or default to first ASP)
      let asp;
      if (aspId) {
        asp = await this.prisma.aspDefinition.findFirst({
          where: {
            OR: [{ id: aspId }, { poolAddress: aspId }],
          },
        });
      } else {
        asp = await this.prisma.aspDefinition.findFirst();
      }

      if (!asp) {
        throw new HttpException(
          {
            message: 'ASP not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Fetch current TVL from AggregatorService
      const stats = await this.aggregatorService.get24hStats(asp.id);
      const tvl = stats.tvl;

      if (tvl === 0n) {
        throw new HttpException(
          {
            message: 'TVL is zero. Cannot simulate exit.',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Calculate amount = TVL * (percentage / 100)
      const amount = (tvl * BigInt(Math.round(percentage * 100))) / 10000n;

      // Get current block height
      const blockHeight = await this.bitcoinService.getBlockCount();

      // Create a fake transaction record with type: 'EXIT' (using 'UNILATERAL_EXIT' to match schema)
      // Generate a unique fake txid
      const fakeTxid = `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      await this.prisma.arkTransaction.create({
        data: {
          txid: fakeTxid,
          aspId: asp.id,
          blockHeight,
          timestamp: new Date(),
          amount,
          type: 'UNILATERAL_EXIT',
        },
      });

      this.logger.log(
        `Simulated ${percentage}% mass exit: ${amount} sats (TVL: ${tvl} sats)`,
      );

      return {
        message: `Simulated ${percentage}% Mass Exit (${amount} sats)`,
        amount: amount.toString(),
        tvl: tvl.toString(),
        percentage,
        aspId: asp.id,
        aspName: asp.name,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Failed to simulate exit: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        {
          message:
            error instanceof Error ? error.message : 'Failed to simulate exit',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('reset')
  async resetSimulation() {
    try {
      // Delete all simulated transactions (txid starts with "sim_")
      // Use raw SQL for reliable pattern matching
      const result = await this.prisma.$executeRaw`
        DELETE FROM ark_transactions
        WHERE txid LIKE 'sim_%'
      `;

      this.logger.log(
        `Reset simulation: Deleted ${result} simulated transactions`,
      );

      return {
        success: true,
        message: 'Stats reset',
        deletedCount: result,
      };
    } catch (error) {
      this.logger.error(
        `Failed to reset simulation: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        {
          message:
            error instanceof Error
              ? error.message
              : 'Failed to reset simulation',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
