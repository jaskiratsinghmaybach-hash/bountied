"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type SaveBankDetailsResult = { error: string } | { ok: true };

/**
 * v1 bank details are stored directly, no external verification API call.
 * The platform admin manually reviews these before wiring any payout via
 * Wise — see the PayoutRequest queue in /admin/payouts.
 */
export async function saveBankDetails(
  _prevState: SaveBankDetailsResult | undefined,
  formData: FormData
): Promise<SaveBankDetailsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do this." };

  const legalName = String(formData.get("legalName") ?? "").trim();
  const bankCountry = String(formData.get("bankCountry") ?? "").trim();
  const bankAccountNumber = String(formData.get("bankAccountNumber") ?? "").trim();
  const bankIfscOrSwift = String(formData.get("bankIfscOrSwift") ?? "").trim();

  if (!legalName || legalName.length < 3) {
    return { error: "Enter your full legal name as it appears on your bank account." };
  }
  if (!bankCountry) {
    return { error: "Select your bank's country." };
  }
  if (!bankAccountNumber || bankAccountNumber.length < 4) {
    return { error: "Enter a valid account number." };
  }
  if (!bankIfscOrSwift || bankIfscOrSwift.length < 4) {
    return { error: "Enter a valid IFSC/SWIFT code." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      legalName,
      bankCountry,
      bankAccountNumber,
      bankIfscOrSwift,
      bankDetailsAdded: true,
    },
  });

  revalidatePath("/dashboard/solver/earnings");
  revalidatePath("/settings");
  return { ok: true };
}
