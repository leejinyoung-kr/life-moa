import {
  InvestmentSummaryService,
  parseSummary,
} from './investment-summary.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogService } from '../system-log/system-log.service';

const OK_BODY = {
  totalKrw: 3_000_000,
  netDepositKrw: 2_500_000,
  quoteAt: '2026-11-24T15:30:00.000Z',
  priceMissing: false,
  fxMissing: false,
  generatedAt: '2026-11-24T15:50:00.000Z',
};

// 주식모아 합계 받기 — 응답 확인 · 저장 · 없는 사용자 · 실패 때 마지막 값 유지. fetch · Prisma 는 가짜
describe('InvestmentSummaryService', () => {
  let upsert: jest.Mock;
  let warn: jest.Mock;
  let fetchMock: jest.SpyInstance;
  const users = [
    { id: 1, email: 'a@example.com' },
    { id: 2, email: 'b@example.com' },
  ];
  const svc = () =>
    new InvestmentSummaryService(
      {
        investmentSummary: { upsert },
        user: { findMany: jest.fn(async () => users) },
      } as unknown as PrismaService,
      { warn } as unknown as SystemLogService,
    );
  // 가짜 응답
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    upsert = jest.fn(async () => ({}));
    warn = jest.fn();
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('토큰 · 이메일 헤더로 부르고 받은 값을 사용자 행에 저장한다', async () => {
    fetchMock.mockResolvedValue(reply(200, OK_BODY));
    expect(await svc().syncUser(users[0])).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(
      'http://stockmoa.test:8040/api/v1/internal/summary',
    );
    expect(init.headers).toMatchObject({
      authorization: 'Bearer test-stockmoa-internal-token-0123456789',
      'x-user-email': 'a@example.com',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 1 },
        update: expect.objectContaining({
          total_krw: 3_000_000,
          net_deposit_krw: 2_500_000,
          quote_at: new Date('2026-11-24T15:30:00.000Z'),
        }),
      }),
    );
  });

  it('주식모아에 없는 사용자는 저장 없이 건너뛰고 실패로 세지 않는다', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, OK_BODY))
      .mockResolvedValueOnce(reply(404, { message: '사용자 없음' }));
    expect(await svc().syncAll()).toEqual({ total: 2, saved: 1, failed: 0 });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('내부 API 가 꺼진 404 · 토큰 오류 · 이상한 응답은 실패로 남기고 저장하지 않는다', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(reply(200, { ...OK_BODY, totalKrw: '3000000' }));
    expect(await svc().syncAll()).toEqual({ total: 2, saved: 0, failed: 2 });
    expect(upsert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('응답 모양 확인 — quoteAt 은 null 이거나 날짜 문자열', () => {
    expect(parseSummary({ ...OK_BODY, quoteAt: null }).quoteAt).toBeNull();
    expect(() => parseSummary({ ...OK_BODY, quoteAt: 'x' })).toThrow();
    expect(() => parseSummary({ ...OK_BODY, fxMissing: 'no' })).toThrow();
    expect(() => parseSummary(null)).toThrow();
  });
});
