import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogService } from '../system-log/system-log.service';

// 주식모아가 기다려 주는 최대 시간 — 홈서버 컨테이너끼리라 오래 걸릴 일이 없다
const TIMEOUT_MS = 15_000;
// 주식모아가 「그 이메일 사용자가 없다」 고 할 때의 메시지 (stock-moa internal.controller.ts)
const NO_USER = '사용자 없음';

// 주식모아 GET /api/v1/internal/summary 응답
export interface StockMoaSummary {
  totalKrw: number;
  netDepositKrw: number;
  quoteAt: string | null;
  priceMissing: boolean;
  fxMissing: boolean;
}

// 응답 모양 확인 — 숫자 · 불리언이 아니면 저장하지 않는다(마지막 값을 유지)
export function parseSummary(body: unknown): StockMoaSummary {
  const b = body as Record<string, unknown> | null;
  const ok =
    b !== null &&
    typeof b === 'object' &&
    Number.isFinite(b.totalKrw) &&
    Number.isFinite(b.netDepositKrw) &&
    (b.quoteAt === null ||
      (typeof b.quoteAt === 'string' &&
        !Number.isNaN(Date.parse(b.quoteAt)))) &&
    typeof b.priceMissing === 'boolean' &&
    typeof b.fxMissing === 'boolean';
  if (!ok) throw new Error('주식모아 응답 모양이 다름');
  return b as unknown as StockMoaSummary;
}

// 순자산 「투자」 한 줄 — 주식모아 합계를 받아 사용자마다 한 행으로 저장한다 (ADR 0011)
@Injectable()
export class InvestmentSummaryService {
  private readonly logger = new Logger(InvestmentSummaryService.name);

  constructor(
    private prisma: PrismaService,
    private sysLog: SystemLogService,
  ) {}

  // 주소 · 토큰이 있을 때만 받는다 — 로컬 · 데모는 꺼짐
  get enabled(): boolean {
    return !!(env.STOCKMOA_INTERNAL_URL && env.STOCKMOA_INTERNAL_TOKEN);
  }

  // 한 사용자 몫을 받아 저장 — 주식모아에 없는 사용자면 false. 실패하면 던지고 이전 행은 그대로 둔다
  async syncUser(user: { id: number; email: string }): Promise<boolean> {
    const url = new URL('/api/v1/internal/summary', env.STOCKMOA_INTERNAL_URL);
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${env.STOCKMOA_INTERNAL_TOKEN}`,
        'x-user-email': user.email,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 404 는 둘 — 그 이메일 사용자가 없음(건너뜀) · 주식모아 내부 API 가 꺼짐(설정 오류라 실패)
    if (res.status === 404) {
      const body = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (body?.message === NO_USER) return false;
    }
    if (!res.ok) throw new Error(`주식모아 응답 ${res.status}`);
    const s = parseSummary(await res.json());
    const data = {
      total_krw: s.totalKrw,
      net_deposit_krw: s.netDepositKrw,
      quote_at: s.quoteAt ? new Date(s.quoteAt) : null,
      price_missing: s.priceMissing,
      fx_missing: s.fxMissing,
      fetched_at: new Date(),
    };
    await this.prisma.investmentSummary.upsert({
      where: { user_id: user.id },
      create: { user_id: user.id, ...data },
      update: data,
    });
    return true;
  }

  // 모든 사용자 몫을 차례로 받는다 — 사용자별 실패는 시스템 로그에 남기고 건수를 돌려준다
  async syncAll(): Promise<{ total: number; saved: number; failed: number }> {
    const users = await this.prisma.user.findMany({
      select: { id: true, email: true },
    });
    let saved = 0;
    let failed = 0;
    for (const u of users) {
      try {
        if (await this.syncUser(u)) saved++;
      } catch (e) {
        failed++;
        const error = (e as Error).message;
        this.logger.warn(`투자 합계 받기 실패(user ${u.id}): ${error}`);
        this.sysLog.warn({
          userId: u.id,
          category: 'asset',
          message: '주식모아 투자 합계 받기 실패 — 마지막 값 유지',
          metadata: { error },
        });
      }
    }
    return { total: users.length, saved, failed };
  }
}
