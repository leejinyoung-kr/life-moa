import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';

// 환율 조회 — 쓰는 모듈이 import 해 캐시 하나를 같이 쓴다
@Module({
  providers: [ExchangeRateService],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
