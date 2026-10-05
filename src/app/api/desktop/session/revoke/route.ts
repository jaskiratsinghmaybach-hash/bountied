import { getDesktopAuth, unauthorized } from "@/lib/desktop/auth";
import { json } from "@/lib/desktop/http";
import { revokeSession } from "@/lib/desktop/pairing";

/** The Desktop app signing itself out. */
export async function POST(req: Request) {
  const auth = await getDesktopAuth(req);
  if (!auth) return unauthorized();
  await revokeSession(auth.sessionId, auth.user.id, "signed_out_on_device");
  return json({ ok: true });
}
