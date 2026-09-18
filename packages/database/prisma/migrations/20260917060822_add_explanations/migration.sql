-- CreateEnum
CREATE TYPE "ExplanationStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "explanation" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "ExplanationStatus" NOT NULL DEFAULT 'queued',
    "content" JSONB,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "error" TEXT,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "explanation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "explanation_organizationId_requestedAt_idx" ON "explanation"("organizationId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "explanation_auditId_ruleId_key" ON "explanation"("auditId", "ruleId");

-- AddForeignKey
ALTER TABLE "explanation" ADD CONSTRAINT "explanation_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
