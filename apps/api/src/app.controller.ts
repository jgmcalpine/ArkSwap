import { Controller, Get } from '@nestjs/common';
import type { SwapQuote } from '@arkswap/protocol';

@Controller()
export class AppController {
  @Get()
  getHello(): SwapQuote {
    return {
      id: 'api-quote-1',
      amount: 200,
    };
  }
}

