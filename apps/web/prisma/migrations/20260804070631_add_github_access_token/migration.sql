-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubAccessToken" TEXT,
ADD COLUMN     "githubConnected" BOOLEAN NOT NULL DEFAULT false;
