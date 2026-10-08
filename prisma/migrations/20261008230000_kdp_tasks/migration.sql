-- CreateTable
CREATE TABLE "KdpTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "account" TEXT NOT NULL,
    "week" DATE NOT NULL,
    "position" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdpTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KdpTask_week_account_position_idx" ON "KdpTask"("week", "account", "position");

-- Fractional index: byte order, like the other position columns.
ALTER TABLE "KdpTask" ALTER COLUMN "position" TYPE TEXT COLLATE "C";

ALTER TABLE "KdpTask" ADD CONSTRAINT "KdpTask_account_check" CHECK ("account" IN ('main', 'secondary'));

-- Only the app's own connection reads it: keep it out of any API role on hosted Postgres.
ALTER TABLE "KdpTask" ENABLE ROW LEVEL SECURITY;
