-- CreateEnum
CREATE TYPE "CustomPageSection" AS ENUM ('FRONT', 'BACK');

-- Rename Album -> CustomPage, preserving any existing rows.
ALTER TABLE "Album" RENAME TO "CustomPage";
ALTER TABLE "CustomPage" RENAME CONSTRAINT "Album_pkey" TO "CustomPage_pkey";
ALTER TABLE "CustomPage" RENAME CONSTRAINT "Album_userId_fkey" TO "CustomPage_userId_fkey";
ALTER INDEX "Album_userId_idx" RENAME TO "CustomPage_userId_idx";

-- New columns. Existing rows (if any) get a default they can edit later —
-- NOT NULL still holds once the defaults below are dropped.
ALTER TABLE "CustomPage" ADD COLUMN "content" TEXT;
ALTER TABLE "CustomPage" ADD COLUMN "section" "CustomPageSection" NOT NULL DEFAULT 'BACK';
ALTER TABLE "CustomPage" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomPage" ALTER COLUMN "section" DROP DEFAULT;
ALTER TABLE "CustomPage" ALTER COLUMN "position" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "CustomPage_userId_section_position_idx" ON "CustomPage"("userId", "section", "position");

-- Rename Asset.albumId -> customPageId, preserving existing links.
ALTER TABLE "Asset" RENAME COLUMN "albumId" TO "customPageId";
ALTER TABLE "Asset" RENAME CONSTRAINT "Asset_albumId_fkey" TO "Asset_customPageId_fkey";
ALTER INDEX "Asset_albumId_idx" RENAME TO "Asset_customPageId_idx";
