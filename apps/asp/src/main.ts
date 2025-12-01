import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for development
  // Allow all origins in development (use specific origins in production)
  app.enableCors({
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false, // Set to true if you need to send cookies
  });

  await app.listen(7070);
  console.log('ASP is running on: http://localhost:7070');
}
bootstrap();
