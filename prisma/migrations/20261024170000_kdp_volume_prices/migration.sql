-- AlterTable
ALTER TABLE "KdpBook" ADD COLUMN     "volume" INTEGER;

-- CreateTable
CREATE TABLE "KdpPriceHistory" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "market" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdpPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KdpPriceHistory_bookId_format_seenAt_idx" ON "KdpPriceHistory"("bookId", "format", "seenAt");

-- AddForeignKey
ALTER TABLE "KdpPriceHistory" ADD CONSTRAINT "KdpPriceHistory_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "KdpBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only the app's own connection reads it: keep it out of any API role on hosted Postgres.
ALTER TABLE "KdpPriceHistory" ENABLE ROW LEVEL SECURITY;
