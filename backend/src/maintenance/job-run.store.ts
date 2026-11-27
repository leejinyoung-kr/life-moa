import { Injectable } from '@nestjs/common';
import { PrismaJobRunStore } from '@leejinyoung-kr/core-jobs/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogService } from '../system-log/system-log.service';

// core-jobs 실행 기록을 job_run 테이블에 남긴다(겹침 방지 · 마감 규칙은 코어 저장소).
// 실패(lease 만료 포함)는 시스템 로그 화면에서도 보이도록 system_log 에 한 줄 남긴다
@Injectable()
export class AppJobRunStore extends PrismaJobRunStore {
  constructor(prisma: PrismaService, sysLog: SystemLogService) {
    super(prisma.jobRun, {
      onFailed: (run) =>
        sysLog.error({
          category: 'cron',
          message: `예약 작업 실패: ${run.job}`,
          metadata: { runId: Number(run.id), error: run.error?.split('\n')[0] },
        }),
    });
  }
}
