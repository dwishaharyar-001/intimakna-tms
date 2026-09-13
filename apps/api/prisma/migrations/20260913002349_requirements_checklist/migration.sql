-- CreateEnum
CREATE TYPE "RequirementCategory" AS ENUM ('DEFAULT', 'CUSTOM');

-- DropIndex
DROP INDEX "ProgramBatch_materialId_idx";

-- AlterTable
ALTER TABLE "Material" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "RequirementTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchRequirement" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "category" "RequirementCategory" NOT NULL DEFAULT 'DEFAULT',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BatchRequirement_batchId_category_orderIndex_idx" ON "BatchRequirement"("batchId", "category", "orderIndex");

-- CreateIndex
CREATE INDEX "Material_levelNumber_orderInLevel_idx" ON "Material"("levelNumber", "orderInLevel");

-- AddForeignKey
ALTER TABLE "BatchRequirement" ADD CONSTRAINT "BatchRequirement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProgramBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRequirement" ADD CONSTRAINT "BatchRequirement_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
