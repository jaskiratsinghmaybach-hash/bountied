export type ProblemSummary = {
  id: string; title: string; status: string; runtime: "PYTHON" | "NODE";
  language: string | null; currency: string; bountyAmount: number | null;
  deadline: string | null; updatedAt: string; submissionCount: number;
  freeReviewsRemaining: number;
};

export type SubmissionSummary = {
  id: string; status: string; attemptNumber: number; submittedAt: string;
  writeup: string; isRevealed: boolean; sandboxExitCode: number | null;
  sandboxRanAt: string | null; solverName: string;
  /** null until Submission.isRevealed (set only by escrow release). */
  repoUrl: string | null; platformRepoUrl: string | null;
};

export type Evidence = {
  status: string; isRevealed: boolean; exitCode: number | null;
  output: string | null; error: string | null; ranAt: string | null;
};

export type Account = {
  id: string; name: string; email: string; role: string | null; creditBalance: number;
};

export type UserInfo = { name: string; email: string };

export type AuthStatus = {
  state: "signed_out" | "signed_in" | "offline";
  user: UserInfo | null;
  /** Why a previous session was dropped (e.g. revoked on the website). */
  reason: "session_ended" | null;
};

export type PairingStarted = { expires_in_sec: number; device_name: string };

export type CommandError = { code: string; message: string };
