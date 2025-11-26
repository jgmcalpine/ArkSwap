import { Injectable } from '@nestjs/common';
import type { AssetMetadata } from '@arkswap/protocol';

@Injectable()
export class AssetStore {
  private metadata = new Map<string, AssetMetadata>();

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
}

