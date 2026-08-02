import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { legalName, bankCountry, bankAccountNumber, bankIfscOrSwift } = body as {
    legalName: string;
    bankCountry: string;
    bankAccountNumber: string;
    bankIfscOrSwift: string;
  };

  if (!legalName?.trim() || !bankCountry || !bankAccountNumber || !bankIfscOrSwift) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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

  return NextResponse.json({ ok: true });
}
