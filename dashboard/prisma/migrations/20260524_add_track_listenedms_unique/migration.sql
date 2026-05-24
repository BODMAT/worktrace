-- DropIndex
DROP INDEX "Track_sessionId_idx";

-- AlterTable
ALTER TABLE "Track" ADD COLUMN     "listenedMs" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Track_sessionId_artist_title_key" ON "Track"("sessionId", "artist", "title");
