import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';

@Injectable()
export class RoundService {
  private roundHeight: number = 0;
  private id: string = randomUUID();

  constructor() {
    console.log('RoundService initialized');
  }

  @Interval(5000)
  handleRound() {
    this.roundHeight += 1;
    this.id = randomUUID();
    console.log(`🔄 Finalizing Round ${this.id} at height ${this.roundHeight}`);
  }

  getRoundHeight(): number {
    return this.roundHeight;
  }

  getCurrentRoundId(): string {
    return this.id;
  }
}

