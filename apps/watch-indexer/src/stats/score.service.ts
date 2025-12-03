import { Injectable } from '@nestjs/common';
import type { AggregatedStats } from './aggregator.service';

export interface ScoreResult {
  score: number;
  grade: string;
  breakdown: {
    safety: number;
    reliability: number;
    efficiency: number;
  };
}

@Injectable()
export class ScoreService {
  /**
   * Calculates the ASP Score based on aggregated statistics
   * @param stats The aggregated statistics
   * @returns Score result with grade
   */
  calculateScore(stats: AggregatedStats): ScoreResult {
    // Safety (50 pts): Exit Volume vs TVL ratio
    let safety = 0;
    if (stats.tvl > 0n) {
      const exitRatio = Number(stats.exitVolume) / Number(stats.tvl);
      if (exitRatio < 0.01) {
        // Exit Volume < 1% TVL = 50 pts
        safety = 50;
      } else if (exitRatio > 0.1) {
        // Exit Volume > 10% TVL = 0 pts
        safety = 0;
      } else {
        // Linear interpolation between 1% and 10%
        // At 1%: 50 pts, at 10%: 0 pts
        // Formula: 50 * (1 - (exitRatio - 0.01) / (0.1 - 0.01))
        safety = 50 * (1 - (exitRatio - 0.01) / 0.09);
        safety = Math.max(0, Math.min(50, safety)); // Clamp between 0 and 50
      }
    } else {
      // No TVL means no safety score
      safety = 0;
    }

    // Reliability (30 pts): Based on recency (liveness)
    // Base: 30 points
    // Penalty 1: If secondsSinceLastRound > 600 (10 mins), deduct 10 points
    // Penalty 2: If secondsSinceLastRound > 3600 (1 hour), deduct 20 points
    // Penalty 3: If secondsSinceLastRound > 86400 (24 hours) OR roundCount === 0, Score = 0
    let reliability = 30; // Base score

    // Penalty 3: Zombie or no rounds
    if (stats.roundCount === 0 || stats.secondsSinceLastRound > 86400) {
      reliability = 0;
    }
    // Penalty 2: Dead (inactive for > 1 hour)
    else if (stats.secondsSinceLastRound > 3600) {
      reliability = 10; // 30 - 20 = 10
    }
    // Penalty 1: Inactivity (> 10 mins)
    else if (stats.secondsSinceLastRound > 600) {
      reliability = 20; // 30 - 10 = 20
    }
    // No penalty: Active within last 10 minutes
    else {
      reliability = 30;
    }

    // Efficiency (20 pts): Tree Depth
    let efficiency = 0;
    if (stats.treeDepth < 4) {
      efficiency = 20;
    } else if (stats.treeDepth > 8) {
      efficiency = 5;
    } else {
      // Linear interpolation between 4 and 8
      // At 4: 20 pts, at 8: 5 pts
      efficiency = 20 - ((stats.treeDepth - 4) / 4) * 15;
      efficiency = Math.max(5, Math.min(20, efficiency)); // Clamp between 5 and 20
    }

    const totalScore = safety + reliability + efficiency;

    // Determine Grade
    let grade: string;
    if (totalScore >= 90) {
      grade = 'A';
    } else if (totalScore >= 80) {
      grade = 'B';
    } else if (totalScore >= 70) {
      grade = 'C';
    } else if (totalScore >= 60) {
      grade = 'D';
    } else {
      grade = 'F';
    }

    return {
      score: Math.round(totalScore * 100) / 100, // Round to 2 decimal places
      grade,
      breakdown: {
        safety: Math.round(safety * 100) / 100,
        reliability: Math.round(reliability * 100) / 100,
        efficiency: Math.round(efficiency * 100) / 100,
      },
    };
  }
}
