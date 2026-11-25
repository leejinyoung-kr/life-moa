import { Module } from '@nestjs/common';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { InvestmentSummaryService } from './investment-summary.service';
import { SystemLogModule } from '../system-log/system-log.module';

// 순자산 요약 · 추이 + 주식모아 투자 합계 받기
@Module({
  imports: [SystemLogModule],
  controllers: [AssetController],
  providers: [AssetService, InvestmentSummaryService],
  exports: [AssetService, InvestmentSummaryService],
})
export class AssetModule {}
