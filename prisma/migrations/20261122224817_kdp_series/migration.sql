-- AlterTable
ALTER TABLE "KdpBook" ADD COLUMN     "publishedAt" DATE;

-- CreateTable
CREATE TABLE "KdpSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "penName" TEXT,
    "kdpName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plannedVolumes" INTEGER,
    "language" TEXT,
    "genre" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdpSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdpSeriesBook" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "volume" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'idea',
    "plannedDate" DATE,
    "bookId" TEXT,
    "taskId" TEXT,
    "cardId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdpSeriesBook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KdpSeries_account_kdpName_key" ON "KdpSeries"("account", "kdpName");

-- CreateIndex
CREATE UNIQUE INDEX "KdpSeriesBook_bookId_key" ON "KdpSeriesBook"("bookId");

-- CreateIndex
CREATE INDEX "KdpSeriesBook_seriesId_idx" ON "KdpSeriesBook"("seriesId");

-- CreateIndex
CREATE INDEX "KdpSeriesBook_cardId_idx" ON "KdpSeriesBook"("cardId");

-- CreateIndex
CREATE INDEX "KdpSeriesBook_taskId_idx" ON "KdpSeriesBook"("taskId");

-- AddForeignKey
ALTER TABLE "KdpSeriesBook" ADD CONSTRAINT "KdpSeriesBook_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "KdpSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KdpSeriesBook" ADD CONSTRAINT "KdpSeriesBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "KdpBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KdpSeriesBook" ADD CONSTRAINT "KdpSeriesBook_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "KdpTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KdpSeriesBook" ADD CONSTRAINT "KdpSeriesBook_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Stored values stay stable; labels live in the app.
ALTER TABLE "KdpSeries" ADD CONSTRAINT "KdpSeries_account_check" CHECK ("account" IN ('main', 'secondary', 'third', 'fourth'));
ALTER TABLE "KdpSeries" ADD CONSTRAINT "KdpSeries_status_check" CHECK ("status" IN ('active', 'paused', 'completed'));
ALTER TABLE "KdpSeries" ADD CONSTRAINT "KdpSeries_plannedVolumes_check" CHECK ("plannedVolumes" IS NULL OR "plannedVolumes" > 0);
ALTER TABLE "KdpSeriesBook" ADD CONSTRAINT "KdpSeriesBook_status_check" CHECK ("status" IN ('idea', 'working', 'ready', 'published'));
ALTER TABLE "KdpSeriesBook" ADD CONSTRAINT "KdpSeriesBook_volume_check" CHECK ("volume" IS NULL OR "volume" > 0);

-- Supabase exposes public tables through PostgREST: only the app (owner role) reads them.
ALTER TABLE "KdpSeries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KdpSeriesBook" ENABLE ROW LEVEL SECURITY;
