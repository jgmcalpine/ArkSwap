/**
 * Interface for Elliptic Curve Cryptography library operations
 * Matches the methods we use from @bitcoinerlab/secp256k1
 */
export interface ECCLibrary {
  /**
   * Checks if a point is valid on the curve
   */
  isPoint(p: Uint8Array): boolean;

  /**
   * Verifies a Schnorr signature
   */
  verifySchnorr(hash: Uint8Array, pubkey: Uint8Array, signature: Uint8Array): boolean;

  /**
   * Signs a hash using Schnorr signature scheme
   */
  signSchnorr(hash: Uint8Array, privateKey: Uint8Array, extraEntropy?: Uint8Array): Uint8Array;

  /**
   * Adds a tweak to a private key (returns null if result is invalid)
   */
  privateAdd(privateKey: Uint8Array, tweak: Uint8Array): Uint8Array | null;

  /**
   * Negates a private key
   */
  privateNegate(privateKey: Uint8Array): Uint8Array;
}

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

export interface ArkInput {
  txid: string;
  vout: number;
  signature: string;
}

export interface ArkOutput {
  address: string;
  amount: number;
}

export interface ArkTransaction {
  inputs: ArkInput[];
  outputs: ArkOutput[];
}

/**
 * Computes the transaction hash for signing/verification
 * Uses a deterministic string format (not JSON) to guarantee identical hashes
 * on both client and server regardless of JSON serialization differences
 * 
 * Format: ark_tx:inputs:txid:vout|txid:vout|...:outputs:address:amount|address:amount|...
 * 
 * Works in both Node.js and browser environments
 */
export async function getTxHash(inputs: Omit<ArkInput, 'signature'>[], outputs: ArkOutput[]): Promise<string> {
  // Build deterministic input string: "txid:vout|txid:vout|..."
  const inputStr = inputs.map(i => `${i.txid}:${i.vout}`).join('|');
  
  // Build deterministic output string: "address:amount|address:amount|..."
  const outputStr = outputs.map(o => `${o.address}:${o.amount}`).join('|');
  
  // Create deterministic payload
  const payload = `ark_tx:inputs:${inputStr}:outputs:${outputStr}`;
  
  // Check if we're in Node.js environment (has require)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeRequire = (typeof require !== 'undefined' ? require : null) as any;
  
  if (nodeRequire) {
    try {
      const nodeCrypto = nodeRequire('crypto');
      return nodeCrypto.createHash('sha256').update(payload, 'utf8').digest('hex');
    } catch {
      // Fall through to browser implementation
    }
  }
  
  // Browser environment - use Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  throw new Error('Crypto API not available');
}

export { createSwapLock, getRefundWitness } from './script';
export type { SwapLockParams, SwapLockResult } from './script';

