import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { amount, draftProblemId } = body as { amount: number; draftProblemId?: string };

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const provider = getPaymentProvider();
  const session = await provider.createCreditCheckoutSession({
    userId: user.id,
    amount,
    currency: "USD",
    metadata: {
      giverId: user.id,
      ...(draftProblemId ? { draftProblemId } : {}),
      requiredAmount: String(amount),
    },
  });

  return NextResponse.json({ checkoutUrl: session.checkoutUrl });
}
