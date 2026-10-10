-- CreateTable
CREATE TABLE "NotificationSubmission" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSubmission_notificationId_submissionId_key" ON "NotificationSubmission"("notificationId", "submissionId");

-- CreateIndex
CREATE INDEX "NotificationSubmission_submissionId_idx" ON "NotificationSubmission"("submissionId");

-- AddForeignKey
ALTER TABLE "NotificationSubmission" ADD CONSTRAINT "NotificationSubmission_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSubmission" ADD CONSTRAINT "NotificationSubmission_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
