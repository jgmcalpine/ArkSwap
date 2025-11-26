import { Controller, Get, Post, Body, BadRequestException, OnModuleInit } from '@nestjs/common';
import * as bitcoin from 'bitcoinjs-lib';
import { createHash } from 'crypto';
import { AssetStore } from '../assets/asset.store';
import { VtxoStore } from '../vtxo-store.service';
import { ECCLibrary } from '@arkswap/protocol';

interface EnterPondDto {
  txid: string;
  signature: string;
  message: string;
}

@Controller('v1/pond')
export class PondController implements OnModuleInit {
  private ecc: ECCLibrary;

  constructor(
    private readonly assetStore: AssetStore,
    private readonly vtxoStore: VtxoStore,
  ) {}

  onModuleInit() {
    // Initialize ECC library (same as TransferService)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const rawEcc = require('@bitcoinerlab/secp256k1');
      const eccLib = rawEcc.default || rawEcc;
      bitcoin.initEccLib(eccLib);
      this.ecc = eccLib as ECCLibrary;
    } catch (e) {
      console.error('❌ Failed to initialize crypto:', e);
      throw new Error('PondController Crypto Init Failed');
    }
  }

  @Get()
  getPond(): Array<{ txid: string; metadata: any }> {
    // Ensure we always return an array, never undefined
    return this.assetStore.getPondAssets() ?? [];
  }

  @Post('enter')
  async enterPond(@Body() body: EnterPondDto): Promise<{ success: boolean }> {
    const { txid, signature, message } = body;

    if (!txid || !signature || !message) {
      throw new BadRequestException('Invalid request: txid, signature, and message are required');
    }

    // 1. Get VTXO from Store and verify it exists and is !spent
    const vtxo = this.vtxoStore.getVtxo(txid, 0); // Assuming vout 0 for asset VTXOs
    if (!vtxo) {
      throw new BadRequestException(`VTXO not found: ${txid}`);
    }

    if (vtxo.spent) {
      throw new BadRequestException(`VTXO already spent: ${txid}`);
    }

    // 2. Verify the asset exists
    const metadata = this.assetStore.getMetadata(txid);
    if (!metadata) {
      throw new BadRequestException(`Asset not found: ${txid}`);
    }

    // 3. Verify Signature
    try {
      // Reconstruct the message hash (SHA256)
      const messageHash = createHash('sha256').update(message).digest();
      const messageHashBuffer = Buffer.from(messageHash);

      // Decode VTXO Address -> Pubkey (reuse logic from TransferService)
      const outputScript = bitcoin.address.toOutputScript(vtxo.address, bitcoin.networks.regtest);
      
      // Taproot Script is: OP_1 (0x51) <32-byte-pubkey>
      if (outputScript.length !== 34 || outputScript[0] !== 0x51 || outputScript[1] !== 0x20) {
        throw new BadRequestException(`Invalid Taproot script for address ${vtxo.address}`);
      }
      
      const pubkey = Buffer.from(outputScript.slice(2, 34));
      const signatureBuffer = Buffer.from(signature, 'hex');

      // Verify Schnorr Signature
      const isValid = this.ecc.verifySchnorr(messageHashBuffer, pubkey, signatureBuffer);
      
      if (!isValid) {
        throw new BadRequestException(`Invalid Schnorr signature for ${txid}`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Signature verification failed: ${error}`);
    }

    // 4. If valid, add txid to AssetStore.pond
    this.assetStore.addToPond(txid);

    return { success: true };
  }
}

