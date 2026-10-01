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

export type NotifyAttempt = {
  submissionId: string;
  attemptNumber: number;
};

/**
 * "Notify solver" — a Giver sending ONE solver a one-way message that can
 * reference one or more of their submission attempts (product decision
 * 2026-09-30 — attempts from the same solver are grouped in the UI under
 * one card, so a single message should be able to say "this applies to
 * attempt 2 and 3" rather than forcing a separate send per attempt). No
 * reply action exists anywhere in this UI; this is deliberately not a
 * chat. See lib/notifications/actions.ts's sendSubmissionNotification for
 * why, and for the server-side check that every tagged attempt really
 * does belong to this one solver.
 *
 * Pre-selects only the newest attempt on open (product decision
 * 2026-09-30) — the common case is "a message about your latest try" —
 * but the Giver can freely add or remove attempts; at least one must
 * stay selected (Send is disabled otherwise), since a notification with
 * zero referenced attempts has nothing for the solver to click through
 * to.
 */
export function NotifySolverDialog({
  attempts,
  solverName,
}: {
  /** Every attempt from this one solver, in any order — newest is used for the default selection. */
  attempts: NotifyAttempt[];
  solverName: string;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const sortedByAttempt = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
  const newest = sortedByAttempt[sortedByAttempt.length - 1];

  function handleOpen() {
    setBody("");
    setError(null);
    setSent(false);
    setSelected(newest ? new Set([newest.submissionId]) : new Set());
    setOpen(true);
  }

  function toggleAttempt(submissionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) {
        // Never allow the last one to be deselected — a message has to
        // reference at least one attempt.
        if (next.size > 1) next.delete(submissionId);
      } else {
        next.add(submissionId);
      }
      return next;
    });
  }

  async function handleSend() {
    setSending(true);
    setError(null);

    const formData = new FormData();
    formData.set("body", body);

    const result = await sendSubmissionNotification(Array.from(selected), formData);

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

            {sortedByAttempt.length > 1 && (
              <div>
                <p className="text-xs text-foreground-muted uppercase tracking-wide mb-1.5">
                  Referencing
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sortedByAttempt.map((a) => {
                    const isSelected = selected.has(a.submissionId);
                    return (
                      <button
                        key={a.submissionId}
                        type="button"
                        onClick={() => toggleAttempt(a.submissionId)}
                        aria-pressed={isSelected}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground-muted hover:text-foreground"
                        }`}
                      >
                        Attempt {a.attemptNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
              disabled={sending || sent || !body.trim() || selected.size === 0}
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
