import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { BitcoinService } from './bitcoin.service';
import { ScannerService } from './scanner.service';
import { ParserService } from './parser.service';
import { SeederService } from './seeder.service';

@Module({
  imports: [DatabaseModule, ScheduleModule.forRoot()],
  controllers: [],
  providers: [BitcoinService, ScannerService, ParserService, SeederService],
})
export class AppModule {}
