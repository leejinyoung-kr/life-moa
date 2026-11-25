import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from '@leejinyoung-kr/core-jobs';
import { InvestmentSummaryService } from '../asset/investment-summary.service';
import { PrismaService } from '../prisma/prisma.service';
import { finishPerUser } from './job-result';

// 부팅 때 마지막으로 받은 지 이만큼 넘었으면 한 번 더 받는다 — 배포 직후 「투자」 가 비거나 하루 넘게 묵지 않게
const STALE_MS = 20 * 60 * 60_000;

// 매일 00:50 — 주식모아에서 투자 합계를 받는다. 01:00 순자산 스냅샷이 그 값을 찍는다 (ADR 0011)
@Injectable()
export class InvestmentSummaryCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvestmentSummaryCronService.name);

  constructor(
    private prisma: PrismaService,
    private summaries: InvestmentSummaryService,
  ) {}

  @Job({ name: 'investment-summary', cron: '50 0 * * *', leaseMs: 5 * 60_000 })
  async sync(): Promise<string> {
    if (!this.summaries.enabled) return '주식모아 주소 · 토큰 없음 — 건너뜀';
    const { total, saved, failed } = await this.summaries.syncAll();
    return finishPerUser(
      `투자 합계 ${saved}/${total}명 받음 (주식모아에 없는 사용자 ${total - saved - failed}명)`,
      failed,
    );
  }

  // 부팅 때 — 가장 최근 받은 값이 오래됐거나 없으면 기다리지 않고 한 번 받는다
  onApplicationBootstrap(): void {
    if (!this.summaries.enabled) return;
    void this.prisma.investmentSummary
      .aggregate({ _max: { fetched_at: true } })
      .then(async ({ _max }) => {
        const last = _max.fetched_at?.getTime() ?? 0;
        if (Date.now() - last < STALE_MS) return;
        const r = await this.summaries.syncAll();
        this.logger.log(
          `부팅 때 투자 합계 받기 — ${r.saved}/${r.total}명, 실패 ${r.failed}명`,
        );
      })
      .catch((e: unknown) =>
        this.logger.warn(
          `부팅 때 투자 합계 받기 실패: ${(e as Error).message}`,
        ),
      );
  }
}
