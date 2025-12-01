import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertSafeNetwork } from '@arkswap/protocol';

async function bootstrap() {
  assertSafeNetwork('regtest');
  const app = await NestFactory.create(AppModule);

  // Enable CORS for localhost ports
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(3001);
  console.log('Application is running on: http://localhost:3001');
}
bootstrap();
