-- CreateTable — 주식모아에서 하루 한 번 받은 투자 합계. 순자산 「투자」 한 줄 (ADR 0011)
CREATE TABLE `investment_summary` (
    `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '고유번호',
    `user_id` INTEGER NOT NULL COMMENT 'user.id FK',
    `total_krw` DECIMAL(15, 2) NOT NULL COMMENT '총 평가액(종목 + 예수금, 세전)',
    `net_deposit_krw` DECIMAL(15, 2) NOT NULL COMMENT '원금(순입금)',
    `quote_at` DATETIME(3) NULL COMMENT '시세 기준(KST)',
    `price_missing` BOOLEAN NOT NULL DEFAULT false COMMENT '시세 빠진 종목 있음',
    `fx_missing` BOOLEAN NOT NULL DEFAULT false COMMENT '환율 빠짐',
    `fetched_at` DATETIME(3) NOT NULL COMMENT '받은 시각(KST)',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '생성일(KST)',
    `updated_at` DATETIME(3) NOT NULL COMMENT '수정일(KST)',

    UNIQUE INDEX `investment_summary_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='투자 합계(주식모아)';

-- AddForeignKey
ALTER TABLE `investment_summary` ADD CONSTRAINT `investment_summary_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
