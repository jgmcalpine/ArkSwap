import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './database/database.module';
import axios from 'axios';

interface AspInfoResponse {
  address: string;
  pubkey: string;
  roundInterval: number;
  network: string;
  currentBlock: number;
}

@Injectable()
export class SeederService implements OnModuleInit {
  private readonly logger = new Logger(SeederService.name);
  private readonly aspApiUrl =
    process.env.ASP_API_URL || 'http://localhost:7070';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedAspDefinition();
    } catch (error) {
      this.logger.error(
        `Failed to seed ASP definition: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async seedAspDefinition(): Promise<void> {
    this.logger.log(`Fetching ASP info from ${this.aspApiUrl}/v1/info...`);

    try {
      const response = await axios.get<AspInfoResponse>(
        `${this.aspApiUrl}/v1/info`,
        {
          timeout: 5000,
        },
      );

      const { address } = response.data;

      if (!address || typeof address !== 'string') {
        throw new Error('ASP API did not return a valid address');
      }

      // Upsert to always sync with the current ASP address
      // This handles Docker restarts where the wallet gets a new address
      await this.prisma.aspDefinition.upsert({
        where: { id: 'local-asp' },
        update: {
          poolAddress: address,
        },
        create: {
          id: 'local-asp',
          name: 'Local Docker ASP',
          poolAddress: address,
          isProduction: false,
        },
      });

      this.logger.log(`[Seeder] Updated ASP Definition to: ${address}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Failed to fetch ASP info: ${error.message}. Make sure the ASP is running.`,
        );
      } else {
        throw error;
      }
    }
  }
}
