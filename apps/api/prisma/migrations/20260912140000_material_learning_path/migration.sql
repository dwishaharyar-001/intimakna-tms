-- Judul Materi (unit ajar) + Learning Path (level) — Kelas Reguler = Judul Materi + Batch.
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "syllabus" TEXT,
    "levelNumber" INTEGER,
    "orderInLevel" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProgramBatch" ADD COLUMN "materialId" TEXT;

-- Bentuk satu Judul Materi per kategori kelas lama (atau nama batch bila kategori kosong),
-- lalu tautkan setiap kelas ke materinya. Level dibiarkan kosong agar diatur manual di Pengaturan.
WITH groups AS (
    SELECT COALESCE(NULLIF(TRIM("category"), ''), "batchName") AS g,
           MIN("description") AS d,
           MIN("syllabus") AS s
    FROM "ProgramBatch"
    GROUP BY 1
), ins AS (
    INSERT INTO "Material" ("id", "title", "category", "description", "syllabus", "orderInLevel")
    SELECT gen_random_uuid()::text, g, g, d, s, 0 FROM groups
    RETURNING "id", "title"
)
UPDATE "ProgramBatch" b
SET "materialId" = ins."id"
FROM ins
WHERE COALESCE(NULLIF(TRIM(b."category"), ''), b."batchName") = ins."title";

ALTER TABLE "ProgramBatch" ADD CONSTRAINT "ProgramBatch_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProgramBatch_materialId_idx" ON "ProgramBatch"("materialId");
