"use server";

import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

const MAX_NOTIFICATION_LENGTH = 2000;

export type SendNotificationResult = { error: string } | { ok: true };

/**
 * A Giver sending a message to the Solver who owns one or more
 * submission attempts, with the ability to tag which specific attempt(s)
 * the message is about (product decision 2026-09-30 — attempts from the
 * same solver are grouped in the UI, so one message can reference
 * several at once, e.g. "this applies to both your 2nd and 3rd tries").
 * One-directional by design — there is no "reply" action, and no
 * thread/chat model. The concern this is guarding against is a Giver and
 * Solver using open back-and-forth messaging to negotiate a deal outside
 * the platform (agreeing a lower price, cutting the platform's fee) — a
 * one-way nudge from the Giver doesn't enable that the way a chat does.
 * See classifySubmissionFailure and buildSuggestedNotification
 * (lib/problems/submission-failure.ts) for how a suggested starting text
 * can be generated; this action only sends whatever text the Giver
 * actually submits, edited or not.
 *
 * submissionIds must all belong to the SAME solver and the SAME problem
 * this Giver owns — verified here, not assumed from the caller, so a
 * Giver can never tag an attempt that belongs to a different solver than
 * the one they're actually messaging.
 */
export async function sendSubmissionNotification(
  submissionIds: string[],
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
  if (submissionIds.length === 0) {
    return { error: "Select at least one attempt to reference." };
  }

  const submissions = await prisma.submission.findMany({
    where: { id: { in: submissionIds } },
    select: { id: true, solverId: true, problem: { select: { giverId: true } } },
  });

  if (submissions.length !== submissionIds.length) {
    return { error: "One or more submissions not found." };
  }
  // Only the Giver who owns every referenced submission's problem may
  // notify about it — this is not a general-purpose messaging endpoint.
  if (submissions.some((s) => s.problem.giverId !== user.id)) {
    return { error: "Not authorized." };
  }
  // All tagged attempts must belong to the SAME solver — a multi-attempt
  // message is "multiple tries by one person," never a way to address
  // two different solvers in one send.
  const solverIds = new Set(submissions.map((s) => s.solverId));
  if (solverIds.size > 1) {
    return { error: "All selected attempts must be from the same solver." };
  }
  const recipientId = submissions[0].solverId;

  await prisma.notification.create({
    data: {
      recipientId,
      senderId: user.id,
      submissionId: submissions[0].id, // primary/deep-link target — see schema.prisma's doc comment
      body,
      referencedSubmissions: {
        create: submissionIds.map((id) => ({ submissionId: id })),
      },
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
