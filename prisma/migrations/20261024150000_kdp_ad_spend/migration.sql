-- CreateTable
CREATE TABLE "KdpAdSpend" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KdpAdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KdpAdSpend_date_idx" ON "KdpAdSpend"("date");

-- CreateIndex
CREATE INDEX "KdpAdSpend_asin_idx" ON "KdpAdSpend"("asin");

-- CreateIndex
CREATE UNIQUE INDEX "KdpAdSpend_account_date_currency_campaign_asin_key" ON "KdpAdSpend"("account", "date", "currency", "campaign", "asin");


ALTER TABLE "KdpAdSpend" ADD CONSTRAINT "KdpAdSpend_account_check" CHECK ("account" IN ('main', 'secondary'));

-- Only the app's own connection reads it: keep it out of any API role on hosted Postgres.
ALTER TABLE "KdpAdSpend" ENABLE ROW LEVEL SECURITY;
