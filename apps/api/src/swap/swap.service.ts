import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import * as crypto from 'crypto';
import { BitcoinService } from '../bitcoin/bitcoin.service';

// Initialize ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);

enum SwapStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
}

interface SwapState {
  id: string;
  amount: number;
  preimageHex: string;
  makerPrivateKeyHex: string;
  preimageHash: string;
  makerPubkey: string;
  status: SwapStatus;
}

@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);
  private readonly swaps = new Map<string, SwapState>();

  constructor(private readonly bitcoinService: BitcoinService) {}

  /**
   * Creates a new swap quote
   * Security Critical: Uses crypto.randomBytes for preimage generation
   */
  createQuote(amount: number): {
    id: string;
    amount: number;
    preimageHash: string;
    makerPubkey: string;
  } {
    // Generate 32-byte preimage using cryptographically secure random
    const preimage = randomBytes(32);
    const preimageHex = preimage.toString('hex');

    // Hash the preimage (SHA256)
    const preimageHash = crypto
      .createHash('sha256')
      .update(preimage)
      .digest('hex');

    // Generate ephemeral maker keypair
    const makerKeyPair = ECPair.makeRandom({
      network: bitcoin.networks.regtest,
    });
    const makerPrivateKeyHex = makerKeyPair.privateKey!.toString('hex');
    const makerPubkey = makerKeyPair.publicKey.slice(1, 33).toString('hex'); // x-only pubkey

    // Generate unique swap ID
    const id = randomBytes(16).toString('hex');

    // Store swap state in memory
    const swapState: SwapState = {
      id,
      amount,
      preimageHex,
      makerPrivateKeyHex,
      preimageHash,
      makerPubkey,
      status: SwapStatus.PENDING,
    };

    this.swaps.set(id, swapState);
    this.logger.log(`Created swap quote: id=${id}, amount=${amount}`);

    return {
      id,
      amount,
      preimageHash,
      makerPubkey,
    };
  }

  /**
   * Gets swap state by ID (for future use)
   */
  getSwap(id: string): SwapState | undefined {
    return this.swaps.get(id);
  }

  /**
   * Processes a swap: validates, simulates VTXO verification/claim, and executes L1 payout
   */
  async processSwap(
    swapId: string,
    userTxId: string,
    userL1Address: string,
  ): Promise<string> {
    // Validation: Retrieve the swap quote from memory
    const swap = this.swaps.get(swapId);
    if (!swap) {
      throw new HttpException(
        {
          success: false,
          message: `Swap not found: ${swapId}`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (swap.status === SwapStatus.COMPLETED) {
      throw new HttpException(
        {
          success: false,
          message: `Swap already processed: ${swapId}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Simulate VTXO Verification
    this.logger.log(`🔍 Verifying Ark Tx: ${userTxId}... Valid.`);

    // Simulate VTXO Claim
    this.logger.log(`⚡ Claiming VTXO with Preimage: ${swap.preimageHex}`);

    // Security: Check if Market Maker wallet has enough L1 BTC
    // Note: swap.amount is in satoshis, balance is in BTC
    const balanceBtc = await this.bitcoinService.getBalance();
    const amountBtc = swap.amount / 100_000_000;
    if (balanceBtc < amountBtc) {
      throw new HttpException(
        {
          success: false,
          message: `Insufficient balance. Required: ${swap.amount} sats (${amountBtc} BTC), Available: ${balanceBtc} BTC`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Execute L1 Payout
    // swap.amount is in satoshis, sendToAddress expects sats and converts internally
    const amountBtcFormatted = (swap.amount / 100_000_000).toFixed(8);
    this.logger.log(
      `💸 Sending ${swap.amount} sats (${amountBtcFormatted} BTC) to ${userL1Address}`,
    );
    const l1TxId = await this.bitcoinService.sendToAddress(
      swap.amount,
      userL1Address,
    );

    // State Update: Mark swap as COMPLETED
    swap.status = SwapStatus.COMPLETED;
    this.swaps.set(swapId, swap);

    this.logger.log(`✅ Swap completed: id=${swapId}, l1TxId=${l1TxId}`);

    return l1TxId;
  }
}
