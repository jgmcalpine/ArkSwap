import { Injectable } from '@nestjs/common';
import type { Vtxo } from '@arkswap/protocol';

@Injectable()
export class VtxoStore {
  private vtxos: Vtxo[] = [];

  addVtxo(vtxo: Vtxo): void {
    this.vtxos.push(vtxo);
  }

  getForAddress(address: string): Vtxo[] {
    return this.vtxos.filter(vtxo => vtxo.address === address);
  }
}

