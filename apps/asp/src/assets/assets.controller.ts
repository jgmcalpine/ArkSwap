import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AssetStore } from './asset.store';
import { RoundService } from '../round.service';
import { VtxoStore } from '../vtxo-store.service';
import { BitcoinService } from '../bitcoin/bitcoin.service';
import {
  AssetMetadataSchema,
  type AssetMetadata,
  generateGenesisDNA,
  createAssetPayToPublicKey,
  mixGenomes,
} from '@arkswap/protocol';
import { SignatureVerifierService } from './signature-verifier.service';

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

interface BreedRequestDto {
  parent1Id: string;
  parent2Id: string;
  userPubkey: string;
  signature: string;
}

@Controller('v1/assets')
export class AssetsController {
  constructor(
    private readonly store: AssetStore,
    private readonly roundService: RoundService,
    private readonly vtxoStore: VtxoStore,
    private readonly bitcoinService: BitcoinService,
    private readonly signatureVerifier: SignatureVerifierService,
  ) {}

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
      throw new BadRequestException(
        'Invalid request: txid and metadata are required',
      );
    }

    try {
      // Validate metadata using Zod schema
      const validatedMetadata = AssetMetadataSchema.parse(
        body.metadata,
      ) as AssetMetadata;

      this.store.saveMetadata(body.txid, validatedMetadata);

      return { success: true };
    } catch (error) {
      // Check if error is a ZodError by checking for the 'issues' property
      if (
        error &&
        typeof error === 'object' &&
        'issues' in error &&
        Array.isArray((error as { issues: unknown[] }).issues)
      ) {
        const zodError = error as {
          issues: Array<{ path: (string | number)[]; message: string }>;
        };
        throw new BadRequestException(
          `Validation failed: ${zodError.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        );
      }
      throw error;
    }
  }

  @Post('genesis')
  async genesis(@Body() body: GenesisRequestDto): Promise<{
    success: boolean;
    address: string;
    status: string;
    metadata: AssetMetadata;
  }> {
    const { userPubkey, amount } = body;

    if (!userPubkey || typeof amount !== 'number' || amount <= 0) {
      throw new BadRequestException(
        'Invalid request: userPubkey and positive amount are required',
      );
    }

    // Validate userPubkey is 64 hex characters (32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(userPubkey)) {
      throw new BadRequestException(
        'userPubkey must be 64 hex characters (32 bytes)',
      );
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
      throw new BadRequestException(
        `Failed to create genesis asset: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  @Post('feed')
  async feed(
    @Body() body: FeedRequestDto,
  ): Promise<{ success: boolean; metadata: AssetMetadata }> {
    const { txid, signature, message } = body;

    if (!txid || !signature || !message) {
      throw new BadRequestException(
        'Invalid request: txid, signature, and message are required',
      );
    }

    // 1. Verify message format (expecting "Feed <txid>")
    const expectedMessage = `Feed ${txid}`;
    if (message !== expectedMessage) {
      throw new BadRequestException(
        `Invalid message format. Expected: "${expectedMessage}"`,
      );
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
    const isValid = this.signatureVerifier.verifySignatureFromAddress(
      message,
      signature,
      vtxo.address,
    );

    if (!isValid) {
      throw new BadRequestException(`Invalid Schnorr signature for ${txid}`);
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

  @Post('breed')
  async breed(
    @Body() body: BreedRequestDto,
  ): Promise<{ success: boolean; child: AssetMetadata }> {
    const { parent1Id, parent2Id, userPubkey, signature } = body;

    if (!parent1Id || !parent2Id || !userPubkey || !signature) {
      throw new BadRequestException(
        'Invalid request: parent1Id, parent2Id, userPubkey, and signature are required',
      );
    }

    // Validate userPubkey format
    if (!/^[0-9a-fA-F]{64}$/.test(userPubkey)) {
      throw new BadRequestException(
        'userPubkey must be 64 hex characters (32 bytes)',
      );
    }

    // Validate signature format (128 hex chars = 64 bytes)
    if (!/^[0-9a-fA-F]{128}$/.test(signature)) {
      throw new BadRequestException(
        'signature must be 128 hex characters (64 bytes)',
      );
    }

    try {
      // 1. Verify Ownership
      // Message to sign: "Breed ${parent1Id} + ${parent2Id}"
      const expectedMessage = `Breed ${parent1Id} + ${parent2Id}`;

      // Get both parent VTXOs
      const parent1Vtxo = this.vtxoStore.getVtxo(parent1Id, 0);
      const parent2Vtxo = this.vtxoStore.getVtxo(parent2Id, 0);

      if (!parent1Vtxo) {
        throw new BadRequestException(`Parent 1 VTXO not found: ${parent1Id}`);
      }

      if (!parent2Vtxo) {
        throw new BadRequestException(`Parent 2 VTXO not found: ${parent2Id}`);
      }

      if (parent1Vtxo.spent) {
        throw new BadRequestException(
          `Parent 1 VTXO already spent: ${parent1Id}`,
        );
      }

      if (parent2Vtxo.spent) {
        throw new BadRequestException(
          `Parent 2 VTXO already spent: ${parent2Id}`,
        );
      }

      // Get metadata for both parents
      const parent1Metadata = this.store.getMetadata(parent1Id);
      const parent2Metadata = this.store.getMetadata(parent2Id);

      if (!parent1Metadata) {
        throw new BadRequestException(`Parent 1 asset not found: ${parent1Id}`);
      }

      if (!parent2Metadata) {
        throw new BadRequestException(`Parent 2 asset not found: ${parent2Id}`);
      }

      // Verify ownership: Recreate asset addresses from userPubkey + metadata and compare
      const userPubkeyBuffer = Buffer.from(userPubkey, 'hex');
      const parent1ExpectedAddress = createAssetPayToPublicKey(
        userPubkeyBuffer,
        parent1Metadata,
      );
      const parent2ExpectedAddress = createAssetPayToPublicKey(
        userPubkeyBuffer,
        parent2Metadata,
      );

      if (parent1Vtxo.address !== parent1ExpectedAddress) {
        throw new BadRequestException(
          `Parent 1 ownership verification failed: address mismatch`,
        );
      }

      if (parent2Vtxo.address !== parent2ExpectedAddress) {
        throw new BadRequestException(
          `Parent 2 ownership verification failed: address mismatch`,
        );
      }

      // Verify Schnorr Signature matches userPubkey
      const isValid = this.signatureVerifier.verifySignatureFromPubkey(
        expectedMessage,
        signature,
        userPubkey,
      );

      if (!isValid) {
        throw new BadRequestException(
          'Invalid Schnorr signature for breeding request',
        );
      }

      // 2. Genetic Execution
      // Generate entropy (32 bytes)
      const entropy = randomBytes(32);
      const entropyHex = entropy.toString('hex');

      // Call mixGenomes(parent1.dna, parent2.dna, entropy)
      const childDna = mixGenomes(
        parent1Metadata.dna,
        parent2Metadata.dna,
        entropyHex,
      );

      // 3. Economic Execution (Fusion)
      const childValue = parent1Vtxo.amount + parent2Vtxo.amount;
      const childGeneration =
        Math.max(parent1Metadata.generation, parent2Metadata.generation) + 1;

      // Get current block height for cooldown
      const currentBlock = await this.bitcoinService.getBlockHeight();

      // Create child metadata
      const childMetadata: AssetMetadata = {
        dna: childDna,
        generation: childGeneration,
        cooldownBlock: currentBlock + 10,
        lastFedBlock: 0, // Born "Starving" (eligible to feed immediately)
        xp: 0,
        parents: [parent1Id, parent2Id],
        entropy: entropyHex, // Include entropy for client-side verification
      };

      // 4. Minting
      // Calculate childAddress using createAssetPayToPublicKey(userPubkey, childMetadata)
      const childAddress = createAssetPayToPublicKey(
        userPubkeyBuffer,
        childMetadata,
      );

      // Call RoundService.scheduleLift with childAddress and childValue
      this.roundService.scheduleLift(childAddress, childValue, childMetadata);

      // 5. Burn Parents: Mark both parents as spent
      this.vtxoStore.markSpent(parent1Id, 0);
      this.vtxoStore.markSpent(parent2Id, 0);

      return {
        success: true,
        child: childMetadata,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Breeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
