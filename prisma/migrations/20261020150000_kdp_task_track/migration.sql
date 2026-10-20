-- Each account lane is split into "planned" and "actual"; existing tasks were plans.
ALTER TABLE "KdpTask" ADD COLUMN "track" TEXT NOT NULL DEFAULT 'planned';

ALTER TABLE "KdpTask" ADD CONSTRAINT "KdpTask_track_check" CHECK ("track" IN ('planned', 'actual'));

DROP INDEX "KdpTask_week_account_position_idx";
CREATE INDEX "KdpTask_week_account_track_position_idx" ON "KdpTask"("week", "account", "track", "position");
