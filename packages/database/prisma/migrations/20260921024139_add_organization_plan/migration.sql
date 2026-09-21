-- CreateEnum
CREATE TYPE "OrganizationPlan" AS ENUM ('free', 'pro', 'agency');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "plan" "OrganizationPlan" NOT NULL DEFAULT 'free';
