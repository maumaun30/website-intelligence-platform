-- CreateEnum
CREATE TYPE "ScanTrigger" AS ENUM ('manual', 'scheduled');

-- AlterTable
ALTER TABLE "scan" ADD COLUMN     "trigger" "ScanTrigger" NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "website" ADD COLUMN     "nextScanAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "website_nextScanAt_idx" ON "website"("nextScanAt");
