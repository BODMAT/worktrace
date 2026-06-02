-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "endedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Track_capturedAt_idx" ON "Track"("capturedAt");
