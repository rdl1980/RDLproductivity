-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "priority" INTEGER;

-- CreateIndex
CREATE INDEX "Card_priority_idx" ON "Card"("priority");

-- Priorities are P0 (highest) to P4 (lowest).
ALTER TABLE "Card" ADD CONSTRAINT "Card_priority_range" CHECK ("priority" BETWEEN 0 AND 4);
