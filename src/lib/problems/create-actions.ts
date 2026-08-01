"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { fundProblemFromCredits } from "@/lib/payments/credits";
import { creditsRequiredToFund } from "@/lib/payments/fees";
import { ProblemType } from "@prisma/client";
import { redirect } from "next/navigation";

export type CreateProblemResult =
  | { error: string }
  | {
      insufficientCredits: true;
      draftProblemId: string;
      /** Shortfall only — required minus current balance, not the bounty's full funding cost. */
      required: number;
      balance: number;
    };

const CREATABLE_TYPES: ProblemType[] = [
  ProblemType.OPEN_FREE,
  ProblemType.OPEN_BOUNTY,
  ProblemType.FIRST_TO_SOLVE,
  ProblemType.INVITE_ONLY,
  // FIXED_PRICE intentionally excluded — COMING SOON, not enabled in v1.
];

/**
 * Creates a Problem in DRAFT status, then immediately attempts to fund it
 * from the giver's credit balance.
 *
 *  - OPEN_FREE (no bounty): created and published as OPEN directly, no
 *    funding step at all.
 *  - Anything with a bounty: created as DRAFT, then fundProblemFromCredits
 *    is attempted right away.
 *      - Enough balance -> funded and moved to OPEN in one step, we
 *        redirect straight to the live problem.
 *      - Not enough balance -> we do NOT fail the whole action. The DRAFT
 *        problem is kept (nothing is lost) and we return the exact
 *        shortfall so the UI can show the insufficient-credits modal with
 *        draftProblemId attached. The Whop webhook finishes funding this
 *        exact draft once checkout succeeds (see api/webhooks/whop/route.ts).
 */
export async function createProblem(
  _prevState: CreateProblemResult | undefined,
  formData: FormData
): Promise<CreateProblemResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do this." };

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) return { error: "Profile not found." };
  if (profile.role !== "GIVER" && profile.role !== "BOTH") {
    return { error: "Only problem-givers can post a bounty." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "") as ProblemType;
  const tagsRaw = String(formData.get("tags") ?? "");
  const bountyAmountRaw = String(formData.get("bountyAmount") ?? "").trim();
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();

  if (!title || title.length < 5) {
    return { error: "Title must be at least 5 characters." };
  }
  if (!description || description.length < 20) {
    return { error: "Description must be at least 20 characters." };
  }
  if (!CREATABLE_TYPES.includes(type)) {
    return { error: "Invalid bounty type." };
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);

  const isFree = type === ProblemType.OPEN_FREE;
  let bountyAmount: number | null = null;

  if (!isFree) {
    const parsed = Number(bountyAmountRaw);
    if (!bountyAmountRaw || !Number.isFinite(parsed) || parsed <= 0) {
      return { error: "Enter a valid bounty amount." };
    }
    if (parsed < 5) {
      return { error: "Minimum bounty is $5." };
    }
    bountyAmount = Math.round(parsed * 100) / 100;
  }

  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  if (deadline && Number.isNaN(deadline.getTime())) {
    return { error: "Invalid deadline." };
  }

  const problem = await prisma.problem.create({
    data: {
      title,
      description,
      type,
      tags,
      bountyAmount,
      giverId: user.id,
      deadline,
      status: "DRAFT",
    },
  });

  // Free challenges have nothing to fund — publish immediately.
  if (isFree) {
    await prisma.problem.update({
      where: { id: problem.id },
      data: { status: "OPEN" },
    });
    redirect(`/dashboard/giver/problems/${problem.id}`);
  }

  const fundResult = await fundProblemFromCredits({
    problemId: problem.id,
    giverId: user.id,
  });

  if (fundResult.ok) {
    redirect(`/dashboard/giver/problems/${problem.id}`);
  }

  if (fundResult.reason === "INSUFFICIENT_FUNDS") {
    return {
      insufficientCredits: true,
      draftProblemId: problem.id,
      required: Math.round((fundResult.required - fundResult.balance) * 100) / 100,
      balance: fundResult.balance,
    };
  }

  return { error: fundResult.reason };
}

/**
 * Re-attempts funding an existing DRAFT problem from credits. Used after
 * the giver tops up their balance without leaving the page (e.g. they had
 * *some* balance already and only needed a smaller top-up than the full
 * bounty). Also called by the checkout success redirect as a fallback in
 * case the webhook hasn't landed yet.
 *
 * Unlike createProblem, this is called directly from client code (not as a
 * <form action>), so it deliberately does NOT call redirect() itself —
 * thrown Next.js redirects only navigate reliably when the action runs as
 * a form action. The caller navigates client-side on { ok: true } instead.
 */
export async function retryFundDraft(
  draftProblemId: string
): Promise<CreateProblemResult | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do this." };

  const fundResult = await fundProblemFromCredits({
    problemId: draftProblemId,
    giverId: user.id,
  });

  if (fundResult.ok) {
    return { ok: true };
  }

  if (fundResult.reason === "INSUFFICIENT_FUNDS") {
    return {
      insufficientCredits: true,
      draftProblemId,
      required: Math.round((fundResult.required - fundResult.balance) * 100) / 100,
      balance: fundResult.balance,
    };
  }

  return { error: fundResult.reason };
}

/** Quick lookup used by the insufficient-credits modal to show bounty context. */
export async function getDraftShortfall(draftProblemId: string) {
  const problem = await prisma.problem.findUnique({
    where: { id: draftProblemId },
    select: { bountyAmount: true, title: true },
  });
  if (!problem?.bountyAmount) return null;
  return {
    title: problem.title,
    required: creditsRequiredToFund(Number(problem.bountyAmount)),
  };
}
