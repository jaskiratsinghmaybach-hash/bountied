import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { creditUserBalance, fundProblemFromCredits } from "@/lib/payments/credits";
import { CreditTransactionType } from "@prisma/client";

function verifyWhopSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.WHOP_WEBHOOK_SECRET) return false;

  const expected = createHmac("sha256", process.env.WHOP_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("whop-signature");

  if (!verifyWhopSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  if (event.type === "payment.succeeded") {
    const { giverId, draftProblemId, requiredAmount } = event.data?.metadata ?? {};

    if (!giverId || !requiredAmount) {
      return NextResponse.json({ error: "Missing metadata on event" }, { status: 400 });
    }

    await creditUserBalance({
      userId: giverId,
      amount: Number(requiredAmount),
      type: CreditTransactionType.PURCHASE,
      whopChargeRef: event.data?.id,
    });

    if (draftProblemId) {
      await fundProblemFromCredits({ problemId: draftProblemId, giverId });
    }
  }

  return NextResponse.json({ received: true });
}
