-- CreateTable
CREATE TABLE "KdpSale" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "marketplace" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "ebookAsin" TEXT,
    "paperbackAsin" TEXT,
    "hardcoverAsin" TEXT,
    "ebookUnits" INTEGER NOT NULL DEFAULT 0,
    "paperbackUnits" INTEGER NOT NULL DEFAULT 0,
    "hardcoverUnits" INTEGER NOT NULL DEFAULT 0,
    "kenp" INTEGER NOT NULL DEFAULT 0,
    "royalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "royaltyEbook" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "royaltyPaperback" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "royaltyHardcover" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "royaltyKenp" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "KdpSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KdpSale_date_idx" ON "KdpSale"("date");

-- CreateIndex
CREATE UNIQUE INDEX "KdpSale_account_date_marketplace_titleKey_key" ON "KdpSale"("account", "date", "marketplace", "titleKey");


ALTER TABLE "KdpSale" ADD CONSTRAINT "KdpSale_account_check" CHECK ("account" IN ('main', 'secondary'));

-- Only the app's own connection reads it: keep it out of any API role on hosted Postgres.
ALTER TABLE "KdpSale" ENABLE ROW LEVEL SECURITY;
