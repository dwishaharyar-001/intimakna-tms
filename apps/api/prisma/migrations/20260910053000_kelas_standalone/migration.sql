-- Kelas Reguler berdiri sendiri (menu training default INTIMAKNA);
-- Program Pelatihan berdiri sendiri (materi custom). Relasi dihapus.
-- Kolom deskriptif kelas dipindah dari program (bila ada) lalu FK dilepas.

ALTER TABLE "ProgramBatch" ADD COLUMN "category" TEXT;
ALTER TABLE "ProgramBatch" ADD COLUMN "description" TEXT;
ALTER TABLE "ProgramBatch" ADD COLUMN "syllabus" TEXT;

UPDATE "ProgramBatch" b
SET "category"    = COALESCE(b."category", p."category"),
    "description" = COALESCE(b."description", p."description"),
    "syllabus"    = COALESCE(b."syllabus", p."syllabus"),
    "pricePerPax" = COALESCE(b."pricePerPax", p."standardPrice")
FROM "TrainingProgram" p
WHERE b."programId" = p."id";

ALTER TABLE "ProgramBatch" DROP CONSTRAINT IF EXISTS "ProgramBatch_programId_fkey";
ALTER TABLE "ProgramBatch" DROP COLUMN "programId";
