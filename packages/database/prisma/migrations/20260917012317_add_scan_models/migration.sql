-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ScanStopReason" AS ENUM ('finished', 'maxPages', 'maxDepth', 'deadline');

-- CreateTable
CREATE TABLE "scan" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'queued',
    "stopReason" "ScanStopReason",
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "pagesFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "responseTimeMs" INTEGER,
    "title" TEXT,
    "redirectedTo" TEXT,
    "error" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_content" (
    "pageId" TEXT NOT NULL,
    "html" BYTEA NOT NULL,

    CONSTRAINT "page_content_pkey" PRIMARY KEY ("pageId")
);

-- CreateTable
CREATE TABLE "page_link" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL,

    CONSTRAINT "page_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scan_websiteId_createdAt_idx" ON "scan"("websiteId", "createdAt");

-- CreateIndex
CREATE INDEX "scan_organizationId_idx" ON "scan"("organizationId");

-- CreateIndex
CREATE INDEX "page_scanId_statusCode_idx" ON "page"("scanId", "statusCode");

-- CreateIndex
CREATE UNIQUE INDEX "page_scanId_url_key" ON "page"("scanId", "url");

-- CreateIndex
CREATE INDEX "page_link_pageId_idx" ON "page_link"("pageId");

-- AddForeignKey
ALTER TABLE "scan" ADD CONSTRAINT "scan_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page" ADD CONSTRAINT "page_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_content" ADD CONSTRAINT "page_content_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_link" ADD CONSTRAINT "page_link_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
