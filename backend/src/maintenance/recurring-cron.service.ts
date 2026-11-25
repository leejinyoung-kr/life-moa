import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@leejinyoung-kr/core-jobs';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionService } from '../transaction/transaction.service';
import { SystemLogService } from '../system-log/system-log.service';
import { finishPerUser } from './job-result';

// 반복거래 회차 일괄 생성 — 조회 시점(lazy)이 아닌 매일 정해진 시각에 전체 사용자분을 채운다.
// 반복매수(국내 · 해외)와 투자 현재가 갱신은 2026-11 투자 기능을 주식모아로 옮기며 뺐다 (ADR 0011)
@Injectable()
export class RecurringCronService {
  private readonly logger = new Logger(RecurringCronService.name);

  constructor(
    private prisma: PrismaService,
    private transactionService: TransactionService,
    private sysLog: SystemLogService,
  ) {}

  // 반복거래 — 매일 오전 9시. 작업 이름은 실행 기록이 이어지게 반복매수(국내)를 함께 하던 때 그대로 둔다
  @Job({ name: 'recurring-domestic', cron: '0 9 * * *', leaseMs: 30 * 60_000 })
  async run(): Promise<string> {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    let txCount = 0;
    let txFailed = 0;

    for (const u of users) {
      try {
        txCount += await this.transactionService.materializeRecurring(u.id);
      } catch (err) {
        txFailed += 1;
        this.logger.error(
          `사용자 ${u.id} 반복거래 처리 실패: ${(err as Error).message}`,
        );
        this.sysLog.error({
          userId: u.id,
          category: 'cron',
          message: `반복거래 처리 실패`,
          metadata: { error: (err as Error).message },
        });
      }
    }

    if (txCount || txFailed) {
      const summary = `반복거래 일괄 처리 완료 (사용자 ${users.length}명${txFailed ? `, 실패 ${txFailed}건` : ''})`;
      this.sysLog.info({
        category: 'cron',
        message: summary,
        metadata: { total: users.length, failed: txFailed },
      });
    }

    return finishPerUser(
      `반복거래 ${txCount}건 (사용자 ${users.length}명)`,
      txFailed,
    );
  }
}
