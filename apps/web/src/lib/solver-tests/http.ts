/**
 * Reads a JSON request body for the money-spending Solver test routes. Insists
 * on a JSON content type: a plain cross-site HTML form can't send one, which
 * closes the easiest way for another site to make a signed-in Solver's browser
 * start a paid run.
 */
export async function readJsonBody(req: Request): Promise<{ ok: boolean; body: unknown }> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) return { ok: false, body: null };
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, body: null };
  }
}
