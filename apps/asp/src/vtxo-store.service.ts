import { Injectable } from '@nestjs/common';
import type { Vtxo } from '@arkswap/protocol';
import { asAddress, asTxId } from '@arkswap/protocol';

@Injectable()
export class VtxoStore {
  private vtxos: Vtxo[] = [];

  addVtxo(vtxo: Vtxo): void {
    this.vtxos.push(vtxo);
  }

  getForAddress(address: string): Vtxo[] {
    const addressBranded = asAddress(address);
    return this.vtxos.filter((vtxo) => vtxo.address === addressBranded);
  }

  markSpent(txid: string, vout: number): void {
    const txidBranded = asTxId(txid);
    const vtxo = this.vtxos.find(
      (v) => v.txid === txidBranded && v.vout === vout,
    );
    if (vtxo) {
      vtxo.spent = true;
    }
  }

  getVtxo(txid: string, vout: number): Vtxo | undefined {
    const txidBranded = asTxId(txid);
    return this.vtxos.find((v) => v.txid === txidBranded && v.vout === vout);
  }
}
