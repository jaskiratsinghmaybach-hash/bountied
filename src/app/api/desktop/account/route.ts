import { NextResponse } from "next/server";
import { getDesktopUser, unauthorized } from "@/lib/desktop/auth";

export async function GET(req: Request) {
  const user = await getDesktopUser(req);
  if (!user) return unauthorized();
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    creditBalance: user.creditBalance.toNumber(),
  });
}
