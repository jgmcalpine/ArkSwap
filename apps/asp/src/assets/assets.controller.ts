import { Controller, Get, Post, Body, Param, NotFoundException, BadRequestException } from '@nestjs/common';
import { AssetStore } from './asset.store';
import { AssetMetadataSchema, type AssetMetadata } from '@arkswap/protocol';

interface SaveMetadataDto {
  txid: string;
  metadata: AssetMetadata;
}

@Controller('v1/assets')
export class AssetsController {
  constructor(private readonly store: AssetStore) {}

  @Get(':txid')
  getMetadata(@Param('txid') txid: string): AssetMetadata {
    const metadata = this.store.getMetadata(txid);
    if (!metadata) {
      throw new NotFoundException(`Asset metadata not found for txid: ${txid}`);
    }
    return metadata;
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
}

