-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "interestBatchId" TEXT,
ADD COLUMN     "interestProgramId" TEXT;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_interestProgramId_fkey" FOREIGN KEY ("interestProgramId") REFERENCES "TrainingProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_interestBatchId_fkey" FOREIGN KEY ("interestBatchId") REFERENCES "ProgramBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
