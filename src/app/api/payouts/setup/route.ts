import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
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
  const { legalName, country, fields } = body as {
    legalName: string;
    country: string;
    fields: Record<string, string>;
  };

  if (!legalName?.trim() || !country || !fields) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const provider = getPaymentProvider();
  const result = await provider.createPayoutMethod({
    userId: user.id,
    bankDetails: { legalName, country, fields },
  });

  if (result.status === "failed") {
    return NextResponse.json(
      { error: "Verification failed", fieldErrors: result.fieldErrors },
      { status: 422 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      legalName,
      whopPayoutMethodId: result.payoutMethodId,
      bankVerified: true,
    },
  });

  return NextResponse.json({ ok: true });
}
