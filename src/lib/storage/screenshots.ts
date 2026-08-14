/**
 * Supabase Storage for giver problem screenshots (§13.2).
 *
 * Bucket `problem-screenshots` should be private. Recommended policies
 * (Supabase dashboard → Storage):
 *   - INSERT: authenticated users to `{user_id}/*`
 *   - SELECT: authenticated users on own `{user_id}/*` (owner preview)
 *
 * Cross-user viewing (solvers on OPEN bounties) uses server routes that
 * verify Problem.status and stream via SUPABASE_SERVICE_ROLE_KEY when set.
 */

export const PROBLEM_SCREENSHOTS_BUCKET = "problem-screenshots";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export function isAllowedScreenshotType(mime: string): boolean {
  return ALLOWED_TYPES.has(mime);
}

export function maxScreenshotBytes(): number {
  return MAX_BYTES;
}

/** Storage path: `{giverUserId}/{uuid}.{ext}` */
export function buildScreenshotStoragePath(
  giverUserId: string,
  fileName: string
): string {
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "png";
  const safeExt = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)
    ? ext === "jpg"
      ? "jpeg"
      : ext
    : "png";
  return `${giverUserId}/${crypto.randomUUID()}.${safeExt}`;
}
