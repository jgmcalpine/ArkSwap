import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RoundService } from './round.service';
import { InfoController } from './info.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [InfoController],
  providers: [RoundService],
})
export class AppModule {}

