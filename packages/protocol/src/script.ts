import * as bitcoin from 'bitcoinjs-lib';
import type { Taptree } from 'bitcoinjs-lib/src/types';
import ecc from '@bitcoinerlab/secp256k1';
import stringify from 'fast-json-stable-stringify';
import type { AssetMetadata } from './index';

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

// Regtest network
const NETWORK = bitcoin.networks.regtest;

// H = lift_x(0x50929b...)
// This is a standard NUMS (Nothing Up My Sleeve) point specified in BIP-341
const H_POINT = Buffer.from(
  '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
  'hex'
);

export interface SwapLockParams {
  makerPubkey: Buffer;
  userPubkey: Buffer;
  preimageHash: Buffer;
  timeoutBlocks: number;
}

export interface SwapLockResult {
  address: string;
  output: Buffer;
  controlBlock: Buffer;
  controlBlockRefund: Buffer;
  leaves: {
    claim: Buffer;
    refund: Buffer;
  };
}

export function createSwapLock(params: SwapLockParams): SwapLockResult {
  const { makerPubkey, userPubkey, preimageHash, timeoutBlocks } = params;

  // --- VALIDATION FIXES ---
  if (makerPubkey.length !== 32) {
    throw new Error('makerPubkey must be 32 bytes');
  }
  if (userPubkey.length !== 32) {
    throw new Error('userPubkey must be 32 bytes');
  }
  if (preimageHash.length !== 32) {
    throw new Error('preimageHash must be 32 bytes');
  }
  // Added validation for timeoutBlocks to satisfy test requirements
  if (timeoutBlocks < 1 || timeoutBlocks > 0xffffffff) {
    throw new Error('timeoutBlocks must be between 1 and 0xffffffff');
  }

  // 1. Build Claim Script
  // Path: Maker can spend if they provide Preimage + Signature
  const claimScript = bitcoin.script.compile([
    bitcoin.opcodes.OP_SHA256,
    preimageHash,
    bitcoin.opcodes.OP_EQUALVERIFY,
    makerPubkey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);

  // 2. Build Refund Script
  // Path: User can spend after timeout + Signature
  const refundScript = bitcoin.script.compile([
    bitcoin.script.number.encode(timeoutBlocks),
    bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoin.opcodes.OP_DROP,
    userPubkey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);

  // 3. Create Tree
  const scriptTree: Taptree = [
    { output: claimScript },
    { output: refundScript },
  ];

  // 4. Generate the Address (The "Lock")
  const lockPayment = bitcoin.payments.p2tr({
    internalPubkey: H_POINT,
    scriptTree,
    network: NETWORK,
  });

  if (!lockPayment.address || !lockPayment.output) {
    throw new Error('Failed to generate address');
  }

  // 5. Generate Control Blocks
  const claimPayment = bitcoin.payments.p2tr({
    internalPubkey: H_POINT,
    scriptTree,
    redeem: { output: claimScript },
    network: NETWORK,
  });

  const refundPayment = bitcoin.payments.p2tr({
    internalPubkey: H_POINT,
    scriptTree,
    redeem: { output: refundScript },
    network: NETWORK,
  });

  if (!claimPayment.witness || !refundPayment.witness) {
    throw new Error('Failed to generate witness data');
  }

  // The last element of the witness stack is the Control Block
  const claimControlBlock = claimPayment.witness[claimPayment.witness.length - 1];
  const refundControlBlock = refundPayment.witness[refundPayment.witness.length - 1];

  return {
    address: lockPayment.address,
    output: lockPayment.output,
    controlBlock: claimControlBlock,
    controlBlockRefund: refundControlBlock,
    leaves: {
      claim: claimScript,
      refund: refundScript,
    },
  };
}

/**
 * Constructs the Witness Stack for the Refund Path
 * Stack Order (Bottom to Top for Taproot Script Path):
 * 1. signature
 * 2. refundScript (from swapResult.leaves.refund)
 * 3. controlBlockRefund (from swapResult.controlBlockRefund)
 */
export function getRefundWitness(
  signature: Buffer,
  lockParams: SwapLockParams,
  swapResult: SwapLockResult,
): Buffer[] {
  return [
    signature,
    swapResult.leaves.refund,
    swapResult.controlBlockRefund,
  ];
}

/**
 * Computes a deterministic SHA256 hash of Asset Metadata
 * Only includes immutable fields that define the asset's identity:
 * - dna: The genetic code
 * - generation: The generation number
 * - cooldownBlock: The cooldown block (set at creation)
 * - parents: Lineage tracking
 * 
 * Explicitly excludes mutable fields:
 * - xp: Changes when feeding
 * - lastFedBlock: Changes when feeding
 * - assetId: Not part of core identity (if present)
 * 
 * Uses fast-json-stable-stringify to ensure consistent key ordering
 * Normalizes parents field: undefined -> [] to ensure consistent hashing
 */
export function getAssetHash(metadata: AssetMetadata): Buffer {
  // Create sanitized object with only immutable fields
  const immutableMetadata = {
    dna: metadata.dna,
    generation: metadata.generation,
    cooldownBlock: metadata.cooldownBlock,
    parents: metadata.parents ?? [], // Normalize undefined -> [] for consistent hashing
  };
  const serialized = stringify(immutableMetadata);
  return bitcoin.crypto.sha256(Buffer.from(serialized, 'utf8'));
}

/**
 * Creates a simple P2TR address for holding an asset (not swapping it)
 * The address is generated by tweaking the user's pubkey with the asset hash
 * 
 * @param userPubkey - User's x-only public key (32 bytes)
 * @param metadata - Asset metadata to generate deterministic address
 * @returns Taproot address string (bcrt1p...)
 */
export function createAssetPayToPublicKey(
  userPubkey: Buffer,
  metadata: AssetMetadata,
): string {
  // Validate userPubkey
  if (userPubkey.length !== 32) {
    throw new Error('userPubkey must be 32 bytes (x-only pubkey)');
  }

  // 1. Calculate tweak from asset metadata hash
  const tweak = getAssetHash(metadata);

  // 2. Tweak the user's pubkey
  // Use xOnlyPointAddTweak since userPubkey is an x-only point (32 bytes)
  const tweakResult = ecc.xOnlyPointAddTweak(userPubkey, tweak);
  if (!tweakResult || !tweakResult.xOnlyPubkey) {
    throw new Error('Failed to generate tweaked pubkey (xOnlyPointAddTweak returned null)');
  }
  // Convert Uint8Array to Buffer for bitcoinjs-lib compatibility
  const tweakedPubkey = Buffer.from(tweakResult.xOnlyPubkey);

  // 3. Generate P2TR address
  // Use internalPubkey so bitcoinjs-lib applies the Taproot tweak (BIP-86)
  // This matches the signing logic in signPondEntry which applies both asset and Taproot tweaks
  const payment = bitcoin.payments.p2tr({
    internalPubkey: tweakedPubkey,
    network: NETWORK,
  });

  if (!payment.address) {
    throw new Error('Failed to generate address');
  }

  return payment.address;
}

/**
 * Creates a Taproot address cryptographically bound to specific Asset Metadata
 * The address is generated by tweaking H_POINT with the hash of the asset metadata
 */
export function createAssetLock(
  params: SwapLockParams,
  metadata: AssetMetadata,
): SwapLockResult {
  const { makerPubkey, userPubkey, preimageHash, timeoutBlocks } = params;

  // Validate params (same validation as createSwapLock)
  if (makerPubkey.length !== 32) {
    throw new Error('makerPubkey must be 32 bytes');
  }
  if (userPubkey.length !== 32) {
    throw new Error('userPubkey must be 32 bytes');
  }
  if (preimageHash.length !== 32) {
    throw new Error('preimageHash must be 32 bytes');
  }
  if (timeoutBlocks < 1 || timeoutBlocks > 0xffffffff) {
    throw new Error('timeoutBlocks must be between 1 and 0xffffffff');
  }

  // 1. Calculate asset tweak from metadata hash
  const assetTweak = getAssetHash(metadata);

  // 2. Tweak the H_POINT to create asset-specific internal key
  // This creates a new public key that is unique to this asset
  // Use xOnlyPointAddTweak since H_POINT is an x-only point (32 bytes)
  const tweakResult = ecc.xOnlyPointAddTweak(H_POINT, assetTweak);
  if (!tweakResult || !tweakResult.xOnlyPubkey) {
    throw new Error('Failed to generate asset internal key (xOnlyPointAddTweak returned null)');
  }
  // Convert Uint8Array to Buffer for bitcoinjs-lib compatibility
  const assetInternalKey = Buffer.from(tweakResult.xOnlyPubkey);

  // 3. Build Claim Script (same as createSwapLock)
  const claimScript = bitcoin.script.compile([
    bitcoin.opcodes.OP_SHA256,
    preimageHash,
    bitcoin.opcodes.OP_EQUALVERIFY,
    makerPubkey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);

  // 4. Build Refund Script (same as createSwapLock)
  const refundScript = bitcoin.script.compile([
    bitcoin.script.number.encode(timeoutBlocks),
    bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
    bitcoin.opcodes.OP_DROP,
    userPubkey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);

  // 5. Create Tree
  const scriptTree: Taptree = [
    { output: claimScript },
    { output: refundScript },
  ];

  // 6. Generate the Address using the asset-specific internal key
  const lockPayment = bitcoin.payments.p2tr({
    internalPubkey: assetInternalKey,
    scriptTree,
    network: NETWORK,
  });

  if (!lockPayment.address || !lockPayment.output) {
    throw new Error('Failed to generate address');
  }

  // 7. Generate Control Blocks using the asset-specific internal key
  const claimPayment = bitcoin.payments.p2tr({
    internalPubkey: assetInternalKey,
    scriptTree,
    redeem: { output: claimScript },
    network: NETWORK,
  });

  const refundPayment = bitcoin.payments.p2tr({
    internalPubkey: assetInternalKey,
    scriptTree,
    redeem: { output: refundScript },
    network: NETWORK,
  });

  if (!claimPayment.witness || !refundPayment.witness) {
    throw new Error('Failed to generate witness data');
  }

  // The last element of the witness stack is the Control Block
  const claimControlBlock = claimPayment.witness[claimPayment.witness.length - 1];
  const refundControlBlock = refundPayment.witness[refundPayment.witness.length - 1];

  return {
    address: lockPayment.address,
    output: lockPayment.output,
    controlBlock: claimControlBlock,
    controlBlockRefund: refundControlBlock,
    leaves: {
      claim: claimScript,
      refund: refundScript,
    },
  };
}