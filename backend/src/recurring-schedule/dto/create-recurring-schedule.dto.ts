import { RecurringKind, TransactionType, TransferTarget } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// 자동이체(반복 자동 생성) 설정 추가 — kind 는 transaction 하나 (반복매수는 2026-11 투자 기능과 함께 뺐다, ADR 0011)
export class CreateRecurringScheduleDto {
  @IsEnum(RecurringKind)
  kind: RecurringKind;

  // 반복 규칙 — cycle(주기)/day(기준일)/month(연간 전용)/weekendAdjust(주말 처리)
  @IsObject()
  rule: Record<string, unknown>;

  // 최초 실행 기준일
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // ── kind=transaction 전용 ──
  @ValidateIf((o: CreateRecurringScheduleDto) => o.kind === 'transaction')
  @IsEnum(TransactionType)
  txType?: TransactionType;

  @ValidateIf((o: CreateRecurringScheduleDto) => o.kind === 'transaction')
  @IsString()
  @MaxLength(200)
  title?: string;

  @ValidateIf((o: CreateRecurringScheduleDto) => o.kind === 'transaction')
  @IsString()
  @MaxLength(50)
  category?: string;

  @ValidateIf((o: CreateRecurringScheduleDto) => o.kind === 'transaction')
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;

  // 자산이동 누적 대상 종류 — txType='transfer'일 때만 의미, targetId와 함께 지정해야 자동 반영됨. 새로 연결할 수 있는 것은 예적금뿐(투자 계좌는 없어졌다)
  @ValidateIf((o: CreateRecurringScheduleDto) => o.targetId !== undefined)
  @IsIn([TransferTarget.saving])
  targetType?: TransferTarget;

  @ValidateIf((o: CreateRecurringScheduleDto) => o.targetType !== undefined)
  @IsInt()
  targetId?: number;
}
