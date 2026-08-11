ALTER TABLE "User" ADD COLUMN "githubUsername" TEXT;
ALTER TABLE "Submission" ADD COLUMN "githubAccessGrantedAt" TIMESTAMP(3);
