import { AppJobRunStore } from './job-run.store';

// 기록 규칙(겹침 · compare-and-swap · lease 조회)은 core-jobs/prisma 가 테스트한다 — 여기선 시스템 로그 연결만 본다
describe('AppJobRunStore', () => {
  let prisma: any;
  let sysLog: { error: jest.Mock };
  let store: AppJobRunStore;

  // onFailed 는 기다리지 않고 부르므로 한 턴 넘긴 뒤 본다
  const flush = () => new Promise<void>((r) => setImmediate(r));

  beforeEach(() => {
    prisma = {
      jobRun: {
        create: jest.fn().mockResolvedValue({ id: 7 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    sysLog = { error: jest.fn() };
    store = new AppJobRunStore(prisma, sysLog as any);
  });

  it('실패로 마감하면 시스템 로그에 에러 첫 줄을 남긴다', async () => {
    const ok = await store.finish(7, {
      job: 'db-backup',
      status: 'failed',
      finishedAt: new Date(),
      error: 'Error: Access denied\n    at spawn',
    });
    await flush();
    expect(ok).toBe(true);
    expect(sysLog.error).toHaveBeenCalledWith({
      category: 'cron',
      message: '예약 작업 실패: db-backup',
      metadata: { runId: 7, error: 'Error: Access denied' },
    });
  });

  it('이미 마감된 행(lease 만료)이면 시스템 로그를 남기지 않는다', async () => {
    prisma.jobRun.updateMany.mockResolvedValue({ count: 0 });
    await store.finish(7, {
      job: 'db-backup',
      status: 'failed',
      finishedAt: new Date(),
      error: 'late',
    });
    await flush();
    expect(sysLog.error).not.toHaveBeenCalled();
  });

  it('성공 마감은 시스템 로그를 남기지 않는다', async () => {
    await store.finish(7, {
      job: 'db-backup',
      status: 'succeeded',
      finishedAt: new Date(),
      summary: 'ok',
    });
    await flush();
    expect(sysLog.error).not.toHaveBeenCalled();
  });
});
