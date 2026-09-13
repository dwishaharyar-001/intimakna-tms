-- Setelan umum aplikasi (baris tunggal).
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);
