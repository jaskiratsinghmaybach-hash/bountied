"use server";

import { createClient } from "@/lib/supabase/server";
import { requestWithdrawal } from "@/lib/payouts/withdraw";
import { revalidatePath } from "next/cache";

export type WithdrawActionResult =
  | { error: string }
  | { ok: true; payoutAmount: number };

export async function withdrawEarnings(
  _prevState: WithdrawActionResult | undefined,
  formData: FormData
): Promise<WithdrawActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You must be logged in to do this." };

  const requestedAmount = Number(formData.get("amount"));
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return { error: "Enter a valid withdrawal amount." };
  }

  const result = await requestWithdrawal({
    userId: user.id,
    requestedAmount,
  });

  if (!result.ok) return { error: result.reason };

  revalidatePath("/dashboard/solver/earnings");
  return { ok: true, payoutAmount: result.payoutAmount };
}
