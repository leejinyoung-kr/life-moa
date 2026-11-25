import { BadRequestException, Injectable } from '@nestjs/common';

const FRANKFURTER_EXCHANGE_RATE_API = 'https://api.frankfurter.app/latest';
const EXCHANGE_RATE_CACHE_TTL_MS = 10 * 60 * 1000; // 환율은 10분 캐시 (요청마다 외부 API 호출 방지)

// frankfurter 환율 응답 — rates[통화] = 환율
interface FrankfurterResponse {
  rates?: Record<string, number>;
}

// 환율 조회 (frankfurter.app — 키 불필요) — 달러 구독 원화 환산 · 대시보드. 2026-11 투자 시세 조회(PriceLookupService)에서 떼어 냈다 (ADR 0011)
@Injectable()
export class ExchangeRateService {
  private readonly cache = new Map<
    string,
    { rate: number; expiresAt: number }
  >();

  // from → to 환율 (10분 캐시). 실패하면 BadRequestException
  async getExchangeRate(from: string, to: string): Promise<number> {
    const cacheKey = `${from}_${to}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rate;

    const res = await fetch(
      `${FRANKFURTER_EXCHANGE_RATE_API}?from=${from}&to=${to}`,
    );
    if (!res.ok) throw new BadRequestException('환율 조회에 실패했습니다.');
    const json = (await res.json()) as FrankfurterResponse | null;
    const rate = Number(json?.rates?.[to]);
    if (!Number.isFinite(rate))
      throw new BadRequestException('환율 조회에 실패했습니다.');

    this.cache.set(cacheKey, {
      rate,
      expiresAt: Date.now() + EXCHANGE_RATE_CACHE_TTL_MS,
    });
    return rate;
  }
}
