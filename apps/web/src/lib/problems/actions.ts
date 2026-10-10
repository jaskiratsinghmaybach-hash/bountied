"use server";

import { createClient } from "@/lib/supabase/server";
import { acceptSubmissionAndRelease } from "@/lib/escrow/release";
import { revalidatePath } from "next/cache";

export type AcceptSubmissionResult = { error: string } | { ok: true };

export async function acceptSubmission(
  problemId: string,
  submissionId: string
): Promise<AcceptSubmissionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in to do this." };

  const result = await acceptSubmissionAndRelease({
    problemId,
    submissionId,
    actingGiverId: user.id,
  });

  if (!result.ok) return { error: result.reason };

  revalidatePath(`/dashboard/giver/problems/${problemId}`);
  revalidatePath("/problems");
  revalidatePath(`/problems/${problemId}`);
  return { ok: true };
}