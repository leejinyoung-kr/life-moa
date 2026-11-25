-- 투자 기능을 주식모아로 옮기며 남은 투자 테이블 · 컬럼을 지운다 (ADR 0011) — 2/2 스키마
-- 데이터 정리(만기 일정 옮기기 · 연결 끊기 · 반복매수 지우기)는 앞 배포의 20261125120000_remove_investments 가 했다.
-- 새 코드가 운영에 뜬 뒤에 돌도록 배포를 나눴다 — 이 파일이 실패해 옛 컨테이너가 남아도 그 코드는 이미 투자 테이블을 읽지 않는다
-- 되돌릴 수 없다 — 운영 적용 전에 DB 덤프를 뜬다

-- DropForeignKey
ALTER TABLE `investment_account` DROP FOREIGN KEY `investment_account_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `investment` DROP FOREIGN KEY `investment_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `investment` DROP FOREIGN KEY `investment_account_id_fkey`;

-- DropForeignKey
ALTER TABLE `recurring_schedule` DROP FOREIGN KEY `recurring_schedule_investment_id_fkey`;

-- DropIndex
DROP INDEX `recurring_schedule_investment_id_idx` ON `recurring_schedule`;

-- AlterTable — MODIFY 는 코멘트를 지우므로 기존 코멘트를 다시 적는다
ALTER TABLE `recurring_schedule` DROP COLUMN `buy_amount`,
    DROP COLUMN `buy_quantity`,
    DROP COLUMN `investment_id`,
    MODIFY `kind` ENUM('transaction') NOT NULL COMMENT '대상 종류';

-- AlterTable — init 때 있던 코멘트를 되살린다(2026-10-13 마이그레이션의 MODIFY 가 지웠다)
ALTER TABLE `category` MODIFY `domain` ENUM('transaction', 'subscription', 'asset', 'saving', 'pay_method', 'bank', 'credential_cat') NOT NULL COMMENT '적용 도메인';

-- DropTable
DROP TABLE `investment_account`;

-- DropTable
DROP TABLE `investment`;
