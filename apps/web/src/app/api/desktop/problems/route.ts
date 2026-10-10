import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDesktopUser, unauthorized } from "@/lib/desktop/auth";
import { FREE_REVIEWS_PER_PROBLEM, REVIEW_COST_USD } from "@/lib/reviews/pricing";

/** Problems the authenticated user posted, with submission counts. */
export async function GET(req: Request) {
  const user = await getDesktopUser(req);
  if (!user) return unauthorized();

  const problems = await prisma.problem.findMany({
    where: { giverId: user.id, status: { not: "DRAFT" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, status: true, runtime: true, language: true,
      bountyAmount: true, currency: true, deadline: true, updatedAt: true, freeReviewsUsed: true,
      _count: { select: { submissions: true } },
    },
  });

  return NextResponse.json({
    problems: problems.map((p) => ({
      id: p.id, title: p.title, status: p.status, runtime: p.runtime,
      language: p.language, currency: p.currency,
      bountyAmount: p.bountyAmount?.toNumber() ?? null,
      deadline: p.deadline, updatedAt: p.updatedAt,
      submissionCount: p._count.submissions,
      // Server-owned pricing so the client never hard-codes what a review costs.
      freeReviewsRemaining: Math.max(0, FREE_REVIEWS_PER_PROBLEM - p.freeReviewsUsed),
    })),
    reviewCostUsd: REVIEW_COST_USD,
  });
}
