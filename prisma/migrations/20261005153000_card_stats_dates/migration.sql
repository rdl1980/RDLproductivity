-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "listEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Card_completedAt_idx" ON "Card"("completedAt");


-- Backfill: the best available approximations for existing cards.
UPDATE "Card" SET "completedAt" = "updatedAt" WHERE "completed" = true;
UPDATE "Card" SET "listEnteredAt" = "createdAt";
