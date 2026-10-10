import { invoke } from "@tauri-apps/api/core";
import type {
  Account, AuthStatus, CommandError, Evidence, PairingStarted, ProblemSummary, SubmissionSummary,
} from "./types";

/**
 * The ONLY place the UI talks to the native layer. Each function maps to one
 * business command registered in src-tauri/src/lib.rs. The WebView makes no
 * network requests of its own and never sees a token.
 */
export class IpcError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const err = e as Partial<CommandError>;
    throw new IpcError(err?.code ?? "internal", err?.message ?? "Unexpected error.");
  }
}

export const ipc = {
  // device pairing / session
  restoreSession: () => call<AuthStatus>("restore_session"),
  beginPairing: () => call<PairingStarted>("begin_pairing"),
  reopenPairing: () => call<void>("reopen_pairing"),
  cancelPairing: () => call<void>("cancel_pairing"),
  completePairing: (code: string) => call<AuthStatus>("complete_pairing", { code }),
  signOut: () => call<void>("sign_out"),

  // giver review workspace
  account: () => call<Account>("get_account"),
  problems: () => call<{ problems: ProblemSummary[]; reviewCostUsd: number }>("get_my_problems"),
  submissions: (problemId: string) =>
    call<{ problemStatus: string; submissions: SubmissionSummary[] }>("get_submissions", { problemId }),
  evidence: (submissionId: string) => call<Evidence>("get_evidence", { submissionId }),
  runReview: (submissionId: string) => call<{ success: boolean; status: string }>("run_review", { submissionId }),
  accept: (problemId: string, submissionId: string) =>
    call<{ ok: boolean }>("accept_submission", { problemId, submissionId }),
  version: () => call<string>("get_app_version"),
};
