import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bitcoin from 'bitcoinjs-lib';
import type { ECCLibrary } from '@arkswap/protocol';

/**
 * Service for verifying Schnorr signatures
 * Extracted to avoid duplication between controllers
 */
@Injectable()
export class SignatureVerifierService implements OnModuleInit {
  private ecc: ECCLibrary;

  onModuleInit() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const rawEcc = require('@bitcoinerlab/secp256k1');
      const eccLib = rawEcc.default || rawEcc;
      bitcoin.initEccLib(eccLib);
      this.ecc = eccLib as ECCLibrary;
    } catch (e) {
      console.error('❌ Failed to initialize crypto:', e);
      throw new Error('SignatureVerifierService Crypto Init Failed');
    }
  }

  /**
   * Verifies a Schnorr signature against a pubkey derived from a Taproot address
   * Used for verifying signatures from asset VTXOs (tweaked addresses)
   * 
   * @param message - The message that was signed
   * @param signature - Hex string signature (128 hex chars = 64 bytes)
   * @param address - Taproot address to extract pubkey from
   * @returns true if signature is valid
   * @throws BadRequestException if verification fails
   */
  verifySignatureFromAddress(
    message: string,
    signature: string,
    address: string,
  ): boolean {
    try {
      // Reconstruct the message hash (SHA256)
      const messageHash = createHash('sha256').update(message).digest();
      const messageHashBuffer = Buffer.from(messageHash);

      // Decode VTXO Address -> Pubkey
      const outputScript = bitcoin.address.toOutputScript(address, bitcoin.networks.regtest);
      
      // Taproot Script is: OP_1 (0x51) <32-byte-pubkey>
      if (outputScript.length !== 34 || outputScript[0] !== 0x51 || outputScript[1] !== 0x20) {
        throw new BadRequestException(`Invalid Taproot script for address ${address}`);
      }
      
      const pubkey = Buffer.from(outputScript.slice(2, 34));
      const signatureBuffer = Buffer.from(signature, 'hex');

      // Verify Schnorr Signature
      return this.ecc.verifySchnorr(messageHashBuffer, pubkey, signatureBuffer);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Signature verification failed: ${error}`);
    }
  }

  /**
   * Verifies a Schnorr signature against a base user pubkey (not tweaked)
   * Used for breeding where signature is created with base pubkey
   * 
   * @param message - The message that was signed
   * @param signature - Hex string signature (128 hex chars = 64 bytes)
   * @param userPubkey - Base user pubkey (64 hex chars = 32 bytes)
   * @returns true if signature is valid
   * @throws BadRequestException if verification fails
   */
  verifySignatureFromPubkey(
    message: string,
    signature: string,
    userPubkey: string,
  ): boolean {
    try {
      // Validate userPubkey format
      if (!/^[0-9a-fA-F]{64}$/.test(userPubkey)) {
        throw new BadRequestException('userPubkey must be 64 hex characters (32 bytes)');
      }

      // Reconstruct the message hash (SHA256)
      const messageHash = createHash('sha256').update(message).digest();
      const messageHashBuffer = Buffer.from(messageHash);

      // Convert hex pubkey to Buffer
      const pubkeyBuffer = Buffer.from(userPubkey, 'hex');
      const signatureBuffer = Buffer.from(signature, 'hex');

      // Verify Schnorr Signature
      return this.ecc.verifySchnorr(messageHashBuffer, pubkeyBuffer, signatureBuffer);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Signature verification failed: ${error}`);
    }
  }
}

