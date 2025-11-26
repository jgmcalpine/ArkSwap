import { z } from 'zod';

/**
 * Branded Types for Type Safety
 * These prevent mixing up different string types at compile time
 */
declare const __brand: unique symbol;

export type Brand<K, T> = K & { [__brand]: T };

/**
 * Domain Primitives with Branded Types
 */
export type TxId = Brand<string, 'TxId'>;
export type Address = Brand<string, 'Address'>; // e.g. bcrt1p...
export type PubkeyHex = Brand<string, 'PubkeyHex'>; // 32-byte hex
export type SignatureHex = Brand<string, 'SignatureHex'>; // 64-byte hex
export type PreimageHex = Brand<string, 'PreimageHex'>;
export type Genome = Brand<string, 'Genome'>; // 32-byte hex (64 hex chars)

/**
 * Casting Helpers (Factories)
 * Useful for tests/mocks to "bless" strings as branded types
 */
export function asTxId(s: string): TxId {
  return s as TxId;
}

export function asAddress(s: string): Address {
  return s as Address;
}

export function asPubkeyHex(s: string): PubkeyHex {
  return s as PubkeyHex;
}

export function asSignatureHex(s: string): SignatureHex {
  return s as SignatureHex;
}

export function asPreimageHex(s: string): PreimageHex {
  return s as PreimageHex;
}

export function asGenome(s: string): Genome {
  return s as Genome;
}

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

/**
 * Zod Schemas for Runtime Validation
 */
export const VtxoSchema = z.object({
  txid: z.string().length(64).transform(s => s as TxId),
  vout: z.number().int().nonnegative(),
  amount: z.number().nonnegative(),
  address: z.string().startsWith('bcrt1').transform(s => s as Address),
  spent: z.boolean(),
});

export const SwapQuoteSchema = z.object({
  id: z.string(),
  amount: z.number().nonnegative(),
  preimageHash: z.string().length(64).transform(s => s as PreimageHex),
  makerPubkey: z.string().length(64).transform(s => s as PubkeyHex),
});

export const ArkInputSchema = z.object({
  txid: z.string().length(64).transform(s => s as TxId),
  vout: z.number().int().nonnegative(),
  signature: z.string().length(128).transform(s => s as SignatureHex),
});

export const ArkOutputSchema = z.object({
  address: z.string().startsWith('bcrt1').transform(s => s as Address),
  amount: z.number().nonnegative(),
});

export const ArkTransactionSchema = z.object({
  inputs: z.array(ArkInputSchema),
  outputs: z.array(ArkOutputSchema),
});

/**
 * Types inferred from Zod Schemas (Single Source of Truth)
 */
export type SwapQuote = z.infer<typeof SwapQuoteSchema>;
export type Vtxo = z.infer<typeof VtxoSchema>;
export type ArkInput = z.infer<typeof ArkInputSchema>;
export type ArkOutput = z.infer<typeof ArkOutputSchema>;
export type ArkTransaction = z.infer<typeof ArkTransactionSchema>;

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

// SAFETY HARNESS: Prevent usage on Mainnet
// This proves the software is for educational purposes only.
export function assertSafeNetwork(networkName: string) {
  if (networkName !== 'regtest' && networkName !== 'testnet') {
    throw new Error(
      '🚨 SAFETY SHUTDOWN: ArkSwap is a Proof of Concept designed for Regtest only. ' +
      'Usage on Mainnet is strictly prohibited and unsafe.'
    );
  }
}

export { createSwapLock, getRefundWitness, createAssetLock, getAssetHash, createAssetPayToPublicKey } from './script';
export type { SwapLockParams, SwapLockResult } from './script';

/**
 * Asset Metadata for SatoshiKoi
 * Contains DNA, generation, cooldown, lineage, and growth points information
 */
export interface AssetMetadata {
  dna: Genome;
  generation: number;
  cooldownBlock: number;
  lastFedBlock: number;
  xp: number; // Growth points for feeding mini-game (default 0)
  parents?: string[]; // Optional array of TxIDs for lineage tracking
}

/**
 * Zod Schema for Asset Metadata
 * Validates DNA (64 hex chars), generation (>= 0), xp (>= 0), and block heights
 */
export const AssetMetadataSchema = z.object({
  dna: z.string().length(64).regex(/^[0-9a-fA-F]+$/).transform(s => s as Genome),
  generation: z.number().int().nonnegative(),
  cooldownBlock: z.number().int().nonnegative(),
  lastFedBlock: z.number().int().nonnegative(),
  xp: z.number().nonnegative().default(0),
  parents: z.array(z.string().length(64)).optional().transform((val) => val ?? []),
});

/**
 * Zod Schema for Asset VTXO
 * Extends VtxoSchema with assetId and metadata validation
 */
export const AssetVtxoSchema = VtxoSchema.extend({
  assetId: z.string().min(1),
  metadata: AssetMetadataSchema,
});

/**
 * Asset VTXO extends standard VTXO with asset-specific metadata
 * Used for SatoshiKoi and other asset-backed VTXOs
 * Type inferred from AssetVtxoSchema (Single Source of Truth)
 */
export type AssetVtxo = z.infer<typeof AssetVtxoSchema>;

export { mixGenomes, generateGenesisDNA } from './genetics';

