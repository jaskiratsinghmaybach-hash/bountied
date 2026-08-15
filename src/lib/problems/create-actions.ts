"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { fundProblemFromCredits } from "@/lib/payments/credits";
import { creditsRequiredToFund } from "@/lib/payments/fees";
import { ProblemType } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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

type ParsedFields =
  | { error: string }
  | {
      title: string;
      description: string;
      type: ProblemType;
      tags: string[];
      bountyAmount: number | null;
      isFree: boolean;
      deadline: Date | null;
      runCommand: string;
    };

/** Shared validation for both create and update — no DB writes here. */
function parseFields(formData: FormData): ParsedFields {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "") as ProblemType;
  const tagsRaw = String(formData.get("tags") ?? "");
  const bountyAmountRaw = String(formData.get("bountyAmount") ?? "").trim();
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const runCommand = String(formData.get("runCommand") ?? "").trim();

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
    // TEMP for live-payment testing — was 5, restore before real launch.
    if (parsed < 1) {
      return { error: "Minimum bounty is $1." };
    }
    bountyAmount = Math.round(parsed * 100) / 100;
  }

  if (!runCommand) {
    return { error: "Enter the run command (e.g. python main.py)." };
  }
  if (!runCommand.startsWith("python")) {
    return { error: "Run command must start with python (this platform is Python-only)." };
  }

  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  if (deadline && Number.isNaN(deadline.getTime())) {
    return { error: "Invalid deadline." };
  }

  return { title, description, type, tags, bountyAmount, isFree, deadline, runCommand };
}

/**
 * Creates a Problem. Branches on formData's "intent" field:
 *
 *  - intent="draft": creates in DRAFT status and stops. No funding attempt,
 *    no money touched, giver can come back and finish later. This is the
 *    "Save as draft" button.
 *  - intent="publish" (default, for backwards compatibility): the original
 *    behavior — OPEN_FREE publishes immediately with no funding step;
 *    anything with a bounty attempts fundProblemFromCredits right away.
 *      - Enough balance -> funded and moved to OPEN in one step, redirect
 *        straight to the live problem.
 *      - Not enough balance -> the DRAFT problem is kept (nothing lost)
 *        and we return the exact shortfall so the UI can show the
 *        insufficient-credits modal with draftProblemId attached.
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

  const parsed = parseFields(formData);
  if ("error" in parsed) return parsed;

  const intent = String(formData.get("intent") ?? "publish");

  const problem = await prisma.problem.create({
    data: {
      title: parsed.title,
      description: parsed.description,
      type: parsed.type,
      tags: parsed.tags,
      bountyAmount: parsed.bountyAmount,
      runCommand: parsed.runCommand,
      runtime: "PYTHON",
      giverId: user.id,
      deadline: parsed.deadline,
      status: "DRAFT",
    },
  });

  if (intent === "draft") {
    revalidatePath("/dashboard/giver/problems");
    redirect("/dashboard/giver/problems");
  }

  // Free challenges have nothing to fund — publish immediately.
  if (parsed.isFree) {
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

  return { error: fundResult.message };
}

/**
 * Updates an existing DRAFT problem. DRAFT-only by design — once a
 * problem is funded/published, nothing here can touch it (money has
 * already moved, so editing title/bounty afterward would be misleading
 * at best and a funding-math bug at worst). Same intent branching as
 * create: "draft" just saves, "publish" saves then attempts funding.
 */
export async function updateProblem(
  problemId: string,
  _prevState: CreateProblemResult | undefined,
  formData: FormData
): Promise<CreateProblemResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do this." };

  const existing = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!existing) return { error: "Problem not found." };
  if (existing.giverId !== user.id) return { error: "Not authorized." };
  if (existing.status !== "DRAFT") {
    return { error: "Only draft bounties can be edited." };
  }

  const parsed = parseFields(formData);
  if ("error" in parsed) return parsed;

  const intent = String(formData.get("intent") ?? "publish");

  await prisma.problem.update({
    where: { id: problemId },
    data: {
      title: parsed.title,
      description: parsed.description,
      type: parsed.type,
      tags: parsed.tags,
      bountyAmount: parsed.bountyAmount,
      runCommand: parsed.runCommand,
      deadline: parsed.deadline,
    },
  });

  if (intent === "draft") {
    revalidatePath("/dashboard/giver/problems");
    redirect("/dashboard/giver/problems");
  }

  if (parsed.isFree) {
    await prisma.problem.update({
      where: { id: problemId },
      data: { status: "OPEN" },
    });
    redirect(`/dashboard/giver/problems/${problemId}`);
  }

  const fundResult = await fundProblemFromCredits({
    problemId,
    giverId: user.id,
  });

  if (fundResult.ok) {
    redirect(`/dashboard/giver/problems/${problemId}`);
  }

  if (fundResult.reason === "INSUFFICIENT_FUNDS") {
    return {
      insufficientCredits: true,
      draftProblemId: problemId,
      required: Math.round((fundResult.required - fundResult.balance) * 100) / 100,
      balance: fundResult.balance,
    };
  }

  return { error: fundResult.message };
}

/**
 * Deletes a DRAFT problem outright. DRAFT-only by design — no escrow has
 * ever existed for a draft (funding is what creates the Escrow row), so
 * there is nothing to refund and a hard delete is safe. Anything beyond
 * DRAFT is refused here rather than silently no-op'd.
 */
export async function deleteProblem(
  problemId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do this." };

  const existing = await prisma.problem.findUnique({
    where: { id: problemId },
    include: { escrow: true, submissions: { select: { id: true }, take: 1 } },
  });
  if (!existing) return { error: "Problem not found." };
  if (existing.giverId !== user.id) return { error: "Not authorized." };
  if (existing.status !== "DRAFT") {
    return { error: "Only draft bounties can be deleted." };
  }
  // Defensive — DRAFT structurally shouldn't have either, but never delete
  // a problem that has real money or submissions attached to it.
  if (existing.escrow || existing.submissions.length > 0) {
    return { error: "This bounty has activity on it and can't be deleted." };
  }

  await prisma.problem.delete({ where: { id: problemId } });
  revalidatePath("/dashboard/giver/problems");
  return { ok: true };
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

  return { error: fundResult.message };
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

/**
 * Background draft upsert — called by bounty-flow.tsx's debounce timer, NOT
 * by a form submit. Key differences from createProblem/updateProblem:
 *
 *  - Never calls redirect() — background server actions that call redirect()
 *    throw a Next.js NEXT_REDIRECT which the try/catch in the caller swallows
 *    silently, losing the draftProblemId on first save. Don't add redirect here.
 *  - Lenient validation — partial drafts are allowed (title can be short, etc.).
 *    The full validation only runs at publish time via createProblem/updateProblem.
 *  - Always returns { draftProblemId } so the caller can persist a newly
 *    created ID across the lifetime of the BountyFlow component.
 */
export async function autoSaveProblem(
  draftProblemId: string | null,
  formData: FormData
): Promise<{ draftProblemId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const title = String(formData.get("title") ?? "").trim() || "Untitled draft";
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "") as ProblemType;
  const tagsRaw = String(formData.get("tags") ?? "");
  const bountyAmountRaw = String(formData.get("bountyAmount") ?? "").trim();
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const runCommand = String(formData.get("runCommand") ?? "").trim();
  const repoUrlsRaw = String(formData.get("referenceRepoUrls") ?? "[]");
  const screenshotUrlsRaw = String(formData.get("screenshotUrls") ?? "[]");
  const addonsRaw = String(formData.get("addons") ?? "[]");
  const language = String(formData.get("language") ?? "").trim() || null;
  const scope = String(formData.get("scope") ?? "").trim() || null;

  const typeValid = CREATABLE_TYPES.includes(type);
  const bountyAmount = (() => {
    const n = Number(bountyAmountRaw);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  })();
  const deadline = (() => {
    if (!deadlineRaw) return null;
    const d = new Date(deadlineRaw);
    return Number.isNaN(d.getTime()) ? null : d;
  })();
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10);
  const referenceRepoUrls = (() => { try { return JSON.parse(repoUrlsRaw) as string[]; } catch { return []; } })();
  const screenshotUrls = (() => { try { return JSON.parse(screenshotUrlsRaw) as string[]; } catch { return []; } })();
  const addons = (() => { try { return JSON.parse(addonsRaw) as string[]; } catch { return []; } })();

  try {
    if (draftProblemId) {
      // Guard: only update rows the user owns and that are still DRAFTs.
      const existing = await prisma.problem.findUnique({ where: { id: draftProblemId } });
      if (!existing || existing.giverId !== user.id || existing.status !== "DRAFT") {
        return { error: "Draft not found or not editable." };
      }
      await prisma.problem.update({
        where: { id: draftProblemId },
        data: {
          title,
          description,
          ...(typeValid ? { type } : {}),
          tags,
          bountyAmount,
          runCommand: runCommand || existing.runCommand,
          deadline,
          language,
          scope,
          addons,
          referenceRepoUrls,
          screenshotUrls,
        } as any,
      });
      return { draftProblemId };
    } else {
      const problem = await prisma.problem.create({
        data: {
          title,
          description,
          type: typeValid ? type : ProblemType.OPEN_FREE,
          tags,
          bountyAmount,
          runCommand: runCommand || "python main.py",
          runtime: "PYTHON",
          giverId: user.id,
          deadline,
          status: "DRAFT",
          language,
          scope,
          addons,
          referenceRepoUrls,
          screenshotUrls,
        } as any,
      });
      return { draftProblemId: problem.id };
    }
  } catch (e) {
    return { error: String(e) };
  }
}
