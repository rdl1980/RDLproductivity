-- CreateTable
CREATE TABLE "KdpBook" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "kdpId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "series" TEXT,
    "formats" JSONB NOT NULL,
    "missingSince" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdpBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdpBookLink" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdpBookLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KdpBook_account_kdpId_key" ON "KdpBook"("account", "kdpId");

-- CreateIndex
CREATE INDEX "KdpBookLink_cardId_idx" ON "KdpBookLink"("cardId");

-- CreateIndex
CREATE INDEX "KdpBookLink_status_idx" ON "KdpBookLink"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KdpBookLink_bookId_cardId_key" ON "KdpBookLink"("bookId", "cardId");

-- AddForeignKey
ALTER TABLE "KdpBookLink" ADD CONSTRAINT "KdpBookLink_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "KdpBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KdpBookLink" ADD CONSTRAINT "KdpBookLink_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "KdpBook" ADD CONSTRAINT "KdpBook_account_check" CHECK ("account" IN ('main', 'secondary'));
ALTER TABLE "KdpBookLink" ADD CONSTRAINT "KdpBookLink_status_check" CHECK ("status" IN ('confirmed', 'suggested', 'rejected'));

-- Only the app's own connection reads them: keep them out of any API role on hosted Postgres.
ALTER TABLE "KdpBook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KdpBookLink" ENABLE ROW LEVEL SECURITY;
