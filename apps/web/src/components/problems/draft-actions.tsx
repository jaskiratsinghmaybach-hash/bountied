"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteProblem } from "@/lib/problems/create-actions";

export function DraftActions({ problemId }: { problemId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm("Delete this draft bounty? This can't be undone.")) return;

    startTransition(async () => {
      const result = await deleteProblem(problemId);
      if ("error" in result) {
        setErrorMessage(result.error);
        return;
      }
      router.push("/dashboard/giver/problems");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/giver/problems/${problemId}/edit`}
          className="rounded-md p-1.5 text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
          aria-label="Edit draft"
        >
          <Pencil size={16} />
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-md p-1.5 text-foreground-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-60"
          aria-label="Delete draft"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {errorMessage && <p className="text-xs text-danger">{errorMessage}</p>}
    </div>
  );
}
