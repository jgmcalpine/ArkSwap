import { Injectable } from '@nestjs/common';
import type { AssetMetadata } from '@arkswap/protocol';

@Injectable()
export class AssetStore {
  private metadata = new Map<string, AssetMetadata>();
  private pond = new Set<string>(); // Stores TxIDs of showcased fish

  saveMetadata(txid: string, meta: AssetMetadata): void {
    this.metadata.set(txid, meta);
  }

  getMetadata(txid: string): AssetMetadata | undefined {
    return this.metadata.get(txid);
  }

  getAll(): Map<string, AssetMetadata> {
    return new Map(this.metadata);
  }

  /**
   * Returns all assets as a plain object for JSON serialization
   * Format: { [txid]: AssetMetadata }
   */
  getAllAsObject(): Record<string, AssetMetadata> {
    const result: Record<string, AssetMetadata> = {};
    this.metadata.forEach((metadata, txid) => {
      result[txid] = metadata;
    });
    return result;
  }

  /**
   * Returns the total count of assets
   */
  getTotalCount(): number {
    return this.metadata.size;
  }

  /**
   * Returns rarity distribution based on DNA byte ranges
   * Categorizes by the first visual byte (byte 1) of the DNA
   */
  getRarityDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };

    this.metadata.forEach((metadata) => {
      // Extract first visual byte (byte 1) from DNA (64 hex chars = 32 bytes)
      // Byte 1 is at hex positions 2-3
      if (metadata.dna.length >= 4) {
        const firstVisualByte = parseInt(metadata.dna.slice(2, 4), 16);
        
        if (firstVisualByte < 64) {
          distribution.common++;
        } else if (firstVisualByte < 128) {
          distribution.rare++;
        } else if (firstVisualByte < 192) {
          distribution.epic++;
        } else {
          distribution.legendary++;
        }
      }
    });

    return distribution;
  }

  /**
   * Adds a TxID to the Pond (showcased fish)
   */
  addToPond(txid: string): void {
    this.pond.add(txid);
  }

  /**
   * Returns full metadata for all assets in the Pond
   */
  getPondAssets(): Array<{ txid: string; metadata: AssetMetadata }> {
    const pondAssets: Array<{ txid: string; metadata: AssetMetadata }> = [];
    
    this.pond.forEach((txid) => {
      const metadata = this.metadata.get(txid);
      if (metadata) {
        pondAssets.push({ txid, metadata });
      }
    });
    
    return pondAssets;
  }
}

