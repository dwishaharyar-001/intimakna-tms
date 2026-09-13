-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('REGULAR', 'IN_HOUSE');

-- AlterTable
ALTER TABLE "ProgramBatch" ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "deliveryType" "DeliveryType" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "packagePaid" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "packagePaymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "packagePrice" DECIMAL(12,2),
ADD COLUMN     "pricePerPax" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "TrainingProgram" ADD COLUMN     "inHousePrice" DECIMAL(12,2);
