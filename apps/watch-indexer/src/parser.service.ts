import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './database/database.module';
import { BitcoinService } from './bitcoin.service';
import type { BlockData, BlockTransaction, Vin, Vout } from './bitcoin.service';

interface ParsedAmounts {
  inputAmount: bigint;
  outputAmount: bigint;
  vtxoCount: number;
}

@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitcoinService: BitcoinService,
  ) {}

  /**
   * Checks if an output contains the OP_RETURN marker for Ark rounds.
   * The marker is "ARK" (hex: 41524b) in an OP_RETURN output.
   * Expected format: OP_RETURN (6a) + push 3 bytes (03) + "ARK" (41524b)
   * Full hex: 6a0341524b
   */
  private hasArkMarker(vout: Vout): boolean {
    const scriptPubKey = vout.scriptPubKey;

    if (!scriptPubKey) {
      return false;
    }

    // Check if it's an OP_RETURN output
    if (scriptPubKey.asm && scriptPubKey.asm.startsWith('OP_RETURN')) {
      // Check if the hex contains the "ARK" marker
      // The hex should contain "41524b" (ARK in hex)
      // Format: 6a (OP_RETURN) + 03 (push 3 bytes) + 41524b (ARK)
      if (scriptPubKey.hex && scriptPubKey.hex.includes('41524b')) {
        return true;
      }
    }

    // Also check hex directly for the pattern
    if (scriptPubKey.hex) {
      // Look for OP_RETURN (6a) followed by push opcode and "ARK" (41524b)
      // The pattern 6a0341524b means: OP_RETURN + push 3 bytes + "ARK"
      if (scriptPubKey.hex.includes('6a0341524b')) {
        return true;
      }
    }

    return false;
  }

  private static calculateAmounts(tx: BlockTransaction): ParsedAmounts {
    let inputAmount = 0n;
    let outputAmount = 0n;

    const toSats = (value: number | undefined): bigint => {
      if (typeof value !== 'number') {
        return 0n;
      }

      // Bitcoin Core reports values in BTC as number.
      // For regtest/small amounts this conversion is sufficient.
      return BigInt(Math.round(value * 1e8));
    };

    tx.vin.forEach((vin: Vin) => {
      inputAmount += toSats(vin.prevout?.value);
    });

    tx.vout.forEach((vout: Vout) => {
      outputAmount += toSats(vout.value);
    });

    return {
      inputAmount,
      outputAmount,
      vtxoCount: tx.vout.length,
    };
  }

  async parseBlock(blockData: BlockData): Promise<void> {
    if (!Array.isArray(blockData.tx) || blockData.tx.length === 0) {
      return;
    }

    const blockHeight = blockData.height;
    const blockTimeSeconds =
      typeof blockData.time === 'number' ? blockData.time : undefined;
    const blockTimestamp = blockTimeSeconds
      ? new Date(blockTimeSeconds * 1000)
      : new Date();

    this.logger.log(
      `[Parser] Parsing block ${blockHeight} with ${blockData.tx.length} transactions`,
    );

    for (const tx of blockData.tx) {
      this.logger.debug(`[Parser] Checking Tx: ${tx.txid}`);

      // Check outputs for OP_RETURN marker
      let foundMarker = false;

      for (const vout of tx.vout) {
        if (this.hasArkMarker(vout)) {
          foundMarker = true;
          break;
        }
      }

      if (!foundMarker) {
        continue;
      }

      this.logger.log(
        `🚨 MATCH FOUND! Ark Round Detected via Marker: ${tx.txid}`,
      );

      const { inputAmount, outputAmount, vtxoCount } =
        ParserService.calculateAmounts(tx);

      // Calculate tree depth from vtxoCount
      // Tree depth is approximately log2(vtxoCount) for a balanced tree
      const treeDepth = vtxoCount > 0 ? Math.ceil(Math.log2(vtxoCount)) : 0;

      // Use 'local-asp' as default aspId since we found the marker
      // In the future, this could be looked up from a registry or database
      const aspId = 'local-asp';

      const data: Prisma.ArkRoundUncheckedCreateInput = {
        txid: tx.txid,
        aspId,
        blockHeight,
        timestamp: blockTimestamp,
        inputAmount,
        outputAmount,
        vtxoCount,
        treeDepth,
      };

      // Idempotent: upsert by txid so re-scans do not fail.
      try {
        await this.prisma.arkRound.upsert({
          where: { txid: tx.txid },
          update: data,
          create: data,
        });

        this.logger.log(
          `[Parser] ✅ Indexed ArkRound tx=${tx.txid} aspId=${aspId} height=${blockHeight}`,
        );
      } catch (error) {
        this.logger.error(
          `[Parser] ❌ Failed to insert ArkRound for tx=${tx.txid}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }
  }
}
