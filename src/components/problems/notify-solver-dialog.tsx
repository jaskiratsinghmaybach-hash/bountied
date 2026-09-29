"use client";

import { useState } from "react";
import { sendSubmissionNotification } from "@/lib/notifications/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * "Notify solver" — a Giver sending the solver on this submission a
 * one-way message (product decision 2026-09-29). No reply action exists
 * anywhere in this UI; this is deliberately not a chat. See
 * lib/notifications/actions.ts's sendSubmissionNotification for why.
 *
 * The textarea always opens blank (product decision 2026-09-29, revised
 * same day) — an earlier version pre-filled a suggested message for
 * solver-caused failures via buildSuggestedNotification
 * (lib/problems/submission-failure.ts), which is still exported there but
 * no longer called from here. classifySubmissionFailure's summary is
 * still shown separately on the submission card itself
 * (giver-submission-card.tsx) — only the pre-filled draft in this dialog
 * was removed.
 */
export function NotifySolverDialog({
  submissionId,
  solverName,
}: {
  submissionId: string;
  solverName: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleOpen() {
    setBody("");
    setError(null);
    setSent(false);
    setOpen(true);
  }

  async function handleSend() {
    setSending(true);
    setError(null);

    const formData = new FormData();
    formData.set("body", body);

    const result = await sendSubmissionNotification(submissionId, formData);

    setSending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSent(true);
    setTimeout(() => setOpen(false), 900);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors"
      >
        Notify solver
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Message {solverName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-foreground-muted">
              This sends a one-time notification to the solver — they can&apos;t
              reply through Bountied. Review or edit the message before sending.
            </p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="Write a message to the solver…"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors resize-none"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            {sent && <p className="text-xs text-emerald-500">Sent.</p>}
          </div>

          <DialogFooter className="mt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || sent || !body.trim()}
              className="rounded-md bg-primary text-background font-medium px-4 py-2 text-sm hover:bg-primary/80 transition-colors disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
