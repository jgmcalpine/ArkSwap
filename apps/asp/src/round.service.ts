import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import type { Vtxo, ArkTransaction, AssetMetadata } from '@arkswap/protocol';
import { asTxId, asAddress } from '@arkswap/protocol';
import { VtxoStore } from './vtxo-store.service';
import { TransferService } from './transfer.service';
import { AssetStore } from './assets/asset.store';
import { BitcoinService } from './bitcoin/bitcoin.service';

interface PendingLift {
  address: string;
  amount: number;
  metadata?: AssetMetadata;
}

@Injectable()
export class RoundService {
  private roundHeight: number = 0;
  private id: string = randomUUID();
  private pendingLifts: PendingLift[] = [];
  private pendingTxs: ArkTransaction[] = [];

  constructor(
    private readonly vtxoStore: VtxoStore,
    private readonly transferService: TransferService,
    private readonly assetStore: AssetStore,
    private readonly bitcoinService: BitcoinService,
  ) {
    console.log('RoundService initialized');
  }

  scheduleLift(
    address: string,
    amount: number,
    metadata?: AssetMetadata,
  ): void {
    this.pendingLifts.push({ address, amount, metadata });
  }

  async submitTx(tx: ArkTransaction): Promise<void> {
    // Validate the transaction
    await this.transferService.validateTransaction(tx);
    // Add to pending queue
    this.pendingTxs.push(tx);
  }

  @Interval(5000)
  async handleRound(): Promise<void> {
    console.log('🔄 Processing Round...');

    // Process pending transactions BEFORE processing lifts
    if (this.pendingTxs.length > 0) {
      const txs = [...this.pendingTxs];
      this.pendingTxs = [];

      for (const tx of txs) {
        // Mark inputs as spent
        for (const input of tx.inputs) {
          this.vtxoStore.markSpent(input.txid, input.vout);
        }

        // Mint new VTXOs for outputs
        tx.outputs.forEach((output, index) => {
          // Generate a random hex txid (64 hex characters)
          const txid = Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16),
          ).join('');

          const vtxo: Vtxo = {
            txid: asTxId(txid),
            vout: index,
            amount: output.amount,
            address: output.address,
            spent: false,
          };

          this.vtxoStore.addVtxo(vtxo);
        });
      }

      console.log(`🔄 Processed ${txs.length} off-chain transfers.`);
    }

    const count = this.pendingLifts.length;

    // Process each pending lift
    this.pendingLifts.forEach((lift, index) => {
      // Generate a random hex txid (64 hex characters)
      const txid = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join('');

      const vtxo: Vtxo = {
        txid: asTxId(txid),
        vout: index,
        amount: lift.amount,
        address: asAddress(lift.address),
        spent: false,
      };

      this.vtxoStore.addVtxo(vtxo);

      // If metadata exists, save it using the newly generated txid
      if (lift.metadata) {
        this.assetStore.saveMetadata(txid, lift.metadata);
        console.log(`🐟 Asset Minted: ${txid}`);
      }
    });

    // Clear pending lifts
    this.pendingLifts = [];

    // Update round info
    this.roundHeight += 1;
    this.id = randomUUID();

    // Broadcast a heartbeat transaction with OP_RETURN marker each round
    // so the indexer can detect rounds via the marker instead of address matching.
    try {
      const txid = await this.bitcoinService.broadcastHeartbeat();

      console.log(`📡 Broadcast Round with Marker: ${txid}`);
    } catch (error) {
      // We do not want heartbeat failures to break the round processing.
      console.error(
        'Failed to broadcast round anchor transaction',
        error instanceof Error ? error.message : String(error),
      );
    }

    console.log(`✅ Round Finalized. Issued ${count} VTXOs.`);
  }

  getRoundHeight(): number {
    return this.roundHeight;
  }

  getCurrentRoundId(): string {
    return this.id;
  }
}
