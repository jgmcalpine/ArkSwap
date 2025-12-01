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

  /**
   * Feeds an asset, updating lastFedBlock and incrementing XP
   * Enforces 72-block cooldown (12-hour "Bitcoin Day" allows 2 feeds)
   * @param txid - The transaction ID of the asset
   * @param currentBlock - The current block height
   * @returns The updated metadata
   * @throws Error if asset not found or cooldown not met
   */
  feedAsset(txid: string, currentBlock: number): AssetMetadata {
    const metadata = this.metadata.get(txid);
    if (!metadata) {
      throw new Error(`Asset not found: ${txid}`);
    }

    // Enforce 72-block cooldown (allows 2 feeds per 144-block "Bitcoin Day")
    // Check if enough blocks have passed since last feed
    const diff = currentBlock - metadata.lastFedBlock;
    if (diff < 72) {
      throw new Error(
        `Digesting. Block Age: ${diff}. Required: 72. Current: ${currentBlock}, Last: ${metadata.lastFedBlock}`,
      );
    }

    // Update lastFedBlock and increment XP by 10 (Daily growth bonus)
    const updatedMetadata: AssetMetadata = {
      ...metadata,
      lastFedBlock: currentBlock,
      xp: metadata.xp + 10,
    };

    this.metadata.set(txid, updatedMetadata);
    return updatedMetadata;
  }
}
