-- AlterTable
ALTER TABLE "LeadStage" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TrainingProgram" ADD COLUMN     "syllabus" TEXT;
