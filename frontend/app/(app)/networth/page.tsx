'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import ErrorBanner from '@/components/ErrorBanner';
import BarChart from '@/components/BarChart';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { IconChevronRight } from '@/components/icons';
import { useApiQuery } from '@/lib/query';
import { qk } from '@/lib/queryKeys';
import { won, manwon } from '@/lib/finance';
import {
  ASSET_TYPE_COLOR, BY_TYPE_NAME, ASSET_TYPE_ORDER,
  investmentSubText,
  type AssetType, type NetWorthSummary, type TrendPoint, type ByTypeItem,
} from '@/lib/networth';

// 자산 구성 줄을 누르면 열 가계부 탭 — 현금성 자산은 수입/지출 내역에서 나온다. 투자는 주식모아에서 받은 값이라 열 탭이 없다
const ASSET_TYPE_TAB: Partial<Record<AssetType, string>> = { cash: 'ledger', savings: 'savings' };

// 유형별 보조 글자 (건수 · 평균 금리 · 주식모아 받은 시각)
function typeSubText(b: ByTypeItem | undefined, summary: NetWorthSummary): string {
  if (!b) return '';
  if (b.type === 'cash') return `입출금 ${b.count}건`;
  if (b.type === 'savings') return b.avgRate !== null ? `평균 금리 ${b.avgRate}%` : `${b.count}건`;
  return investmentSubText(summary.investment);
}

const ROW_CLASS = 'flex items-center gap-3 px-5 py-3 min-h-14 border-b border-border-subtle last:border-b-0';

export default function NetworthPage() {
  // 순자산 데이터 (React Query 캐시)
  const summaryQuery = useApiQuery<NetWorthSummary>(qk.assets.networth(), '/assets/summary');
  const trendQuery = useApiQuery<TrendPoint[]>(['assets', 'trend'], '/assets/trend');
  const summary = summaryQuery.data ?? null;
  const trend = trendQuery.data ?? [];
  const error = (summaryQuery.error ?? trendQuery.error)?.message ?? null;

  const change = summary?.changeAmount ?? null;
  const up = (change ?? 0) >= 0;

  // 자산 구성 — 현금 · 예적금 · 투자 순서 고정
  const rows = ASSET_TYPE_ORDER
    .map((type) => ({ a: summary?.allocation.find((x) => x.type === type), b: summary?.byType.find((x) => x.type === type), type }))
    .filter((r) => r.a);

  return (
    <AppShell activePath="/networth">
      <PageHeader title="자산 종합" description="현금·예적금·투자를 합산해 순자산을 추적합니다. 투자는 주식모아에서 하루 한 번 받습니다." />

      <ErrorBanner message={error} />

      <Card className="mb-7">
        {/* 총 순자산 + 지난달 대비 */}
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5 border-b border-border-subtle">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.8125rem] text-muted">총 순자산</span>
            {summary && (
              <>
                <span className="text-[2rem] md:text-[2.5rem] font-bold tabular-nums tracking-[-0.02em] leading-tight">{won(summary.netWorth)}</span>
                {change !== null && (
                  <span className={`text-[0.84rem] tabular-nums ${up ? 'text-success' : 'text-danger'}`}>
                    {up ? '▲' : '▼'} {won(Math.abs(change))} ({Math.abs(summary.changeRate ?? 0)}%) 지난달 대비
                  </span>
                )}
              </>
            )}
          </div>
          <span className="text-[0.75rem] text-muted">순자산 추이 · 6개월 · 지난달까지는 월말 기준</span>
        </div>

        {/* 추이 막대 + 전월 대비 증감 */}
        <div className="px-5 pt-6 pb-5 flex flex-col gap-1.5">
          <BarChart
            label="순자산 추이"
            height={180}
            items={trend.map((t, i) => {
              // 막대 아래 전월 대비 — 늘어난 달 ▲ 수입 색, 줄어든 달 ▼ 지출 색
              const d = i === 0 ? null : t.netWorth - trend[i - 1].netWorth;
              const delta = d === null ? undefined : <span className={d >= 0 ? 'text-success' : 'text-danger'}>{`${d >= 0 ? '▲' : '▼'} ${manwon(Math.abs(d))}`}</span>;
              return { key: t.month, label: t.label, value: t.netWorth, valueLabel: manwon(t.netWorth), current: t.current, delta };
            })}
          />
        </div>
      </Card>

      {summary && rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle>자산 구성</CardTitle></CardHeader>
          {/* 비중 띠 */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex h-3 gap-0.5 rounded-full overflow-hidden" role="img" aria-label="자산 구성 비중">
              {rows.map((r) => (
                <div key={r.type} style={{ flex: r.a?.percent ?? 0, background: ASSET_TYPE_COLOR[r.type] }} />
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            {rows.map((r) => {
              const tab = ASSET_TYPE_TAB[r.type];
              const body = (
                <>
                  <span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: ASSET_TYPE_COLOR[r.type] }} />
                  <span className="flex-1 min-w-0 flex flex-col leading-snug">
                    <span className="font-medium">{BY_TYPE_NAME[r.type]}</span>
                    <span className="text-[0.75rem] text-muted">{typeSubText(r.b, summary)}</span>
                  </span>
                  <span className="w-11 text-right text-[0.8125rem] text-muted tabular-nums">{r.a?.percent}%</span>
                  <span className="w-32 max-md:w-auto text-right font-semibold tabular-nums">{won(r.a?.amount ?? 0)}</span>
                </>
              );
              // 투자 줄은 누를 곳이 없다 — 화살표 자리만 비워 금액 열을 맞춘다
              return tab ? (
                <Link key={r.type} href={`/transactions?tab=${tab}`} className={`${ROW_CLASS} transition-colors hover:bg-hover`}>
                  {body}
                  <IconChevronRight className="text-muted" width={16} height={16} />
                </Link>
              ) : (
                <div key={r.type} className={ROW_CLASS}>
                  {body}
                  <span className="w-4 shrink-0" aria-hidden />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </AppShell>
  );
}
