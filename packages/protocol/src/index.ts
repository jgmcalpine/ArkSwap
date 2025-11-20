export type SwapQuote = {
  id: string;
  amount: number;
};

export interface Vtxo {
  txid: string;
  vout: number;
  amount: number;
  address: string;
  spent: boolean;
}

export { createSwapLock, getRefundWitness } from './script';
export type { SwapLockParams, SwapLockResult } from './script';

