import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

interface BitcoinRPCResponse<T> {
  result: T;
  error: null | { code: number; message: string };
  id: string;
}

export interface ScriptPubKey {
  address?: string;
  addresses?: string[];
  asm?: string;
  hex?: string;
  type?: string;
}

export interface Vin {
  txid?: string;
  vout?: number;
  coinbase?: string;
  prevout?: {
    value: number;
    scriptPubKey?: ScriptPubKey;
  };
}

export interface Vout {
  value: number;
  n: number;
  scriptPubKey?: ScriptPubKey;
}

export interface BlockTransaction {
  txid: string;
  vin: Vin[];
  vout: Vout[];
}

export interface BlockData {
  hash: string;
  height: number;
  time?: number;
  tx: BlockTransaction[];
  [key: string]: unknown;
}

export interface RawTransaction {
  txid: string;
  vout: Vout[];
  vin: Vin[];
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
    const requestBody = {
      jsonrpc: '2.0',
      id: '1',
      method,
      params,
    };

    // Log RPC requests for getblock to verify verbosity
    if (method === 'getblock') {
      // eslint-disable-next-line no-console
      console.log(
        `[BitcoinService] RPC Request: ${method} with params:`,
        JSON.stringify(params, null, 2),
      );
    }

    const response = await this.axiosInstance.post<BitcoinRPCResponse<T>>(
      '',
      requestBody,
    );

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
    // Log the RPC call to verify verbosity 2 is being sent
    // eslint-disable-next-line no-console
    console.log(
      `[BitcoinService] Calling getblock with hash=${hash}, verbosity=${verbosity}`,
    );
    return this.callRPC<BlockData>('getblock', [hash, verbosity]);
  }

  /**
   * Gets a raw transaction with full details (verbose mode)
   * @param txid The transaction ID
   * @returns The transaction object with vout details
   */
  async getRawTransaction(txid: string): Promise<RawTransaction> {
    // getrawtransaction with verbose=true returns full transaction details
    return this.callRPC<RawTransaction>('getrawtransaction', [txid, true]);
  }

  /**
   * Gets the UTXO balance for a specific address
   * @param address The Bitcoin address
   * @returns The balance in satoshis
   */
  async getAddressBalance(address: string): Promise<bigint> {
    // Use listunspent to get all unspent outputs for the address
    const unspent = await this.callRPC<
      Array<{
        txid: string;
        vout: number;
        address: string;
        amount: number;
        confirmations: number;
      }>
    >('listunspent', [0, 9999999, [address]]);

    // Sum all unspent amounts (convert BTC to satoshis)
    const totalSats = unspent.reduce((sum, utxo) => {
      return sum + BigInt(Math.round(utxo.amount * 1e8));
    }, 0n);

    return totalSats;
  }
}
