"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

type ScreenshotItem = {
  path: string;
  previewUrl: string;
};

type FieldScreenshotsProps = {
  value: string[];
  onChange: (paths: string[]) => void;
  problemId?: string | null;
};

export function FieldScreenshots({
  value,
  onChange,
  problemId,
}: FieldScreenshotsProps) {
  const [items, setItems] = useState<ScreenshotItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveUrl = useCallback(
    async (path: string) => {
      const params = new URLSearchParams({ path });
      if (problemId) params.set("problemId", problemId);
      const res = await fetch(`/api/problems/screenshots/url?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load image.");
      return data.url as string;
    },
    [problemId]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const resolved: ScreenshotItem[] = [];
      for (const path of value) {
        try {
          const previewUrl = await resolveUrl(path);
          if (!cancelled) resolved.push({ path, previewUrl });
        } catch {
          if (!cancelled) resolved.push({ path, previewUrl: "" });
        }
      }
      if (!cancelled) setItems(resolved);
    })();

    return () => {
      cancelled = true;
    };
  }, [value, resolveUrl]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploading(true);
    setError(null);

    const newPaths: string[] = [];

    try {
      for (const file of Array.from(fileList)) {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/problems/screenshots/upload", {
          method: "POST",
          body,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed.");
        newPaths.push(data.path as string);
      }
      onChange([...value, ...newPaths]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function remove(path: string) {
    onChange(value.filter((p) => p !== path));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-foreground-muted leading-relaxed">
        Optional screenshots — bug UI, error states, repro steps, etc.
      </p>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {items.map((item) => (
            <div
              key={item.path}
              className="relative h-24 w-24 rounded-md border border-border bg-surface-raised overflow-hidden"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt="Screenshot"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-[10px] text-foreground-muted px-1 text-center">
                  Preview unavailable
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(item.path)}
                className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 text-foreground-muted hover:text-danger"
                aria-label="Remove screenshot"
              >
                <X size={12} />
              </button>
              <input type="hidden" name="screenshotUrls" value={item.path} />
            </div>
          ))}
        </div>
      )}

      <label className="inline-flex items-center gap-2 w-fit cursor-pointer rounded-md border border-dashed border-border px-3 py-2 text-sm text-foreground-muted hover:border-foreground-muted hover:text-foreground transition-colors">
        {uploading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ImagePlus size={16} />
        )}
        {uploading ? "Uploading…" : "Add screenshots"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
