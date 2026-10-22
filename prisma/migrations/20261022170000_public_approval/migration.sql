-- CreateEnum
CREATE TYPE "PublicApproval" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- DropIndex
DROP INDEX "PortfolioProject_visibility_publishedAt_idx";

-- AlterTable
ALTER TABLE "PortfolioProject" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "publicApproval" "PublicApproval" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "PortfolioProject_visibility_publicApproval_publishedAt_idx" ON "PortfolioProject"("visibility", "publicApproval", "publishedAt");


-- Anything already PUBLIC was never reviewed: it goes back to pending rather than being approved by default.
UPDATE "PortfolioProject" SET "publicApproval" = 'PENDING' WHERE "visibility" = 'PUBLIC';
