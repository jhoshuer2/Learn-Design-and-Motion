/*
  Warnings:

  - You are about to drop the `Certificate` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "RemediationStatus" AS ENUM ('OPEN', 'COMPLETED');

-- DropForeignKey
ALTER TABLE "Certificate" DROP CONSTRAINT "Certificate_userId_fkey";

-- AlterTable
ALTER TABLE "Level" ADD COLUMN     "requiredCompetencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scopeLabel" TEXT,
ADD COLUMN     "scopeNote" TEXT;

-- DropTable
DROP TABLE "Certificate";

-- CreateTable
CREATE TABLE "LevelCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "tier" "LevelTier" NOT NULL,
    "title" TEXT NOT NULL,
    "scopeLabel" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remediation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "resetNumber" INTEGER NOT NULL,
    "status" "RemediationStatus" NOT NULL DEFAULT 'OPEN',
    "requiredLessonIds" TEXT[],
    "createdFromEvaluationId" TEXT NOT NULL,
    "actionPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Remediation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LevelCompletion_userId_pathId_tier_key" ON "LevelCompletion"("userId", "pathId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "Remediation_userId_assignmentId_resetNumber_key" ON "Remediation"("userId", "assignmentId", "resetNumber");

-- AddForeignKey
ALTER TABLE "LevelCompletion" ADD CONSTRAINT "LevelCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remediation" ADD CONSTRAINT "Remediation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
