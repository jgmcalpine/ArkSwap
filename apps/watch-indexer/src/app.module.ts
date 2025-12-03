import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { BitcoinService } from './bitcoin.service';
import { ScannerService } from './scanner.service';
import { ParserService } from './parser.service';
import { SeederService } from './seeder.service';
import { AggregatorService } from './stats/aggregator.service';
import { ScoreService } from './stats/score.service';
import { StatsController } from './stats/stats.controller';

@Module({
  imports: [DatabaseModule, ScheduleModule.forRoot()],
  controllers: [StatsController],
  providers: [
    BitcoinService,
    ScannerService,
    ParserService,
    SeederService,
    AggregatorService,
    ScoreService,
  ],
})
export class AppModule {}
