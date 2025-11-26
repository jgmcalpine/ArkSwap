import { Controller, Get, Post, Body, Param, BadRequestException, OnModuleInit } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import * as bitcoin from 'bitcoinjs-lib';
import { AssetStore } from './asset.store';
import { RoundService } from '../round.service';
import { VtxoStore } from '../vtxo-store.service';
import { BitcoinService } from '../bitcoin/bitcoin.service';
import {
  AssetMetadataSchema,
  type AssetMetadata,
  generateGenesisDNA,
  createAssetPayToPublicKey,
  type ECCLibrary,
} from '@arkswap/protocol';

interface SaveMetadataDto {
  txid: string;
  metadata: AssetMetadata;
}

interface GenesisRequestDto {
  userPubkey: string;
  amount: number;
}

interface FeedRequestDto {
  txid: string;
  signature: string;
  message: string;
}

@Controller('v1/assets')
export class AssetsController implements OnModuleInit {
  private ecc: ECCLibrary;

  constructor(
    private readonly store: AssetStore,
    private readonly roundService: RoundService,
    private readonly vtxoStore: VtxoStore,
    private readonly bitcoinService: BitcoinService,
  ) {}

  onModuleInit() {
    // Initialize ECC library (same as PondController)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const rawEcc = require('@bitcoinerlab/secp256k1');
      const eccLib = rawEcc.default || rawEcc;
      bitcoin.initEccLib(eccLib);
      this.ecc = eccLib as ECCLibrary;
    } catch (e) {
      console.error('❌ Failed to initialize crypto:', e);
      throw new Error('AssetsController Crypto Init Failed');
    }
  }

  @Get()
  getAll(): Record<string, AssetMetadata> {
    return this.store.getAllAsObject();
  }

  @Get('stats')
  getStats(): { total: number; distribution: Record<string, number> } {
    // Ensure store returns safe defaults - never return undefined
    const total = this.store.getTotalCount() ?? 0;
    const distribution = this.store.getRarityDistribution() ?? {
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };
    
    return {
      total,
      distribution,
    };
  }

  @Get(':txid')
  getMetadata(@Param('txid') txid: string): AssetMetadata | null {
    const metadata = this.store.getMetadata(txid);
    // Return null (200 OK) instead of 404 - "not an asset" is a valid state for a VTXO
    return metadata || null;
  }

  @Post()
  saveMetadata(@Body() body: SaveMetadataDto): { success: boolean } {
    if (!body.txid || !body.metadata) {
      throw new BadRequestException('Invalid request: txid and metadata are required');
    }

    try {
      // Validate metadata using Zod schema
      const validatedMetadata = AssetMetadataSchema.parse(body.metadata) as AssetMetadata;

      this.store.saveMetadata(body.txid, validatedMetadata);

      return { success: true };
    } catch (error) {
      // Check if error is a ZodError by checking for the 'issues' property
      if (error && typeof error === 'object' && 'issues' in error && Array.isArray((error as { issues: unknown[] }).issues)) {
        const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> };
        throw new BadRequestException(
          `Validation failed: ${zodError.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }
      throw error;
    }
  }

  @Post('genesis')
  async genesis(@Body() body: GenesisRequestDto): Promise<{ success: boolean; address: string; status: string; metadata: AssetMetadata }> {
    const { userPubkey, amount } = body;

    if (!userPubkey || typeof amount !== 'number' || amount <= 0) {
      throw new BadRequestException('Invalid request: userPubkey and positive amount are required');
    }

    // Validate userPubkey is 64 hex characters (32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(userPubkey)) {
      throw new BadRequestException('userPubkey must be 64 hex characters (32 bytes)');
    }

    try {
      // 1. Generate 32-byte entropy (random)
      const entropy = randomBytes(32);
      const entropyHex = entropy.toString('hex');

      // 2. Generate DNA: Call generateGenesisDNA(entropy)
      const dna = generateGenesisDNA(entropyHex);

      // 3. Create Metadata: gen: 0, cooldown: currentBlock + 10, xp: 0
      // Set lastFedBlock = 0 so fish is born "Starving" (eligible to feed immediately)
      // This guarantees currentBlock - lastFedBlock is always large, removing timing friction
      const currentBlock = await this.bitcoinService.getBlockHeight();
      const metadata: AssetMetadata = {
        dna,
        generation: 0,
        cooldownBlock: currentBlock + 10,
        lastFedBlock: 0,
        xp: 0,
        parents: [],
      };

      // 4. Calculate Address: Call createAssetPayToPublicKey with the user's pubkey
      const userPubkeyBuffer = Buffer.from(userPubkey, 'hex');
      const address = createAssetPayToPublicKey(userPubkeyBuffer, metadata);

      // 5. Minting: Call RoundService.scheduleLift to create the VTXO with this specific address and metadata
      this.roundService.scheduleLift(address, amount, metadata);

      // 6. Return metadata so client can derive the address and watch it
      return {
        success: true,
        address,
        status: 'queued',
        metadata,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create genesis asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  @Post('feed')
  async feed(@Body() body: FeedRequestDto): Promise<{ success: boolean; metadata: AssetMetadata }> {
    const { txid, signature, message } = body;

    if (!txid || !signature || !message) {
      throw new BadRequestException('Invalid request: txid, signature, and message are required');
    }

    // 1. Verify message format (expecting "Feed <txid>")
    const expectedMessage = `Feed ${txid}`;
    if (message !== expectedMessage) {
      throw new BadRequestException(`Invalid message format. Expected: "${expectedMessage}"`);
    }

    // 2. Get VTXO from Store and verify it exists and is !spent
    const vtxo = this.vtxoStore.getVtxo(txid, 0); // Assuming vout 0 for asset VTXOs
    if (!vtxo) {
      throw new BadRequestException(`VTXO not found: ${txid}`);
    }

    if (vtxo.spent) {
      throw new BadRequestException(`VTXO already spent: ${txid}`);
    }

    // 3. Verify the asset exists
    const metadata = this.store.getMetadata(txid);
    if (!metadata) {
      throw new BadRequestException(`Asset not found: ${txid}`);
    }

    // 4. Verify Signature
    try {
      // Reconstruct the message hash (SHA256)
      const messageHash = createHash('sha256').update(message).digest();
      const messageHashBuffer = Buffer.from(messageHash);

      // Decode VTXO Address -> Pubkey (reuse logic from PondController)
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

    // 5. Get current block height
    const currentBlock = await this.bitcoinService.getBlockHeight();

    // 6. Feed the asset (enforces 72-block cooldown)
    try {
      const updatedMetadata = this.store.feedAsset(txid, currentBlock);
      return { success: true, metadata: updatedMetadata };
    } catch (error) {
      // Handle feedAsset failures (e.g., cooldown not met)
      if (error instanceof Error && error.message.includes('Digesting')) {
        throw new BadRequestException(error.message);
      }
      // Re-throw other errors (e.g., asset not found)
      throw error;
    }
  }
}

