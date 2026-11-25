/**
 * 투자 합계(InvestmentSummary) 더미 — 순자산 「투자」 한 줄.
 * 운영은 주식모아(따로 운영하는 투자 앱)에서 매일 받지만, 데모 · 로컬은 받지 않고 이 샘플 한 행을 쓴다 (ADR 0011).
 * 화면 · 계산은 운영과 같은 코드를 탄다. 받은 시각은 오늘 00:50, 시세 기준은 어제 장 마감(15:30) — 둘 다 한국 시각
 */
import { type SeedFn } from './helpers';

// 총 평가액(종목 + 예수금) · 원금(순입금) — 옛 투자 탭 더미(종목 14개 + 예수금 두 계좌)의 합과 같은 값
const TOTAL_KRW = 34_595_000;
const NET_DEPOSIT_KRW = 31_001_000;
const HOUR = 60 * 60_000;

// 오늘(한국) 0시에서 몇 시간 · 분 떨어진 시각
function kstToday(hours: number): Date {
  const kst = new Date(Date.now() + 9 * HOUR);
  const midnightKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * HOUR;
  return new Date(midnightKst + hours * HOUR);
}

// 한 사용자에게 투자 합계 한 행을 넣는다 (있으면 덮어쓴다 → idempotent)
export const seedInvestmentSummary: SeedFn = async (prisma, userId) => {
  const data = {
    total_krw: TOTAL_KRW,
    net_deposit_krw: NET_DEPOSIT_KRW,
    quote_at: kstToday(15.5 - 24),
    price_missing: false,
    fx_missing: false,
    fetched_at: kstToday(50 / 60),
  };
  await prisma.investmentSummary.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...data },
    update: data,
  });
  return 1;
};
