export type SwapQuote = {
  id: string;
  amount: number;
};

export { createSwapLock, getRefundWitness } from './script';
export type { SwapLockParams, SwapLockResult } from './script';

