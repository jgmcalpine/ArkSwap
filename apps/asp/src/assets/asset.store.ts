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
}

