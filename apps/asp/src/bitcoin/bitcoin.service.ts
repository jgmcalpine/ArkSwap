import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BITCOIN_RPC_URL, BITCOIN_RPC_USER, BITCOIN_RPC_PASS } from './bitcoin.constants';

interface JsonRpcRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params: any[];
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

@Injectable()
export class BitcoinService implements OnModuleInit {
  private readonly logger = new Logger(BitcoinService.name);
  private requestIdCounter = 0;

  constructor(private readonly httpService: HttpService) {}

  async onModuleInit(): Promise<void> {
    try {
      const blockHeight = await this.getBlockHeight();
      this.logger.log(`Connected to Bitcoin Core. Current block height: ${blockHeight}`);
    } catch (error) {
      this.logger.error(
        'Failed to connect to Bitcoin Core or retrieve block height',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async callRpc(method: string, params: any[]): Promise<any> {
    const requestId = (++this.requestIdCounter).toString();
    const request: JsonRpcRequest = {
      jsonrpc: '1.0',
      id: requestId,
      method,
      params,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<JsonRpcResponse>(
          BITCOIN_RPC_URL,
          request,
          {
            auth: {
              username: BITCOIN_RPC_USER,
              password: BITCOIN_RPC_PASS,
            },
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      if (response.data.error) {
        throw new Error(
          `Bitcoin RPC error: ${response.data.error.message} (code: ${response.data.error.code})`,
        );
      }

      return response.data.result;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to call Bitcoin RPC: ${String(error)}`);
    }
  }

  /**
   * Gets the current Bitcoin block height
   * @returns The current block height as a number
   */
  async getBlockHeight(): Promise<number> {
    const blockCount = await this.callRpc('getblockcount', []);
    return Number(blockCount);
  }
}

