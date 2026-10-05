-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "coverId" TEXT;

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_cardId_createdAt_idx" ON "Attachment"("cardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Card_coverId_key" ON "Card"("coverId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Holds private file URLs: keep it out of any API role on hosted Postgres.
ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
