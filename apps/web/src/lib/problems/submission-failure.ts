/**
 * Turns a failed submission's raw fields into something a Giver can
 * actually read, and decides whether a Giver-to-solver notification
 * suggestion makes sense for it (see components/problems/
 * notify-solver-dialog.tsx).
 *
 * There is no SubmissionStatus value that distinguishes these cases —
 * SANDBOX_FAILED alone covers three genuinely different situations: the
 * platform couldn't even mirror the solver's repo, a clone/infra problem,
 * or the solver's own program ran and exited non-zero. Adding a status
 * for each would touch the schema, the migration, every status-label map,
 * and the escrow/review gating logic for something that's really just a
 * display question. The distinguishing signal already exists in the data
 * without any of that: a run that actually executed the solver's command
 * always has sandboxExitCode set (even a crash produces an exit code);
 * a mirror/clone/infra failure never reaches that point, so
 * sandboxExitCode stays null and sandboxOutput is never written (see
 * lib/sandbox/execute.ts and lib/problems/submission-actions.ts's mirror
 * step for where each path sets these).
 *
 * Product decision 2026-09-29: only a solver-side failure (their program
 * ran and exited non-zero) gets a suggested notification message. A
 * platform-side failure (mirror/clone/infra) isn't the solver's fault to
 * fix, and there's nothing meaningful to suggest they do differently —
 * the Giver can still send a blank notification, just with no suggested
 * text to start from.
 */

export type SubmissionFailureInfo = {
  /** Short, Giver-readable summary — this replaces showing raw stderr/stack traces directly. */
  summary: string;
  /** Whether "Notify solver" should offer a suggested message for this failure. */
  suggestible: boolean;
};

type FailureFields = {
  status: string;
  sandboxError: string | null;
  sandboxOutput: string | null;
  sandboxExitCode: number | null;
};

export function classifySubmissionFailure(
  submission: FailureFields
): SubmissionFailureInfo | null {
  const isFailureStatus =
    submission.status === "SANDBOX_FAILED" ||
    submission.status === "DEPENDENCY_POLICY_VIOLATION" ||
    submission.status === "DEPENDENCY_INSTALL_FAILED";

  if (!isFailureStatus) return null;

  if (submission.status === "DEPENDENCY_POLICY_VIOLATION") {
    return {
      summary:
        "This submission's bountied.json uses a dependency this bounty doesn't allow.",
      suggestible: true,
    };
  }

  if (submission.status === "DEPENDENCY_INSTALL_FAILED") {
    return {
      summary:
        "The sandbox couldn't install this submission's dependencies (see bountied.json).",
      suggestible: true,
    };
  }

  // SANDBOX_FAILED from here — split platform-side from solver-side using
  // the actual fields, not the status alone (see this module's top doc
  // comment for why).
  const ranAndExited = submission.sandboxExitCode !== null;

  if (ranAndExited) {
    // The solver's own command ran and exited non-zero. sandboxOutput has
    // the real stdout/stderr already rendered elsewhere on the page — this
    // summary is just the headline, not a replacement for that detail.
    return {
      summary: `This submission's code ran but exited with an error (exit code ${submission.sandboxExitCode}).`,
      suggestible: true,
    };
  }

  const rawError = submission.sandboxError ?? "";

  if (rawError.startsWith("Repository mirror failed:") || rawError.startsWith("Mirror failed:")) {
    return {
      summary:
        "Bountied couldn't access this submission's repository to prepare it for review.",
      suggestible: false,
    };
  }

  if (rawError.startsWith("Could not clone the repository")) {
    return {
      summary:
        "Bountied couldn't clone this submission's repository — the solver's GitHub access may be missing or the repo may be private without the right permissions.",
      suggestible: false,
    };
  }

  // Anything else (infra: timeout, connection drop, "no sandbox template
  // configured", etc.) — genuinely a platform-side problem, not the
  // solver's to fix.
  return {
    summary: "Bountied's sandbox couldn't run this submission (a platform-side issue).",
    suggestible: false,
  };
}

/**
 * Builds the DRAFT text for a Giver's "Notify solver" message — never
 * sent as-is without the Giver reviewing/editing it first (see
 * notify-solver-dialog.tsx: this only pre-fills a textarea). Only called
 * when classifySubmissionFailure says suggestible: true — a platform-side
 * failure has nothing solver-actionable to suggest, so callers should
 * show a blank textarea instead of calling this (product decision
 * 2026-09-29).
 *
 * Written in first person as something the GIVER is saying to the
 * SOLVER, not as a platform-voiced message — the Giver can send it
 * completely unedited, so it has to already sound like them talking to
 * the solver, not like a system notice.
 */
export function buildSuggestedNotification(
  submission: FailureFields,
  problemTitle: string
): string | null {
  const info = classifySubmissionFailure(submission);
  if (!info || !info.suggestible) return null;

  if (submission.status === "DEPENDENCY_POLICY_VIOLATION") {
    return (
      `Hey — your submission for "${problemTitle}" uses a dependency this bounty ` +
      `doesn't allow. Can you check bountied.json and remove it, or use an ` +
      `allowed alternative? Let me know once you've pushed a fix and I'll take ` +
      `another look.`
    );
  }

  if (submission.status === "DEPENDENCY_INSTALL_FAILED") {
    return (
      `Hey — the sandbox couldn't install the dependencies listed in your ` +
      `bountied.json for "${problemTitle}". Can you double-check the package ` +
      `names and versions there? Let me know once it's fixed and I'll re-run it.`
    );
  }

  // Solver's own command ran and exited non-zero.
  return (
    `Hey — I ran your submission for "${problemTitle}" and it exited with ` +
    `an error (exit code ${submission.sandboxExitCode}). Can you check the run ` +
    `command and make sure the entry file/command matches what the sandbox is ` +
    `using? Let me know once you've pushed a fix and I'll re-run it.`
  );
}
