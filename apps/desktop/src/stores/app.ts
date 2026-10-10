import { create } from "zustand";
import { ipc, IpcError } from "../lib/ipc";
import type { Account, Evidence, ProblemSummary, SubmissionSummary, UserInfo } from "../lib/types";

type Load = "idle" | "loading" | "ready" | "error";

type Phase = "booting" | "signed_out" | "signed_in";

type State = {
  phase: Phase;
  user: UserInfo | null;
  account: Account | null;
  /** Why the user is looking at the pairing screen (revoked/expired session). */
  signedOutReason: "session_ended" | null;
  connection: "online" | "offline" | "expired";

  problems: ProblemSummary[]; reviewCostUsd: number; problemsLoad: Load;
  selectedProblemId: string | null;
  submissions: SubmissionSummary[]; submissionsLoad: Load;
  selectedSubmissionId: string | null;
  evidence: Evidence | null; evidenceLoad: Load;
  busy: "running" | "accepting" | null;
  notice: { kind: "ok" | "error"; text: string } | null;

  boot: () => Promise<void>;
  paired: (user: UserInfo | null) => void;
  signOut: () => Promise<void>;
  loadProblems: () => Promise<void>;
  selectProblem: (id: string) => Promise<void>;
  selectSubmission: (id: string) => Promise<void>;
  runReview: () => Promise<void>;
  accept: () => Promise<void>;
  dismissNotice: () => void;
};

export const useApp = create<State>((set, get) => {
  /** Central error policy: expired session -> back to login; others -> notice. */
  const fail = (e: unknown) => {
    const err = e instanceof IpcError ? e : new IpcError("internal", "Unexpected error.");
    if (err.code === "unauthenticated") {
      // Revoked or renewal failed: the device must pair again.
      set({
        phase: "signed_out", user: null, account: null, connection: "expired", signedOutReason: "session_ended",
        problems: [], submissions: [], evidence: null, selectedProblemId: null, selectedSubmissionId: null,
      });
    } else {
      set({
        connection: err.code === "network" ? "offline" : get().connection,
        notice: { kind: "error", text: err.message },
      });
    }
    return err;
  };

  return {
    phase: "booting", user: null, account: null, signedOutReason: null, connection: "online",
    problems: [], reviewCostUsd: 0, problemsLoad: "idle", selectedProblemId: null,
    submissions: [], submissionsLoad: "idle", selectedSubmissionId: null,
    evidence: null, evidenceLoad: "idle", busy: null, notice: null,

    async boot() {
      try {
        const st = await ipc.restoreSession();
        if (st.state === "signed_in") {
          set({ phase: "signed_in", user: st.user, connection: "online" });
          void get().loadProblems();
          ipc.account().then((account) => set({ account })).catch(() => {});
        } else if (st.state === "offline") {
          set({ phase: "signed_out", connection: "offline" });
        } else {
          set({ phase: "signed_out", signedOutReason: st.reason });
        }
      } catch {
        set({ phase: "signed_out" });
      }
    },

    paired(user) {
      set({ phase: "signed_in", user, signedOutReason: null, connection: "online" });
      void get().loadProblems();
      ipc.account().then((account) => set({ account })).catch(() => {});
    },

    async signOut() {
      await ipc.signOut().catch(() => {});
      set({
        phase: "signed_out", user: null, account: null, problems: [], submissions: [], evidence: null,
        selectedProblemId: null, selectedSubmissionId: null, signedOutReason: null,
        problemsLoad: "idle", submissionsLoad: "idle", evidenceLoad: "idle",
      });
    },

    async loadProblems() {
      set({ problemsLoad: "loading" });
      try {
        const { problems, reviewCostUsd } = await ipc.problems();
        set({ problems, reviewCostUsd, problemsLoad: "ready", connection: "online" });
      } catch (e) { fail(e); set({ problemsLoad: "error" }); }
    },

    async selectProblem(id) {
      set({ selectedProblemId: id, selectedSubmissionId: null, evidence: null, submissions: [], submissionsLoad: "loading" });
      try {
        const { submissions } = await ipc.submissions(id);
        if (get().selectedProblemId !== id) return; // user moved on; drop stale response
        set({ submissions, submissionsLoad: "ready" });
      } catch (e) { fail(e); set({ submissionsLoad: "error" }); }
    },

    async selectSubmission(id) {
      set({ selectedSubmissionId: id, evidence: null, evidenceLoad: "loading" });
      try {
        const evidence = await ipc.evidence(id);
        if (get().selectedSubmissionId !== id) return;
        set({ evidence, evidenceLoad: "ready" });
      } catch (e) { fail(e); set({ evidenceLoad: "error" }); }
    },

    async runReview() {
      const { selectedSubmissionId: sid, selectedProblemId: pid } = get();
      if (!sid || !pid || get().busy) return;
      set({ busy: "running", notice: null });
      try {
        await ipc.runReview(sid);
        set({ notice: { kind: "ok", text: "Review finished." } });
      } catch (e) { fail(e); }
      set({ busy: null });
      await get().selectProblem(pid);
      await get().selectSubmission(sid);
      void get().loadProblems();
      ipc.account().then((account) => set({ account })).catch(() => {}); // refresh credit balance
    },

    async accept() {
      const { selectedSubmissionId: sid, selectedProblemId: pid } = get();
      if (!sid || !pid || get().busy) return;
      set({ busy: "accepting", notice: null });
      try {
        await ipc.accept(pid, sid);
        set({ notice: { kind: "ok", text: "Accepted. Escrow released and source access granted." } });
      } catch (e) { fail(e); }
      set({ busy: null });
      await get().selectProblem(pid);
      await get().selectSubmission(sid);
      void get().loadProblems();
    },

    dismissNotice: () => set({ notice: null }),
  };
});
