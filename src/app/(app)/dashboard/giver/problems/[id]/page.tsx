import { prisma } from "@/lib/prisma";
import { ReviewButton } from "@/components/problems/review-button";
import { FREE_REVIEWS_PER_PROBLEM } from "@/lib/reviews/pricing";
import { notFound } from "next/navigation";

export default async function GiverProblemPage({
  params,
}: {
  params: { id: string };
}) {
  const problem = await prisma.problem.findUnique({
    where: { id: params.id },
    include: {
      submissions: {
        include: { solver: true },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!problem) notFound();

  const freeReviewsLeft = Math.max(0, FREE_REVIEWS_PER_PROBLEM - problem.freeReviewsUsed);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">{problem.title}</h1>
          <p className="text-sm text-gray-500">
            Free Sandbox Reviews Remaining: <span className="font-semibold">{freeReviewsLeft} / {FREE_REVIEWS_PER_PROBLEM}</span>
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Submissions ({problem.submissions.length})</h2>

        {problem.submissions.map((sub) => (
          <div key={sub.id} className="p-4 border rounded-xl flex justify-between items-center bg-white shadow-sm">
            <div>
              <p className="font-semibold">{sub.solver.name} ({sub.solver.email})</p>
              <p className="text-sm text-gray-600 line-clamp-1">{sub.writeup}</p>
              <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700">
                Status: {sub.status}
              </span>
            </div>

            <div>
              {sub.status === "AWAITING_REVIEW" && (
                <ReviewButton
                  submissionId={sub.id}
                  giverId={problem.giverId}
                  freeReviewsLeft={freeReviewsLeft}
                  status={sub.status}
                />
              )}
              {sub.status === "UNDER_REVIEW" && (
                <span className="text-sm text-green-600 font-semibold">Sandbox Execution Complete</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}