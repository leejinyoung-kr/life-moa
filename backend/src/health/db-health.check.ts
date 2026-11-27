import { Injectable } from '@nestjs/common';
import { HealthCheck } from '@leejinyoung-kr/core-common';
import { PrismaService } from '../prisma/prisma.service';

// GET /health 가 부르는 DB 핑 — 응답 모양 · 시간 제한은 core-common HealthModule 이 정한다
@Injectable()
export class DbHealthCheck extends HealthCheck {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // SELECT 1 이 끝나면 살아 있다
  check(): Promise<unknown> {
    return this.prisma.$queryRaw`SELECT 1`;
  }
}
