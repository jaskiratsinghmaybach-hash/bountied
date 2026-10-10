import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, FolderGit2, Inbox, Loader2, Lock, LogOut, Play, RefreshCw, ShieldCheck, Unlock, Wifi, WifiOff,
} from "lucide-react";
import { useApp } from "../stores/app";
import { Badge, Empty, LogViewer, Panel, Skeleton, StatusBadge } from "./ui";
import { ipc } from "../lib/ipc";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const money = (n: number | null, c: string) => (n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n));

function ProblemList() {
  const { problems, problemsLoad, selectedProblemId, selectProblem, loadProblems } = useApp();
  return (
    <Panel title="Bounties" className="w-64 shrink-0 border-r border-line"
      actions={<button aria-label="Refresh bounties" title="Refresh (Ctrl+R)" onClick={() => void loadProblems()}
        className="rounded p-1 text-muted hover:bg-raised hover:text-fg"><RefreshCw size={13} /></button>}>
      {problemsLoad === "loading" && problems.length === 0 ? <Skeleton /> :
       problemsLoad === "error" ? <Empty icon={<AlertTriangle />} title="Couldn't load bounties" hint="Check your connection and refresh." /> :
       problems.length === 0 ? <Empty icon={<Inbox />} title="No bounties yet" hint="Bounties you post appear here once published." /> :
       <ul role="listbox" aria-label="Bounties">
        {problems.map((p) => (
          <li key={p.id} role="option" aria-selected={p.id === selectedProblemId}>
            <button onClick={() => void selectProblem(p.id)}
              className={`block w-full border-b border-line/60 px-3 py-2 text-left transition-colors hover:bg-raised ${p.id === selectedProblemId ? "bg-raised" : ""}`}>
              <div className="truncate font-medium">{p.title}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <StatusBadge status={p.status} />
                <span>{money(p.bountyAmount, p.currency)}</span>
                <span className="ml-auto">{p.submissionCount} sub</span>
              </div>
            </button>
          </li>))}
       </ul>}
    </Panel>
  );
}

function SubmissionList() {
  const { selectedProblemId, submissions, submissionsLoad, selectedSubmissionId, selectSubmission } = useApp();
  return (
    <Panel title="Submissions" className="w-72 shrink-0 border-r border-line">
      {!selectedProblemId ? <Empty icon={<FolderGit2 />} title="Select a bounty" /> :
       submissionsLoad === "loading" ? <Skeleton rows={3} /> :
       submissionsLoad === "error" ? <Empty icon={<AlertTriangle />} title="Couldn't load submissions" /> :
       submissions.length === 0 ? <Empty icon={<Inbox />} title="No submissions yet" hint="Solver attempts will show up here." /> :
       <ul role="listbox" aria-label="Submissions">
        {submissions.map((s) => (
          <li key={s.id} role="option" aria-selected={s.id === selectedSubmissionId}>
            <button onClick={() => void selectSubmission(s.id)}
              className={`block w-full border-b border-line/60 px-3 py-2 text-left transition-colors hover:bg-raised ${s.id === selectedSubmissionId ? "bg-raised" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{s.solverName}</span>
                <span className="text-[11px] text-muted">#{s.attemptNumber}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <StatusBadge status={s.status} />
                <span>{fmt(s.submittedAt)}</span>
              </div>
            </button>
          </li>))}
       </ul>}
    </Panel>
  );
}

function Confirm({ title, body, confirmLabel, danger, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cf-t" onMouseDown={(e) => e.stopPropagation()}
        className="w-96 rounded-lg border border-line bg-panel p-4 shadow-xl">
        <h3 id="cf-t" className="mb-1 text-sm font-semibold">{title}</h3>
        <p className="mb-4 text-xs leading-5 text-muted">{body}</p>
        <div className="flex justify-end gap-2">
          <button autoFocus onClick={onCancel} className="rounded border border-line px-3 py-1.5 hover:bg-raised">Cancel</button>
          <button onClick={onConfirm}
            className={`rounded px-3 py-1.5 font-medium text-bg ${danger ? "bg-warn" : "bg-accent"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ReviewPane() {
  const s = useApp();
  const sub = s.submissions.find((x) => x.id === s.selectedSubmissionId);
  const problem = s.problems.find((p) => p.id === s.selectedProblemId);
  const [dialog, setDialog] = useState<"run" | "accept" | null>(null);

  if (!sub || !problem) return <Panel title="Review" className="min-w-0 flex-1"><Empty icon={<ShieldCheck />} title="Select a submission to review" hint="Evidence from the sandbox appears here. Source stays locked until you accept." /></Panel>;

  const canRun = sub.status === "AWAITING_REVIEW" && problem.status !== "COMPLETED";
  const canAccept = sub.status === "UNDER_REVIEW" && problem.status !== "COMPLETED";
  const free = problem.freeReviewsRemaining > 0;
  const cost = s.reviewCostUsd.toFixed(2);

  return (
    <Panel title="Review" className="min-w-0 flex-1"
      actions={<>
        <button disabled={!canRun || !!s.busy} onClick={() => setDialog("run")}
          className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs hover:bg-raised disabled:opacity-40">
          {s.busy === "running" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run review
        </button>
        <button disabled={!canAccept || !!s.busy} onClick={() => setDialog("accept")}
          className="flex items-center gap-1 rounded bg-ok px-2 py-1 text-xs font-medium text-bg disabled:opacity-40">
          {s.busy === "accepting" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Accept &amp; release
        </button>
      </>}>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{sub.solverName}</h3>
          <StatusBadge status={sub.status} />
          <Badge>Attempt {sub.attemptNumber}</Badge>
          <Badge>{problem.runtime === "PYTHON" ? "Python" : "Node"}</Badge>
          {sub.isRevealed
            ? <Badge tone="ok"><Unlock size={11} /> Source released</Badge>
            : <Badge tone="warn"><Lock size={11} /> Source locked until release</Badge>}
        </div>

        {s.notice && (
          <div role="status" className={`flex items-start justify-between rounded border p-2 text-xs ${s.notice.kind === "ok" ? "border-ok/30 bg-ok/10 text-ok" : "border-bad/30 bg-bad/10 text-bad"}`}>
            <span>{s.notice.text}</span>
            <button onClick={s.dismissNotice} className="ml-3 opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
          </div>)}

        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Solver writeup</h4>
          <p className="selectable whitespace-pre-wrap text-xs leading-5">{sub.writeup || "—"}</p>
        </div>

        <div>
          <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Sandbox evidence
            {s.evidence?.exitCode != null && <Badge tone={s.evidence.exitCode === 0 ? "ok" : "bad"}>exit {s.evidence.exitCode}</Badge>}
            {s.evidence?.ranAt && <span className="font-normal normal-case tracking-normal">{fmt(s.evidence.ranAt)}</span>}
          </h4>
          <div className="min-h-24 rounded border border-line bg-bg">
            {s.evidenceLoad === "loading" ? <Skeleton rows={3} /> :
             s.evidence?.error ? <p role="alert" className="selectable p-3 text-xs text-bad">{s.evidence.error}</p> :
             s.evidence?.output ? <LogViewer text={s.evidence.output} /> :
             sub.status === "RUNNING" ? <Empty icon={<Loader2 className="animate-spin" />} title="Review running…" /> :
             <Empty icon={<Play />} title="No evidence yet" hint={canRun ? "Run a review to execute this submission in an isolated sandbox." : undefined} />}
          </div>
          <p className="mt-1 text-[11px] text-muted">Output is produced by the solver's own program and is shown as plain text, size-limited.</p>
        </div>

        {sub.isRevealed && (
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Repository</h4>
            <p className="selectable break-all font-mono text-xs">{sub.platformRepoUrl ?? sub.repoUrl}</p>
          </div>)}
      </div>

      {dialog === "run" && <Confirm title="Run sandbox review?" confirmLabel="Run review"
        body={free ? `This uses one of the ${problem.freeReviewsRemaining} free review(s) left on this bounty.` : `This will charge $${cost} from your credit balance.`}
        onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); void s.runReview(); }} />}
      {dialog === "accept" && <Confirm danger title="Accept and release payment?" confirmLabel="Accept & release"
        body="This releases the bounty to the solver, rejects every other submission on this bounty, and grants you access to this repository. It cannot be undone."
        onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); void s.accept(); }} />}
    </Panel>
  );
}

function StatusBar() {
  const { account, user, connection, signOut } = useApp();
  const [version, setVersion] = useState("");
  useEffect(() => { ipc.version().then(setVersion).catch(() => {}); }, []);
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-[11px] text-muted">
      <span className={`flex items-center gap-1 ${connection === "online" ? "text-ok" : "text-warn"}`}>
        {connection === "online" ? <Wifi size={12} /> : <WifiOff size={12} />}
        {connection === "online" ? "Connected" : connection === "offline" ? "Offline" : "Session expired"}
      </span>
      <span className="flex items-center gap-1"><ShieldCheck size={12} /> Sandbox isolated · source locked pre-release</span>
      <span className="ml-auto">{user?.name ?? account?.name}{account ? ` · ${money(account.creditBalance, "USD")} credit` : ""}</span>
      <button onClick={() => void signOut()} className="flex items-center gap-1 hover:text-fg" title="Disconnect this device"><LogOut size={12} /> Disconnect</button>
      <span>v{version}</span>
    </footer>
  );
}

export function Workspace() {
  const loadProblems = useApp((s) => s.loadProblems);
  useEffect(() => {
    void loadProblems();
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") { e.preventDefault(); void loadProblems(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loadProblems]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1"><ProblemList /><SubmissionList /><ReviewPane /></div>
      <StatusBar />
    </div>
  );
}
