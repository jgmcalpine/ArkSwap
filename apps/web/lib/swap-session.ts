import type { SwapQuoteResponse } from './api';

export type SwapStep =
  | 'quote'
  | 'locking'
  | 'success'
  | 'pendingRefund'
  | 'refundSuccess';

export interface SwapSession {
  step: SwapStep;
  amount: string;
  quote: SwapQuoteResponse | null;
  lockAddress: string | null;
  userL1Address: string;
  l1TxId: string | null;
  // Refund state
  startBlock: number | null;
  timeoutBlock: number | null;
}

const STORAGE_KEY = 'ark_swap_session';

export function saveSession(session: SwapSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save swap session:', error);
  }
}

export function loadSession(): SwapSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const session = JSON.parse(stored) as SwapSession;

    // Validate session structure
    if (
      typeof session.step === 'string' &&
      typeof session.amount === 'string' &&
      typeof session.userL1Address === 'string' &&
      (session.quote === null || typeof session.quote === 'object') &&
      (session.lockAddress === null ||
        typeof session.lockAddress === 'string') &&
      (session.l1TxId === null || typeof session.l1TxId === 'string') &&
      (session.startBlock === null || typeof session.startBlock === 'number') &&
      (session.timeoutBlock === null ||
        typeof session.timeoutBlock === 'number')
    ) {
      // If caught in 'locking' step, revert to 'quote' to prevent spinner loops
      if (session.step === 'locking') {
        session.step = 'quote';
      }

      return session;
    }

    // Invalid session structure, clear it
    clearSession();
    return null;
  } catch (error) {
    console.error('Failed to load swap session:', error);
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear swap session:', error);
  }
}
