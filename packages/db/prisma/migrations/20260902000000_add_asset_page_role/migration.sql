-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "pageRole" TEXT;

-- CreateIndex
CREATE INDEX "Asset_userId_pageRole_idx" ON "Asset"("userId", "pageRole");
