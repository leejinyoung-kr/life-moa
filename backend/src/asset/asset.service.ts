import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { kstMonth } from '@leejinyoung-kr/core-time';

type SummaryType = 'cash' | 'savings' | 'investment';

@Injectable()
export class AssetService {
  constructor(private prisma: PrismaService) {}

  // 'YYYY-MM' 다음달 1일 — 그 달 말까지 포함하는 배타적 상한 경계(스냅샷 컷오프)
  private firstDayOfMonthAfter(month: string): Date {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 1));
  }

  // 현금 흐름 합계(수입 - 지출 - 자산이동) — dateFilter 지정 시 해당 구간만. 월말 스냅샷 저장·실시간 델타 계산에 공용 사용
  // 자산이동은 예적금 잔액·투자 예수금으로 옮겨 가 그쪽에서 세므로 현금에서 뺀다(가계부 잔액과 같은 식)
  private async cashFlowSum(
    userId: number,
    dateFilter?: Prisma.DateTimeFilter,
  ): Promise<number> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: {
        user_id: userId,
        deleted_at: null,
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      _sum: { amount: true },
    });
    const sumOf = (type: TransactionType) =>
      rows.find((r) => r.type === type)?._sum.amount?.toNumber() ?? 0;
    return sumOf('income') - sumOf('expense') - sumOf('transfer');
  }

  // 특정 월 말 기준 누적 현금 총액 — 월간 순자산 스냅샷 저장용(NetWorthSnapshotCronService)
  async cashTotalForSnapshot(userId: number, month: string): Promise<number> {
    return this.cashFlowSum(userId, { lt: this.firstDayOfMonthAfter(month) });
  }

  // 요약 — 총자산/순자산 + 전월 대비 증감 + 도넛 구성 + 유형별 집계
  // 예적금 → Saving.balance, 투자 → 주식모아에서 받은 합계(investment_summary, ADR 0011), 현금 → 수입 - 지출 - 자산이동
  async summary(userId: number) {
    // 서로 의존성 없는 조회는 한 번에 병렬 실행 (TiDB Cloud 왕복 지연 누적 방지)
    const [savings, invest, prevSnap] = await Promise.all([
      this.prisma.saving.findMany({
        where: { user_id: userId, deleted_at: null },
        select: { balance: true, interest_rate: true },
      }),
      this.prisma.investmentSummary.findUnique({
        where: { user_id: userId },
      }),
      this.prisma.netWorthSnapshot.findFirst({
        where: { user_id: userId, month: { lt: kstMonth() } },
        orderBy: { month: 'desc' },
      }),
    ]);

    // 현금 총액 = 직전 월말 스냅샷 캐시값 + 그 이후 거래 델타(전체 재집계 대신 이번 달치만 스캔).
    // 스냅샷에 캐시값이 없으면(첫 크론 이전 신규 사용자 등) 전체 재집계로 폴백.
    const cashTotal =
      prevSnap?.cash_total != null
        ? prevSnap.cash_total.toNumber() +
          (await this.cashFlowSum(userId, {
            gte: this.firstDayOfMonthAfter(prevSnap.month),
          }))
        : await this.cashFlowSum(userId);

    const savingsTotal = savings.reduce((s, r) => s + r.balance.toNumber(), 0);
    const savingsAvgRate = savings.length
      ? Math.round(
          (savings.reduce((s, r) => s + r.interest_rate.toNumber(), 0) /
            savings.length) *
            100,
        ) / 100
      : null;

    // 투자 — 주식모아 총 평가액(종목 + 예수금, 세전). 한 번도 받지 않았으면 0
    const investTotal = invest?.total_krw.toNumber() ?? 0;

    const totalAssets = cashTotal + savingsTotal + investTotal;
    const netWorth = totalAssets;

    // 도넛 구성 — 자산 유형별 비중(%)
    const allocation = [
      { type: 'cash' as SummaryType, amount: cashTotal },
      { type: 'savings' as SummaryType, amount: savingsTotal },
      { type: 'investment' as SummaryType, amount: investTotal },
    ]
      .filter((a) => a.amount > 0)
      .map((a) => ({
        type: a.type,
        amount: a.amount,
        percent:
          totalAssets > 0 ? Math.round((a.amount / totalAssets) * 100) : 0,
      }));

    // 유형별 카드
    const byType = [
      {
        type: 'cash' as SummaryType,
        amount: cashTotal,
        count: cashTotal > 0 ? 1 : 0,
        avgRate: null,
      },
      {
        type: 'savings' as SummaryType,
        amount: savingsTotal,
        count: savings.length,
        avgRate: savingsAvgRate,
      },
      {
        type: 'investment' as SummaryType,
        amount: investTotal,
        count: invest ? 1 : 0,
        avgRate: null,
      },
    ].filter((b) => b.amount > 0 || b.count > 0);

    // 전월 대비 증감(직전 월말 스냅샷 기준) — 스냅샷이 없으면 null(비교 대상 없음)
    // 과거 스냅샷은 부채 추적 종료 이전 기록일 수 있어 total_debt를 그대로 반영해 비교
    let changeAmount: number | null = null;
    let changeRate: number | null = null;
    if (prevSnap) {
      const prevNet =
        prevSnap.total_assets.toNumber() - prevSnap.total_debt.toNumber();
      changeAmount = netWorth - prevNet;
      changeRate =
        prevNet !== 0 ? Math.round((changeAmount / prevNet) * 1000) / 10 : 0;
    }

    return {
      totalAssets,
      netWorth,
      changeAmount,
      changeRate,
      allocation,
      byType,
      // 투자 줄 보조 — 받은 시각 · 시세 기준 · 빠진 값. 한 번도 받지 않았으면 null
      investment: invest
        ? {
            fetchedAt: invest.fetched_at,
            quoteAt: invest.quote_at,
            netDepositKrw: invest.net_deposit_krw.toNumber(),
            priceMissing: invest.price_missing,
            fxMissing: invest.fx_missing,
          }
        : null,
    };
  }

  // 순자산 추이 — 지난 5개월 월말 스냅샷 + 이번 달(지금 값, 요약 숫자와 같다), 월 오름차순
  async trend(userId: number) {
    const month = kstMonth();
    const [snaps, live] = await Promise.all([
      this.prisma.netWorthSnapshot.findMany({
        where: { user_id: userId, month: { lt: month } },
        orderBy: { month: 'desc' },
        take: 5,
      }),
      this.summary(userId),
    ]);
    const label = (m: string) => `${Number(m.slice(5))}월`;
    return [
      ...snaps.reverse().map((s) => ({
        month: s.month,
        label: label(s.month),
        netWorth: s.total_assets.toNumber() - s.total_debt.toNumber(),
        current: false,
      })),
      { month, label: label(month), netWorth: live.netWorth, current: true },
    ];
  }
}
