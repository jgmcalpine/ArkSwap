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

  markSpent(txid: string, vout: number): void {
    const vtxo = this.vtxos.find(v => v.txid === txid && v.vout === vout);
    if (vtxo) {
      vtxo.spent = true;
    }
  }

  getVtxo(txid: string, vout: number): Vtxo | undefined {
    return this.vtxos.find(v => v.txid === txid && v.vout === vout);
  }
}

