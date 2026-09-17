-- CreateEnum
CREATE TYPE "IssueChangeKind" AS ENUM ('new', 'fixed');

-- AlterTable
ALTER TABLE "audit" ADD COLUMN     "fixedIssueCount" INTEGER,
ADD COLUMN     "newIssueCount" INTEGER,
ADD COLUMN     "previousAuditId" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoreDelta" INTEGER;

-- AlterTable
ALTER TABLE "issue" ADD COLUMN     "fingerprint" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "issue_change" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "kind" "IssueChangeKind" NOT NULL,
    "ruleId" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "path" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "issue_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_change_auditId_kind_idx" ON "issue_change"("auditId", "kind");

-- CreateIndex
CREATE INDEX "issue_auditId_fingerprint_idx" ON "issue"("auditId", "fingerprint");

-- AddForeignKey
ALTER TABLE "issue_change" ADD CONSTRAINT "issue_change_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill fingerprints for issues created before fingerprints existed.
UPDATE "issue" AS i
SET "fingerprint" = i."ruleId" || '|' || p."path" || '|' || COALESCE(i."evidence"->>'targetUrl', '')
FROM "page" AS p
WHERE p."id" = i."pageId" AND i."fingerprint" = '';
