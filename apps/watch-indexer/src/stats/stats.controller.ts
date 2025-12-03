import { Controller, Get, Param } from '@nestjs/common';
import { AggregatorService } from './aggregator.service';
import { ScoreService } from './score.service';

@Controller('stats')
export class StatsController {
  constructor(
    private readonly aggregatorService: AggregatorService,
    private readonly scoreService: ScoreService,
  ) {}

  @Get(':aspPubkey')
  async getStats(@Param('aspPubkey') aspPubkey: string) {
    // Get aggregated statistics
    const metrics = await this.aggregatorService.get24hStats(aspPubkey);

    // Calculate score
    const scoreResult = this.scoreService.calculateScore(metrics);

    return {
      asp: {
        id: metrics.aspId,
        name: metrics.aspName,
        poolAddress: metrics.poolAddress,
      },
      score: scoreResult.score,
      grade: scoreResult.grade,
      metrics: {
        roundFrequency: metrics.roundFrequency,
        roundCount: metrics.roundCount,
        secondsSinceLastRound: metrics.secondsSinceLastRound,
        tvl: metrics.tvl.toString(), // Convert BigInt to string for JSON
        exitVolume: metrics.exitVolume.toString(),
        treeDepth: metrics.treeDepth,
      },
      breakdown: scoreResult.breakdown,
    };
  }
}
