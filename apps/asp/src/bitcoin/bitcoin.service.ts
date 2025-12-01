import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  BITCOIN_RPC_URL,
  BITCOIN_RPC_USER,
  BITCOIN_RPC_PASS,
} from './bitcoin.constants';

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
      this.logger.log(
        `Connected to Bitcoin Core. Current block height: ${blockHeight}`,
      );
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
        this.httpService.post<JsonRpcResponse>(BITCOIN_RPC_URL, request, {
          auth: {
            username: BITCOIN_RPC_USER,
            password: BITCOIN_RPC_PASS,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        }),
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

  /**
   * Gets a new address from the default wallet
   */
  async getNewAddress(): Promise<string> {
    const address = await this.callRpc('getnewaddress', []);
    if (typeof address !== 'string') {
      throw new Error('Bitcoin RPC getnewaddress returned non-string result');
    }
    return address;
  }

  /**
   * Sends the given amount of sats to the specified address.
   * Returns the transaction id.
   */
  async sendToAddress(address: string, amountSats: number): Promise<string> {
    const amountBtc = amountSats / 1e8;
    const txid = await this.callRpc('sendtoaddress', [address, amountBtc]);

    if (typeof txid !== 'string') {
      throw new Error('Bitcoin RPC sendtoaddress returned non-string txid');
    }

    this.logger.log(`Sent ${amountSats} sats to ${address}. Txid: ${txid}`);

    return txid;
  }

  /**
   * Broadcasts a heartbeat transaction with OP_RETURN output containing "ARK" marker.
   * This creates a permanent on-chain marker for round detection.
   * @returns The transaction ID
   */
  async broadcastHeartbeat(): Promise<string> {
    // Create raw transaction with OP_RETURN output
    // "ARK" in hex is "41524b"
    // OP_RETURN format: data output with hex "41524b"
    const rawTx = await this.callRpc('createrawtransaction', [
      [], // No inputs initially
      [{ data: '41524b' }], // OP_RETURN output with "ARK" data
    ]);

    if (typeof rawTx !== 'string') {
      throw new Error(
        'Bitcoin RPC createrawtransaction returned non-string result',
      );
    }

    // Fund the transaction (wallet will add inputs and change outputs)
    const fundedTx = await this.callRpc('fundrawtransaction', [rawTx]);

    if (!fundedTx?.hex || typeof fundedTx.hex !== 'string') {
      throw new Error('Bitcoin RPC fundrawtransaction returned invalid result');
    }

    // Sign the transaction
    const signedTx = await this.callRpc('signrawtransactionwithwallet', [
      fundedTx.hex,
    ]);

    if (!signedTx?.hex || typeof signedTx.hex !== 'string') {
      throw new Error(
        'Bitcoin RPC signrawtransactionwithwallet returned invalid result',
      );
    }

    if (signedTx.complete !== true) {
      throw new Error('Transaction signing incomplete');
    }

    // Broadcast the transaction
    const txid = await this.callRpc('sendrawtransaction', [signedTx.hex]);

    if (typeof txid !== 'string') {
      throw new Error(
        'Bitcoin RPC sendrawtransaction returned non-string txid',
      );
    }

    this.logger.log(
      `Broadcast heartbeat transaction with OP_RETURN marker. Txid: ${txid}`,
    );

    return txid;
  }
}
