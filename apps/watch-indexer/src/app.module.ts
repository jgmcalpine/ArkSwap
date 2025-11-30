import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { BitcoinService } from './bitcoin.service';
import { ScannerService } from './scanner.service';

@Module({
  imports: [DatabaseModule, ScheduleModule.forRoot()],
  controllers: [],
  providers: [BitcoinService, ScannerService],
})
export class AppModule {}
