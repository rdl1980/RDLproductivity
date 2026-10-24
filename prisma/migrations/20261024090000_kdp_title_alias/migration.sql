-- CreateTable
CREATE TABLE "KdpTitleAlias" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "bookId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdpTitleAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KdpTitleAlias_account_titleKey_key" ON "KdpTitleAlias"("account", "titleKey");

-- AddForeignKey
ALTER TABLE "KdpTitleAlias" ADD CONSTRAINT "KdpTitleAlias_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "KdpBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "KdpTitleAlias" ADD CONSTRAINT "KdpTitleAlias_account_check" CHECK ("account" IN ('main', 'secondary'));
ALTER TABLE "KdpTitleAlias" ADD CONSTRAINT "KdpTitleAlias_target_check" CHECK ("bookId" IS NOT NULL OR "title" IS NOT NULL);

-- Only the app's own connection reads it: keep it out of any API role on hosted Postgres.
ALTER TABLE "KdpTitleAlias" ENABLE ROW LEVEL SECURITY;
