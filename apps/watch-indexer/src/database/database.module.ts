import { Module, OnModuleInit, OnModuleDestroy, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Seed data: Check if AspDefinition is empty, if so insert Local Docker ASP
    const aspCount = await this.prisma.aspDefinition.count();
    
    if (aspCount === 0) {
      await this.prisma.aspDefinition.create({
        data: {
          name: 'Local Docker ASP',
          poolAddress: '', // TODO: Fill this in Chunk 2 once we figure out how to get it
          isProduction: false,
        },
      });
      console.log('Seeded Local Docker ASP definition');
    }
  }
}

