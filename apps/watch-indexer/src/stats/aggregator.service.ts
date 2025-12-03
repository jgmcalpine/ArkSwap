import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/database.module';
import { BitcoinService } from '../bitcoin.service';

export interface AggregatedStats {
  aspId: string; // ASP ID
  aspName: string; // ASP name
  poolAddress: string; // ASP pool address being scanned
  roundFrequency: number; // Average time between rounds in seconds (float)
  roundCount: number; // Number of rounds in last 24h
  secondsSinceLastRound: number; // Seconds since the most recent round
  tvl: bigint; // Total Value Locked in satoshis
  exitVolume: bigint; // Sum of exit transactions in last 24h
  treeDepth: number; // Average tree depth
}

@Injectable()
export class AggregatorService {
  private readonly logger = new Logger(AggregatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitcoinService: BitcoinService,
  ) {}

  /**
   * Aggregates 24-hour statistics for an ASP
   * @param aspPubkey The ASP public key or ID
   * @returns Aggregated statistics
   */
  async get24hStats(aspPubkey: string): Promise<AggregatedStats> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find ASP by ID or poolAddress (assuming aspPubkey could be either)
    const asp = await this.prisma.aspDefinition.findFirst({
      where: {
        OR: [{ id: aspPubkey }, { poolAddress: aspPubkey }],
      },
    });

    if (!asp) {
      throw new Error(`ASP not found: ${aspPubkey}`);
    }

    // Get all rounds in the last 24h, ordered by block height
    const rounds = await this.prisma.arkRound.findMany({
      where: {
        aspId: asp.id,
        timestamp: {
          gte: twentyFourHoursAgo,
        },
      },
      orderBy: {
        blockHeight: 'asc',
      },
    });

    // Get the most recent round (overall, not just last 24h) for recency calculation
    const mostRecentRound = await this.prisma.arkRound.findFirst({
      where: {
        aspId: asp.id,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Calculate secondsSinceLastRound
    let secondsSinceLastRound = 0;
    if (mostRecentRound) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const lastRoundSeconds = Math.floor(
        mostRecentRound.timestamp.getTime() / 1000,
      );
      secondsSinceLastRound = nowSeconds - lastRoundSeconds;
    } else {
      // If no rounds exist, set to a very large number (24 hours + 1 day) to indicate inactivity
      // Using a finite number instead of Infinity for JSON serialization
      secondsSinceLastRound = 172800; // 48 hours in seconds
    }

    // Calculate averageInterval (average time between rounds in seconds, as float)
    // Formula: (lastTimestamp - firstTimestamp) / roundCount
    let roundFrequency = 0; // Will be in seconds (float)
    if (rounds.length > 1) {
      const firstTimestamp = rounds[0].timestamp.getTime() / 1000; // Convert to seconds
      const lastTimestamp =
        rounds[rounds.length - 1].timestamp.getTime() / 1000;
      const totalTimeSpan = lastTimestamp - firstTimestamp;
      roundFrequency = totalTimeSpan / rounds.length; // Average interval in seconds (float)
    } else if (rounds.length === 1) {
      // If only one round in last 24h, use time since that round
      roundFrequency = secondsSinceLastRound;
    }

    // Get TVL (Total Value Locked) - latest UTXO balance for ASP Pool address
    let tvl = 0n;
    try {
      tvl = await this.bitcoinService.getAddressBalance(asp.poolAddress);
    } catch (error) {
      this.logger.warn(
        `Failed to get TVL for address ${asp.poolAddress}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Get Exit Volume - sum of UNILATERAL_EXIT transactions in last 24h
    const exitTransactions = await this.prisma.arkTransaction.findMany({
      where: {
        aspId: asp.id,
        type: 'UNILATERAL_EXIT',
        timestamp: {
          gte: twentyFourHoursAgo,
        },
      },
    });

    const exitVolume = exitTransactions.reduce(
      (sum, tx) => sum + tx.amount,
      0n,
    );

    // Calculate Tree Depth - average treeDepth of rounds in last 24h
    let treeDepth = 0;
    const roundsWithDepth = rounds.filter((r) => r.treeDepth !== null);
    if (roundsWithDepth.length > 0) {
      const sum = roundsWithDepth.reduce(
        (acc, r) => acc + (r.treeDepth ?? 0),
        0,
      );
      treeDepth = sum / roundsWithDepth.length;
    } else if (rounds.length > 0) {
      // Fallback: calculate tree depth from vtxoCount if treeDepth not set
      // Tree depth is approximately log2(vtxoCount) for a balanced tree
      const depths = rounds.map((r) => {
        if (r.vtxoCount <= 0) return 0;
        return Math.ceil(Math.log2(r.vtxoCount));
      });
      treeDepth = depths.reduce((sum, d) => sum + d, 0) / depths.length || 0;
    }

    this.logger.log(
      `[Aggregator] Stats for ASP ${aspPubkey}: rounds=${rounds.length}, frequency=${roundFrequency}s, secondsSinceLastRound=${secondsSinceLastRound}, tvl=${tvl}, exits=${exitVolume}, depth=${treeDepth}`,
    );

    return {
      aspId: asp.id,
      aspName: asp.name,
      poolAddress: asp.poolAddress,
      roundFrequency,
      roundCount: rounds.length,
      secondsSinceLastRound,
      tvl,
      exitVolume,
      treeDepth,
    };
  }
}
