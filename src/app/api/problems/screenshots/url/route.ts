import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/db";
import { PROBLEM_SCREENSHOTS_BUCKET } from "@/lib/storage/screenshots";

const VIEWABLE_STATUSES = new Set(["OPEN", "IN_REVIEW", "COMPLETED"]);

/**
 * Returns a short-lived signed URL for a screenshot path.
 * DRAFT problems: giver owner only. OPEN+ problems: any authenticated user
 * when problemId is supplied and the path is attached to that problem.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path")?.trim();
  const problemId = searchParams.get("problemId")?.trim();

  if (!path) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  if (path.includes("..")) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  let allowed = path.startsWith(`${user.id}/`);

  if (!allowed && problemId) {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        giverId: true,
        status: true,
        // @ts-ignore
        screenshotUrls: true,
      },
    });

    if (
      problem &&
      // @ts-ignore
      problem.screenshotUrls.includes(path) &&
      (problem.giverId === user.id || VIEWABLE_STATUSES.has(problem.status))
    ) {
      allowed = true;
    }
  }

  if (!allowed) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const admin = createAdminClient();
  const storageClient = admin ?? supabase;

  const { data, error } = await storageClient.storage
    .from(PROBLEM_SCREENSHOTS_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Could not generate URL." },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
