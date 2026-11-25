import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecurringScheduleService } from './recurring-schedule.service';

// 자동이체 설정 — 반복 규칙 검증, 목록/토글/삭제 회귀 테스트.
describe('RecurringScheduleService', () => {
  let schedules: any[];
  let seq: number;
  let prisma: any;

  const svc = () => new RecurringScheduleService(prisma);

  beforeEach(() => {
    schedules = [];
    seq = 1;

    prisma = {
      recurringSchedule: {
        findMany: jest.fn(async ({ where }: any) =>
          schedules.filter(
            (s) =>
              s.user_id === where.user_id &&
              s.deleted_at == null &&
              (where.kind === undefined || s.kind === where.kind),
          ),
        ),
        findFirst: jest.fn(
          async ({ where }: any) =>
            schedules.find(
              (s) =>
                s.id === where.id &&
                s.user_id === where.user_id &&
                s.deleted_at == null,
            ) ?? null,
        ),
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: seq++,
            deleted_at: null,
            last_period: null,
            created_at: new Date(),
            updated_at: new Date(),
            ...data,
          };
          schedules.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = schedules.find((s) => s.id === where.id);
          Object.assign(
            row,
            Object.fromEntries(
              Object.entries(data).filter(([, v]) => v !== undefined),
            ),
          );
          return row;
        }),
      },
    };
  });

  describe('create', () => {
    it('반복 규칙(cycle) 없으면 BadRequest', async () => {
      await expect(
        svc().create(1, {
          kind: 'transaction',
          rule: {},
          startDate: '2026-01-01',
          txType: 'expense',
          title: 'A',
          category: 'c',
          amount: 1000,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('kind=transaction 정상 입력이면 생성', async () => {
      const res = await svc().create(1, {
        kind: 'transaction',
        rule: { cycle: 'monthly', day: 25 },
        startDate: '2026-01-25',
        txType: 'income',
        title: '월급',
        category: 'income_salary',
        amount: 3000000,
      } as any);
      expect(res.title).toBe('월급');
      expect(res.amount).toBe(3000000);
    });
  });

  describe('update/toggle/remove', () => {
    async function seedTx() {
      return svc().create(1, {
        kind: 'transaction',
        rule: { cycle: 'monthly', day: 25 },
        startDate: '2026-01-25',
        txType: 'expense',
        title: '월세',
        category: 'housing_rent',
        amount: 500000,
      } as any);
    }

    it('타인 소유 스케줄은 NotFound', async () => {
      const created = await seedTx();
      schedules[0].user_id = 2;
      await expect(
        svc().update(1, created.id, { title: 'X' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('toggle 하면 active가 반전됨', async () => {
      const created = await seedTx();
      expect(created.active).toBe(true);
      const toggled = await svc().toggle(1, created.id);
      expect(toggled.active).toBe(false);
    });

    it('삭제하면 deleted_at이 채워지고 목록에서 사라짐', async () => {
      const created = await seedTx();
      await svc().remove(1, created.id);
      const list = await svc().findAll(1, {});
      expect(list).toHaveLength(0);
    });
  });
});
