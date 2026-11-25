import { Prisma } from '@prisma/client';
import { AssetService } from './asset.service';

// 순자산 요약 · 추이 — 자산이동 이중 계산 방지와 전월 대비 · 이번 달 막대 기준을 검증. Prisma 는 인메모리 가짜.
describe('AssetService', () => {
  let txs: { type: 'income' | 'expense' | 'transfer'; amount: number }[];
  let savings: number[];
  let snaps: {
    month: string;
    total_assets: number;
    cash_total: number | null;
  }[];
  let invest: number | null;
  let prisma: any;
  const dec = (n: number) => new Prisma.Decimal(n);
  const svc = () => new AssetService(prisma);

  beforeEach(() => {
    txs = [];
    savings = [];
    snaps = [];
    invest = null;
    prisma = {
      transaction: {
        groupBy: jest.fn(async () =>
          (['income', 'expense', 'transfer'] as const).map((type) => ({
            type,
            _sum: {
              amount: dec(
                txs
                  .filter((t) => t.type === type)
                  .reduce((s, t) => s + t.amount, 0),
              ),
            },
          })),
        ),
      },
      saving: {
        findMany: jest.fn(async () =>
          savings.map((b) => ({ balance: dec(b), interest_rate: dec(3) })),
        ),
      },
      // 주식모아에서 받은 투자 합계 — 사용자당 한 행
      investmentSummary: {
        findUnique: jest.fn(async () =>
          invest === null
            ? null
            : {
                total_krw: dec(invest),
                net_deposit_krw: dec(invest - 100_000),
                quote_at: null,
                price_missing: false,
                fx_missing: false,
                fetched_at: new Date('2026-11-25T00:50:00+09:00'),
              },
        ),
      },
      netWorthSnapshot: {
        // 요약은 month < 이번 달 중 최신 1건, 추이는 month < 이번 달 내림차순
        findFirst: jest.fn(async () => toRow(snaps[snaps.length - 1])),
        findMany: jest.fn(async () => [...snaps].reverse().map(toRow)),
      },
    };
  });

  const toRow = (s?: (typeof snaps)[number]) =>
    s && {
      month: s.month,
      total_assets: dec(s.total_assets),
      total_debt: dec(0),
      cash_total: s.cash_total == null ? null : dec(s.cash_total),
    };

  it('예적금으로 옮긴 돈은 현금에서 빠진다(이중 계산하지 않는다)', async () => {
    txs.push(
      { type: 'income', amount: 3_000_000 },
      { type: 'expense', amount: 1_000_000 },
      { type: 'transfer', amount: 500_000 },
    );
    savings.push(500_000); // 자산이동 연동으로 예적금 잔액에 더해진 돈
    const res = await svc().summary(1);
    expect(res.byType.find((b) => b.type === 'cash')?.amount).toBe(1_500_000);
    expect(res.netWorth).toBe(2_000_000); // 수입 - 지출 = 순자산 증가분과 같다
  });

  it('투자는 주식모아에서 받은 총 평가액을 그대로 더한다', async () => {
    txs.push({ type: 'income', amount: 1_000_000 });
    invest = 3_000_000;
    const res = await svc().summary(1);
    expect(res.byType.find((b) => b.type === 'investment')?.amount).toBe(
      3_000_000,
    );
    expect(res.netWorth).toBe(4_000_000);
    expect(res.investment).toMatchObject({
      netDepositKrw: 2_900_000,
      priceMissing: false,
    });
  });

  it('투자 합계를 한 번도 받지 않았으면 투자 줄이 없다', async () => {
    txs.push({ type: 'income', amount: 1_000_000 });
    const res = await svc().summary(1);
    expect(res.byType.find((b) => b.type === 'investment')).toBeUndefined();
    expect(res.investment).toBeNull();
  });

  it('직전 월말 스냅샷이 없으면 전월 대비는 null', async () => {
    const res = await svc().summary(1);
    expect(res.changeAmount).toBeNull();
    expect(res.changeRate).toBeNull();
  });

  it('전월 대비는 직전 월말 스냅샷과 비교한다', async () => {
    txs.push({ type: 'income', amount: 1_100_000 });
    snaps.push({ month: '2000-01', total_assets: 1_000_000, cash_total: null });
    const res = await svc().summary(1);
    expect(res.changeAmount).toBe(100_000);
    expect(res.changeRate).toBe(10);
  });

  it('추이의 마지막 막대는 이번 달 지금 값이다', async () => {
    txs.push({ type: 'income', amount: 2_000_000 });
    snaps.push({ month: '2000-01', total_assets: 1_000_000, cash_total: null });
    const res = await svc().trend(1);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({
      month: '2000-01',
      netWorth: 1_000_000,
      current: false,
    });
    expect(res[1]).toMatchObject({ netWorth: 2_000_000, current: true });
  });
});
