-- CreateTable
CREATE TABLE "KdpRank" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rank" INTEGER,
    "category" TEXT,
    "reviews" INTEGER,
    "rating" DOUBLE PRECISION,

    CONSTRAINT "KdpRank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KdpRank_bookId_date_idx" ON "KdpRank"("bookId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "KdpRank_asin_market_date_key" ON "KdpRank"("asin", "market", "date");

-- AddForeignKey
ALTER TABLE "KdpRank" ADD CONSTRAINT "KdpRank_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "KdpBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase exposes public tables through PostgREST: only the app (owner role) reads them.
ALTER TABLE "KdpRank" ENABLE ROW LEVEL SECURITY;
