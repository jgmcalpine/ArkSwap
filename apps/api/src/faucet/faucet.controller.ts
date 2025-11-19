import { Controller, Post, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BitcoinService } from '../bitcoin/bitcoin.service';

interface FaucetUserRequest {
  address: string;
}

interface FaucetMakerResponse {
  success: boolean;
  balance: number;
}

interface FaucetUserResponse {
  success: boolean;
  amount: number;
}

@Controller('faucet')
export class FaucetController {
  private readonly logger = new Logger(FaucetController.name);

  constructor(private readonly bitcoinService: BitcoinService) {}

  @Post('maker')
  async fundMaker(): Promise<FaucetMakerResponse> {
    try {
      // Generate a new address for the Backend wallet
      const address = await this.bitcoinService.getNewAddress();

      // Mine 1 block to that address
      await this.bitcoinService.mineToAddress(1, address);

      // Get the new balance
      const balance = await this.bitcoinService.getBalance();

      return {
        success: true,
        balance,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to fund maker',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('user')
  async fundUser(@Body() body: FaucetUserRequest): Promise<FaucetUserResponse> {
    try {
      if (!body.address) {
        throw new HttpException(
          {
            success: false,
            message: 'Address is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`💰 Faucet requested for user: ${body.address}`);
      // (Simulation): Mine 1 block to the "default" address to simulate network confirmation time
      // In a real scenario, we would send funds to the user's address
      // For now, we'll mine to a default address to simulate the network confirmation
      const defaultAddress = await this.bitcoinService.getNewAddress();
      await this.bitcoinService.mineToAddress(1, defaultAddress);
      this.logger.log(`✅ Block mined. Simulation complete.`);

      return {
        success: true,
        amount: 10000,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to fund user',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

