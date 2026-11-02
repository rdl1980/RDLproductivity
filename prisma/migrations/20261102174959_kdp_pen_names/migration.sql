-- CreateTable
CREATE TABLE "KdpPenName" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT,
    "website" TEXT,
    "email" TEXT,
    "amazonUrl" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "tiktok" TEXT,
    "languages" TEXT,
    "genres" TEXT,
    "bio" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KdpPenName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KdpPenName_name_key" ON "KdpPenName"("name");
ALTER TABLE "KdpPenName" ENABLE ROW LEVEL SECURITY;
