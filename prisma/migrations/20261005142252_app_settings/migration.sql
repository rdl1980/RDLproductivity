-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- Holds feed secrets material: keep it out of any API role on hosted Postgres.
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
