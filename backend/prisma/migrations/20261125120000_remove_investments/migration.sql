-- 투자 기능을 주식모아(따로 운영하는 투자 앱)로 옮기며 이 앱의 투자 계좌 · 종목 · 반복매수를 뺀다 (ADR 0011).
-- 지우기 전에 남길 것부터 옮긴다. 순서: ① 만기 일정 옮기기 ② 자산이동 연결 끊기 ③ 반복매수 · 투자 카테고리 지우기 ④ 스키마
-- 되돌릴 수 없다 — 운영 적용 전에 DB 덤프를 뜬다

-- ① 투자 계좌(ISA 등) 만기 → 일반 일정 한 번 옮기기. 만기일은 바뀌지 않으니 연결하지 않는다. 당일 오전 9시 알림을 켠다(옛 D-30 · 14 · 7 · 1 만기 알림 대신)
--    MariaDB 는 DDL 마다 바로 커밋한다 — ④ 에서 멈춰 다시 돌려도 일정이 두 번 들어가지 않게, 같은 사용자 · 날짜 · 제목이 있으면 건너뛴다
INSERT INTO `calendar_event` (`user_id`, `date`, `type`, `title`, `memo`, `notify`, `created_at`, `updated_at`)
SELECT a.`user_id`, a.`maturity_date`, 'due', CONCAT(a.`name`, ' 만기'), '투자 계좌 만기 — 투자 기능을 주식모아로 옮기며 일정으로 옮김', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `investment_account` a
WHERE a.`deleted_at` IS NULL AND a.`maturity_date` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `calendar_event` c
    WHERE c.`user_id` = a.`user_id` AND c.`date` = a.`maturity_date` AND c.`title` = CONCAT(a.`name`, ' 만기') AND c.`deleted_at` IS NULL
  );

-- ② 투자 예수금으로 보낸 자산이동은 남긴다(현금에서 빠져나간 기록 — 지우면 현금이 틀어진다). 대상 연결만 끊는다 — 화면에는 연결 없는 자산이동으로 보인다. 반복 자동이체 설정도 같다
UPDATE `transaction` SET `target_id` = NULL WHERE `target_type` = 'investment';
UPDATE `recurring_schedule` SET `target_id` = NULL WHERE `target_type` = 'investment';

-- ③ 반복매수 설정 · 투자 종목 유형 카테고리
DELETE FROM `recurring_schedule` WHERE `kind` = 'investment';
DELETE FROM `category` WHERE `domain` = 'investment';

-- ④ 스키마
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
