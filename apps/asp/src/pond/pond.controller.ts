import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { AssetStore } from '../assets/asset.store';
import { VtxoStore } from '../vtxo-store.service';
import { SignatureVerifierService } from '../assets/signature-verifier.service';

interface EnterPondDto {
  txid: string;
  signature: string;
  message: string;
}

@Controller('v1/pond')
export class PondController {
  constructor(
    private readonly assetStore: AssetStore,
    private readonly vtxoStore: VtxoStore,
    private readonly signatureVerifier: SignatureVerifierService,
  ) {}

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
    const isValid = this.signatureVerifier.verifySignatureFromAddress(message, signature, vtxo.address);
    
    if (!isValid) {
      throw new BadRequestException(`Invalid Schnorr signature for ${txid}`);
    }

    // 4. If valid, add txid to AssetStore.pond
    this.assetStore.addToPond(txid);

    return { success: true };
  }
}

