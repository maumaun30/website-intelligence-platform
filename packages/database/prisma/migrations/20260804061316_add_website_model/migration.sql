-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('dns', 'meta');

-- CreateEnum
CREATE TYPE "ScanFrequency" AS ENUM ('manual', 'daily', 'weekly');

-- CreateTable
CREATE TABLE "website" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "verificationMethod" "VerificationMethod",
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "maxDepth" INTEGER NOT NULL DEFAULT 3,
    "maxPages" INTEGER NOT NULL DEFAULT 500,
    "includePaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludePaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scanFrequency" "ScanFrequency" NOT NULL DEFAULT 'manual',
    "respectRobotsTxt" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_organizationId_idx" ON "website"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "website_organizationId_domain_key" ON "website"("organizationId", "domain");

-- AddForeignKey
ALTER TABLE "website" ADD CONSTRAINT "website_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website" ADD CONSTRAINT "website_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
