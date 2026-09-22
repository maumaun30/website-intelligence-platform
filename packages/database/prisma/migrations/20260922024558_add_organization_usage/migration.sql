-- CreateTable
CREATE TABLE "organization_usage" (
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "aiExplanations" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_usage_pkey" PRIMARY KEY ("organizationId","month")
);
