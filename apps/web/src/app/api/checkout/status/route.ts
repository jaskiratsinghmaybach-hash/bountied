import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

/**
 * The embedded Whop checkout's onComplete fires client-side the instant
 * the payment succeeds, but that event is NOT proof money moved — only
 * the webhook (server-to-server, signature-verified) is trusted to credit
 * User.creditBalance, see api/webhooks/whop/route.ts. onComplete is used
 * purely as a UI cue to start polling this endpoint until the balance
 * actually reflects the top-up.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { creditBalance: true },
  });

  return NextResponse.json({ creditBalance: Number(profile?.creditBalance ?? 0) });
}
