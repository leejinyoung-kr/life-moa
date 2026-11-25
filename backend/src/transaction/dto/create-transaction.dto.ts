import { TransactionType, TransferTarget } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type: TransactionType;

  // 거래일 (YYYY-MM-DD)
  @IsDateString()
  date: string;

  @IsString()
  @MaxLength(200)
  title: string;

  // 소분류(leaf) 카테고리 code (예: food_dining). 대분류는 Category.parent_code 로 파생
  @IsString()
  @MaxLength(50)
  category: string;

  @IsNumber()
  amount: number;

  // 결제수단 — 지출에만 의미. 수입/자산이동이면 미입력(빈값 저장)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  payMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;

  // 자산이동 누적 대상 종류 — type='transfer'일 때만 의미, targetId와 함께 지정해야 자동 반영됨.
  // 새로 연결할 수 있는 것은 예적금뿐 — 투자 계좌는 2026-11 주식모아로 옮기며 없어졌다(옛 거래의 investment 는 target_id 없이 남는다, ADR 0011)
  @ValidateIf((o: CreateTransactionDto) => o.targetId !== undefined)
  @IsIn([TransferTarget.saving])
  targetType?: TransferTarget;

  // 자산이동 누적 대상 id (Saving.id)
  @ValidateIf((o: CreateTransactionDto) => o.targetType !== undefined)
  @IsInt()
  targetId?: number;
}
