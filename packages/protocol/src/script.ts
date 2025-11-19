import * as bitcoin from 'bitcoinjs-lib';
import type { Taptree } from 'bitcoinjs-lib/src/types';
import ecc from '@bitcoinerlab/secp256k1';

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