import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

interface BitcoinRPCResponse<T> {
  result: T;
  error: null | { code: number; message: string };
  id: string;
}

interface BlockData {
  hash: string;
  height: number;
  tx: Array<{
    txid: string;
    vin: Array<unknown>;
    vout: Array<unknown>;
  }>;
  [key: string]: unknown;
}

@Injectable()
export class BitcoinService {
  private readonly rpcUrl: string;
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    // Default to localhost, but allow override via env
    this.rpcUrl = process.env.BITCOIN_RPC_URL || 'http://localhost:18443';

    this.axiosInstance = axios.create({
      baseURL: this.rpcUrl,
      auth: {
        username: 'ark',
        password: 'ark',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private async callRPC<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await this.axiosInstance.post<BitcoinRPCResponse<T>>('', {
      jsonrpc: '2.0',
      id: '1',
      method,
      params,
    });

    if (response.data.error) {
      throw new Error(
        `Bitcoin RPC error: ${response.data.error.message} (code: ${response.data.error.code})`,
      );
    }

    return response.data.result;
  }

  async getBlockCount(): Promise<number> {
    return this.callRPC<number>('getblockcount');
  }

  async getBlockHash(height: number): Promise<string> {
    return this.callRPC<string>('getblockhash', [height]);
  }

  async getBlock(hash: string, verbosity: 2 = 2): Promise<BlockData> {
    return this.callRPC<BlockData>('getblock', [hash, verbosity]);
  }
}
