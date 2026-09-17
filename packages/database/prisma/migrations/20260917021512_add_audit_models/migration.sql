-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('critical', 'warning', 'notice');

-- CreateTable
CREATE TABLE "audit" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'queued',
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "noticeCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_scanId_key" ON "audit"("scanId");

-- CreateIndex
CREATE INDEX "audit_organizationId_idx" ON "audit"("organizationId");

-- CreateIndex
CREATE INDEX "issue_auditId_severity_idx" ON "issue"("auditId", "severity");

-- CreateIndex
CREATE INDEX "issue_auditId_ruleId_idx" ON "issue"("auditId", "ruleId");

-- AddForeignKey
ALTER TABLE "audit" ADD CONSTRAINT "audit_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue" ADD CONSTRAINT "issue_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
