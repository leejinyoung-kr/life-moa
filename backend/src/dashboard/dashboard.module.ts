import { Module } from '@nestjs/common';
import { AssetModule } from '../asset/asset.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AssetModule, ExchangeRateModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
