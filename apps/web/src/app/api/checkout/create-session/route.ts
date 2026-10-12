import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import { parseDepositAmount } from "@/lib/payments/deposit";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { amount?: unknown; draftProblemId?: unknown } | null;
  const parsed = parseDepositAmount(body?.amount);
  if (!parsed.ok || parsed.amount === undefined) {
    return NextResponse.json({ error: parsed.error ?? "Invalid amount" }, { status: 400 });
  }
  const amount = parsed.amount;
  const draftProblemId = typeof body?.draftProblemId === "string" && body.draftProblemId ? body.draftProblemId : undefined;

  try {
    const provider = getPaymentProvider();
    const session = await provider.createCreditCheckoutSession({
      userId: user.id,
      amount,
      currency: "USD",
      // Top-ups are for any signed-in user (Giver or Solver). The webhook credits
      // metadata.userId, which the provider also sets from `userId` above.
      metadata: {
        userId: user.id,
        ...(draftProblemId ? { draftProblemId } : {}),
        requiredAmount: String(amount),
      },
    });

    return NextResponse.json({ planId: session.planId });
  } catch (err) {
    console.error("Whop checkout configuration creation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout could not be created" },
      { status: 502 }
    );
  }
}
