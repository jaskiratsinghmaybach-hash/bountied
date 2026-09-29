"use server";

import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

const MAX_NOTIFICATION_LENGTH = 2000;

export type SendNotificationResult = { error: string } | { ok: true };

/**
 * A Giver sending a message to the Solver on one of their submissions
 * (product decision 2026-09-29). One-directional by design — there is no
 * "reply" action, and no thread/chat model. The concern this is guarding
 * against is a Giver and Solver using open back-and-forth messaging to
 * negotiate a deal outside the platform (agreeing a lower price, cutting
 * the platform's fee) — a one-way nudge from the Giver doesn't enable
 * that the way a chat does. See classifySubmissionFailure and
 * buildSuggestedNotification (lib/problems/submission-failure.ts) for how
 * the suggested starting text is generated; this action only sends
 * whatever text the Giver actually submits, edited or not.
 */
export async function sendSubmissionNotification(
  submissionId: string,
  formData: FormData
): Promise<SendNotificationResult> {
  const user = await requireCurrentUser();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return { error: "Write a message before sending." };
  }
  if (body.length > MAX_NOTIFICATION_LENGTH) {
    return { error: `Keep it under ${MAX_NOTIFICATION_LENGTH} characters.` };
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, solverId: true, problem: { select: { giverId: true } } },
  });

  if (!submission) {
    return { error: "Submission not found." };
  }
  // Only the Giver who owns this submission's problem may notify its
  // solver — this is not a general-purpose messaging endpoint.
  if (submission.problem.giverId !== user.id) {
    return { error: "Not authorized." };
  }

  await prisma.notification.create({
    data: {
      recipientId: submission.solverId,
      senderId: user.id,
      submissionId: submission.id,
      body,
    },
  });

  revalidatePath("/dashboard/giver/problems");
  return { ok: true };
}

/** Recipient's own view of their notifications, newest first. Capped — this is a bell dropdown, not an inbox. */
export async function listMyNotifications() {
  const user = await requireCurrentUser();

  return prisma.notification.findMany({
    where: { recipientId: user.id },
    include: { sender: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function getUnreadNotificationCount() {
  const user = await requireCurrentUser();
  return prisma.notification.count({
    where: { recipientId: user.id, readAt: null },
  });
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireCurrentUser();

  // recipientId in the where clause, not just the id — a user can only
  // ever mark their OWN notifications read, not guess another user's
  // notification id and silently mark it read for them.
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const user = await requireCurrentUser();

  await prisma.notification.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/", "layout");
}
