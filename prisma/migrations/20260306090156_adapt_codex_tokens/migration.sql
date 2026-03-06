/*
  Warnings:

  - You are about to drop the column `apiKey` on the `UpstreamAccount` table. All the data in the column will be lost.
  - Added the required column `accessToken` to the `UpstreamAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountId` to the `UpstreamAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `email` to the `UpstreamAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refreshToken` to the `UpstreamAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenExpiry` to the `UpstreamAccount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UpstreamAccount" DROP COLUMN "apiKey",
ADD COLUMN     "accessToken" TEXT NOT NULL,
ADD COLUMN     "accountId" TEXT NOT NULL,
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "idToken" TEXT,
ADD COLUMN     "lastRefresh" TIMESTAMP(3),
ADD COLUMN     "refreshToken" TEXT NOT NULL,
ADD COLUMN     "tokenExpiry" TIMESTAMP(3) NOT NULL;
