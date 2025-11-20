import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import type { Vtxo } from '@arkswap/protocol';
import { VtxoStore } from './vtxo-store.service';

interface PendingLift {
  address: string;
  amount: number;
}

@Injectable()
export class RoundService {
  private roundHeight: number = 0;
  private id: string = randomUUID();
  private pendingLifts: PendingLift[] = [];

  constructor(private readonly vtxoStore: VtxoStore) {
    console.log('RoundService initialized');
  }

  scheduleLift(address: string, amount: number): void {
    this.pendingLifts.push({ address, amount });
  }

  @Interval(5000)
  handleRound() {
    console.log('🔄 Processing Round...');
    
    const count = this.pendingLifts.length;
    
    // Process each pending lift
    this.pendingLifts.forEach((lift, index) => {
      // Generate a random hex txid (64 hex characters)
      const txid = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      
      const vtxo: Vtxo = {
        txid,
        vout: index,
        amount: lift.amount,
        address: lift.address,
        spent: false,
      };
      
      this.vtxoStore.addVtxo(vtxo);
    });
    
    // Clear pending lifts
    this.pendingLifts = [];
    
    // Update round info
    this.roundHeight += 1;
    this.id = randomUUID();
    
    console.log(`✅ Round Finalized. Issued ${count} VTXOs.`);
  }

  getRoundHeight(): number {
    return this.roundHeight;
  }

  getCurrentRoundId(): string {
    return this.id;
  }
}

