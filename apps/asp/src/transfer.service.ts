import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import * as bitcoin from 'bitcoinjs-lib';
import { getTxHash, ArkTransaction, ECCLibrary } from '@arkswap/protocol';
import { VtxoStore } from './vtxo-store.service';

@Injectable()
export class TransferService implements OnModuleInit {
  private ecc: ECCLibrary;

  constructor(private readonly vtxoStore: VtxoStore) {}

  onModuleInit() {
    // ROBUST IMPORT PATTERN
    // This fixes the "undefined reading verifySchnorr" error by handling
    // both CommonJS and ESM import styles explicitly.
    try {
      const rawEcc = require('@bitcoinerlab/secp256k1');
      const eccLib = rawEcc.default || rawEcc;
      // Initialize bitcoinjs-lib with the raw library (it implements the full interface)
      bitcoin.initEccLib(eccLib);
      // Store typed reference for our crypto operations
      this.ecc = eccLib as ECCLibrary;
      console.log('✅ ASP Crypto Initialized Successfully');
    } catch (e) {
      console.error('❌ Failed to initialize crypto:', e);
      throw new Error('ASP Crypto Init Failed');
    }
  }

  async validateTransaction(tx: ArkTransaction): Promise<void> {
    // 1. Calculate transaction hash
    // Note: Real Ark uses BIP-341 serialization (SIGHASH_ALL).
    // For this PoC, we use a deterministic string format (not JSON).
    const inputsWithoutSigs = tx.inputs.map(({ txid, vout }) => ({ txid, vout }));
    const txHash = await getTxHash(inputsWithoutSigs, tx.outputs);
    const txHashBuffer = Buffer.from(txHash, 'hex');

    let totalInputAmount = 0;
    let totalOutputAmount = 0;

    // 2. Validate Inputs
    for (const input of tx.inputs) {
      // Check Existence
      const vtxo = this.vtxoStore.getVtxo(input.txid, input.vout);
      if (!vtxo) {
        throw new BadRequestException(`VTXO not found: ${input.txid}:${input.vout}`);
      }
      
      // Check Double Spend (Committed)
      if (vtxo.spent) {
        throw new BadRequestException(`VTXO already spent: ${input.txid}:${input.vout}`);
      }

      // Verify Ownership
      try {
        // Decode Address to Pubkey
        // Use toOutputScript to get byte-perfect script, then extract pubkey
        // Must specify regtest network to accept bcrt1 addresses
        const outputScript = bitcoin.address.toOutputScript(vtxo.address, bitcoin.networks.regtest);
        
        // Taproot Script is: OP_1 (0x51) <32-byte-pubkey>
        // So we slice from index 2 to 34
        if (outputScript.length !== 34 || outputScript[0] !== 0x51 || outputScript[1] !== 0x20) {
          throw new BadRequestException(`Invalid Taproot script for address ${vtxo.address}`);
        }
        
        const pubkey = Buffer.from(outputScript.slice(2, 34));
        const signature = Buffer.from(input.signature, 'hex');

        // Verify Schnorr Signature
        const isValid = this.ecc.verifySchnorr(txHashBuffer, pubkey, signature);
        
        if (!isValid) {
          throw new BadRequestException(`Invalid Schnorr signature for input ${input.txid}`);
        }
      } catch (error) {
        // Unwrap BadRequestExceptions to keep messages clean
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException(`Signature verification failed: ${error}`);
      }

      totalInputAmount += vtxo.amount;
    }

    // 3. Validate Outputs
    for (const output of tx.outputs) {
      if (output.amount <= 0) {
        throw new BadRequestException(`Invalid output amount: ${output.amount}`);
      }
      totalOutputAmount += output.amount;
    }

    // 4. Verify Solvency (Inputs >= Outputs)
    if (totalInputAmount < totalOutputAmount) {
      throw new BadRequestException(
        `Insufficient inputs: ${totalInputAmount} < ${totalOutputAmount}`,
      );
    }
  }
}