-- 투자 기능을 주식모아(따로 운영하는 투자 앱)로 옮기며 이 앱의 투자 계좌 · 종목 · 반복매수를 뺀다 (ADR 0011) — 1/2 데이터 정리
-- 남길 것부터 옮긴다. 순서: ① 만기 일정 옮기기 ② 자산이동 연결 끊기 ③ 반복매수 · 투자 카테고리 지우기
-- 테이블 · 컬럼은 지우지 않는다 — 다음 배포의 20261125130000_drop_investment_tables 가 지운다.
--   배포는 컨테이너 교체 전에 마이그레이션을 돌린다. 그 뒤 점검에서 멈추면 옛 코드가 계속 도는데, 옛 코드는 투자 테이블을 읽는다.
--   그래서 이번 배포는 옛 코드도 견디는 데이터 정리만 하고, 새 코드가 뜬 뒤에 테이블을 지운다
-- 되돌릴 수 없다 — 운영 적용 전에 DB 덤프를 뜬다

-- ① 투자 계좌(ISA 등) 만기 → 일반 일정 한 번 옮기기. 만기일은 바뀌지 않으니 연결하지 않는다. 당일 오전 9시 알림을 켠다(옛 D-30 · 14 · 7 · 1 만기 알림 대신)
--    중간에 멈춰 다시 돌려도 일정이 두 번 들어가지 않게, 같은 사용자 · 날짜 · 제목이 있으면 건너뛴다
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
