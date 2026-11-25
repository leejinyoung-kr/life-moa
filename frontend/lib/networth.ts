/**
 * 자산 종합 공통 타입 · 라벨/색상맵.
 * 백엔드 응답 DTO(/assets)와 1:1 대응한다. 원화 전체표기 won() 은 lib/finance 와 공유.
 */

// ── 타입 ────────────────────────────────────────────────────────
export type AssetType = 'cash' | 'savings' | 'investment';

export interface AllocationItem {
  type: AssetType;
  amount: number;
  percent: number;
}

export interface ByTypeItem {
  type: AssetType;
  amount: number;
  count: number;
  avgRate: number | null;
}

// 투자 줄 보조 — 주식모아에서 하루 한 번 받은 값 (ADR 0011)
export interface InvestmentInfo {
  fetchedAt: string; // 받은 시각
  quoteAt: string | null; // 값에 든 시세 중 가장 오래된 받은 시각
  netDepositKrw: number; // 원금(순입금)
  priceMissing: boolean;
  fxMissing: boolean;
}

export interface NetWorthSummary {
  totalAssets: number;
  netWorth: number;
  changeAmount: number | null; // 직전 월말 스냅샷이 없으면 null
  changeRate: number | null;
  allocation: AllocationItem[];
  byType: ByTypeItem[];
  investment: InvestmentInfo | null; // 한 번도 받지 않았으면 null
}

// 「11/25 00:50」 — 한국 시각. 휴대폰 한 줄에 들어가게 짧게 쓴다
function monthDayTime(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 60 * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

// 투자 줄 보조 글자 — 주식모아에서 받은 시각 · 빠진 시세 (어디서 받는지는 페이지 부제목에 적는다)
export function investmentSubText(info: InvestmentInfo | null): string {
  if (!info) return '';
  const missing = info.priceMissing || info.fxMissing ? ' (일부 시세 없음)' : '';
  return `${monthDayTime(info.fetchedAt)} 기준${missing}`;
}

export interface TrendPoint {
  month: string;
  label: string;
  netWorth: number;
  current: boolean;
}

// ── 라벨/색상맵 ──────────────────────────────────────────────────
export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  cash: '현금',
  savings: '예적금',
  investment: '투자',
};

// 자산 구성 띠/점 색 — 금액 부호가 없는 자리라 강조색(초록)의 진하기로 구분한다
export const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  cash: 'color-mix(in srgb, var(--accent) 35%, transparent)',
  savings: 'var(--accent)',
  investment: 'var(--accent-dark)',
};

// 자산 구성 표시 순서
export const ASSET_TYPE_ORDER: AssetType[] = ['cash', 'savings', 'investment'];

// 자산 구성 줄 이름
export const BY_TYPE_NAME: Record<AssetType, string> = {
  cash: '현금성 자산',
  savings: '예적금',
  investment: '투자',
};
