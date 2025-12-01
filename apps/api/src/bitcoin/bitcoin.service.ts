import {
  Injectable,
  Logger,
  OnModuleInit,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
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
      const balance = await this.getBalance();
      this.logger.log(`Connected to Bitcoin Core. Balance: ${balance} BTC`);
    } catch (error) {
      this.logger.error(
        'Failed to connect to Bitcoin Core or retrieve balance',
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

  async getBalance(): Promise<number> {
    const balance = await this.callRpc('getbalance', []);
    return Number(balance);
  }

  async getNewAddress(): Promise<string> {
    const address = await this.callRpc('getnewaddress', []);
    return String(address);
  }

  async mineToAddress(blocks: number, address: string): Promise<string[]> {
    const blockHashes = await this.callRpc('generatetoaddress', [
      blocks,
      address,
    ]);
    return Array.isArray(blockHashes)
      ? blockHashes.map(String)
      : [String(blockHashes)];
  }

  /**
   * Sends Bitcoin to an address
   * @param amountSats - Amount in satoshis (integer)
   * @param address - Bitcoin address to send to
   * @returns Transaction ID
   */
  async sendToAddress(amountSats: number, address: string): Promise<string> {
    // Validation: Dust limit check
    if (amountSats < 1000) {
      throw new HttpException(
        {
          success: false,
          message: 'Amount too small (Dust limit: minimum 1000 sats)',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Convert satoshis to BTC (Bitcoin Core RPC expects BTC as decimal)
    const amountBtc = amountSats / 100_000_000;

    try {
      const txid = await this.callRpc('sendtoaddress', [address, amountBtc]);
      this.logger.log(
        `✅ Sent ${amountSats} sats (${amountBtc} BTC) to ${address}, txid: ${txid}`,
      );
      return String(txid);
    } catch (error) {
      // Log the specific Bitcoin Core RPC error
      // callRpc already formats RPC errors, but we log the full error for debugging
      let errorMessage = 'Failed to send Bitcoin';

      if (error instanceof Error) {
        errorMessage = error.message;
        // Log the full error for debugging
        this.logger.error(
          `Bitcoin sendToAddress failed: ${errorMessage}`,
          error.stack,
        );

        // Try to extract raw RPC error if available (for more detailed logging)
        if (isAxiosError(error) && error.response?.data?.error) {
          const rpcError = error.response.data.error;
          this.logger.error(
            `Raw Bitcoin RPC Error: ${rpcError.message} (code: ${rpcError.code})`,
          );
        }
      } else if (isAxiosError(error)) {
        // Handle axios-specific errors (network issues, timeouts, etc.)
        if (error.response?.data) {
          const responseData = error.response.data;
          if (responseData.error) {
            errorMessage = `Bitcoin RPC error: ${responseData.error.message}`;
            this.logger.error(
              `Bitcoin RPC Error: ${responseData.error.message} (code: ${responseData.error.code})`,
            );
          } else {
            this.logger.error(
              'Bitcoin RPC axios error:',
              JSON.stringify(responseData),
            );
            errorMessage = `Bitcoin RPC request failed: ${error.message}`;
          }
        } else {
          errorMessage = `Bitcoin RPC connection error: ${error.message}`;
          this.logger.error(`Bitcoin RPC connection error: ${error.message}`);
        }
      } else {
        this.logger.error('Unknown error in sendToAddress:', error);
        errorMessage = `Unknown error: ${String(error)}`;
      }

      throw new HttpException(
        {
          success: false,
          message: errorMessage,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
