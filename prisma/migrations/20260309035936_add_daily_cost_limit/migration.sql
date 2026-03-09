-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "dailyCostLimit" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "dailyCostUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UpstreamAccount" ALTER COLUMN "baseUrl" SET DEFAULT 'https://chatgpt.com/backend-api/codex';
