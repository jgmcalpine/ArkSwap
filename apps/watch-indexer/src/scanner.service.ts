import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BitcoinService } from './bitcoin.service';
import { PrismaService } from './database/database.module';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private isSyncing = false;

  constructor(
    private readonly bitcoinService: BitcoinService,
    private readonly prisma: PrismaService,
  ) {}

  @Interval(5000)
  async handleCron(): Promise<void> {
    if (this.isSyncing) {
      this.logger.debug('Sync already in progress, skipping...');
      return;
    }

    try {
      await this.sync();
    } catch (error) {
      this.logger.error(`Error during sync: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async sync(): Promise<void> {
    this.isSyncing = true;

    try {
      // Get last scanned block height, default to 0
      const lastScannedBlock = await this.prisma.scannedBlock.findFirst({
        orderBy: { height: 'desc' },
      });

      const lastScanned = lastScannedBlock?.height ?? 0;

      // Get current chain tip
      const chainTip = await this.bitcoinService.getBlockCount();

      this.logger.log(
        `Sync status: lastScanned=${lastScanned}, chainTip=${chainTip}`,
      );

      // Process blocks sequentially
      let currentHeight = lastScanned;
      while (currentHeight < chainTip) {
        const nextHeight = currentHeight + 1;

        this.logger.log(`Processing Block ${nextHeight}...`);

        // Fetch block hash
        const blockHash = await this.bitcoinService.getBlockHash(nextHeight);

        // Fetch full block data
        const blockData = await this.bitcoinService.getBlock(blockHash, 2);

        // Save to database (upsert in case of re-scan)
        await this.prisma.scannedBlock.upsert({
          where: { height: nextHeight },
          update: {
            hash: blockHash,
            processedAt: new Date(),
          },
          create: {
            height: nextHeight,
            hash: blockHash,
            processedAt: new Date(),
          },
        });

        this.logger.log(`Block ${nextHeight} processed successfully (hash: ${blockHash})`);

        // Move to next block
        currentHeight++;
      }

      const finalHeight = await this.prisma.scannedBlock.findFirst({
        orderBy: { height: 'desc' },
      });

      if (finalHeight && finalHeight.height === chainTip) {
        this.logger.log('Chain is fully synced');
      }
    } finally {
      this.isSyncing = false;
    }
  }
}

