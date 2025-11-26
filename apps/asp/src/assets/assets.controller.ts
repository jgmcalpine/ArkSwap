import { Controller, Get, Post, Body, Param, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AssetStore } from './asset.store';
import { RoundService } from '../round.service';
import {
  AssetMetadataSchema,
  type AssetMetadata,
  generateGenesisDNA,
  createAssetPayToPublicKey,
} from '@arkswap/protocol';

interface SaveMetadataDto {
  txid: string;
  metadata: AssetMetadata;
}

interface GenesisRequestDto {
  userPubkey: string;
  amount: number;
}

@Controller('v1/assets')
export class AssetsController {
  constructor(
    private readonly store: AssetStore,
    private readonly roundService: RoundService,
  ) {}

  @Get()
  getAll(): Record<string, AssetMetadata> {
    return this.store.getAllAsObject();
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
  genesis(@Body() body: GenesisRequestDto): { success: boolean; address: string; status: string; metadata: AssetMetadata } {
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
      const currentBlock = this.roundService.getRoundHeight();
      const metadata: AssetMetadata = {
        dna,
        generation: 0,
        cooldownBlock: currentBlock + 10,
        lastFedBlock: currentBlock,
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
}

