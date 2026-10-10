import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PROBLEM_SCREENSHOTS_BUCKET,
  buildScreenshotStoragePath,
  isAllowedScreenshotType,
  maxScreenshotBytes,
} from "@/lib/storage/screenshots";

/**
 * Authenticated giver upload → private Supabase Storage bucket.
 * Returns the storage object path (stored in Problem.screenshotUrls).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  if (!isAllowedScreenshotType(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, GIF, and WebP images are allowed." },
      { status: 400 }
    );
  }

  if (file.size > maxScreenshotBytes()) {
    return NextResponse.json(
      { error: "Image must be 5 MB or smaller." },
      { status: 400 }
    );
  }

  const storagePath = buildScreenshotStoragePath(user.id, file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const admin = createAdminClient();
  const storageClient = admin ?? supabase;

  const { error: uploadError } = await storageClient.storage
    .from(PROBLEM_SCREENSHOTS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        error:
          uploadError.message.includes("Bucket not found")
            ? "Screenshot storage is not configured yet. Create the problem-screenshots bucket in Supabase."
            : uploadError.message,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ path: storagePath });
}
