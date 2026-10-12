import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The look of the Solver test panel, with no data fetching, so every state can
 * be rendered and checked on its own (solver-test-view.test.ts). The container
 * that talks to /api/solver-tests/* is solver-test-panel.tsx.
 *
 * Everything shown here is the Solver's OWN data (their findings, their
 * program's output). It is never rendered anywhere a Giver can see.
 */

export type PanelFinding = {
  code: string;
  severity: "error" | "warning" | "info";
  title: string;
  message: string;
  fix: string;
  docsUrl: string;
};

export type PanelPlan = {
  ok: boolean;
  mode: "tests" | "entry" | null;
  entrypoint: string | null;
  addPytest: boolean;
  install: boolean;
  findings: PanelFinding[];
};

export type PanelQuote = {
  costUsd: number;
  free: boolean;
  freeBountiesRemaining: number;
  creditUsd: number;
  earningsUsd: number;
  canAfford: boolean;
  shortfallUsd: number;
};

export type PanelRun = {
  runId: string;
  status: "RUNNING" | "PASSED" | "FAILED" | "ERROR";
  free: boolean;
  commitSha: string;
  exitCode: number | null;
  output: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  docsUrl: string | null;
  refunded: boolean;
};

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type PanelState = {
  phase: "idle" | "checking" | "checked" | "starting" | "running" | "done";
  commitSha?: string;
  plan?: PanelPlan;
  quote?: PanelQuote;
  run?: PanelRun;
  /** Something went wrong asking the server. Shown above the controls. */
  error?: { message: string; link?: { href: string; label: string } };
};

export const SOLVER_FUNDS_HREF = "/dashboard/solver/funds";

export const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "");

export const usd = (n: number) => `$${n.toFixed(2)}`;

/** "your tests" or "your entry file main.py": what the run will do, in the Solver's words. */
export function describePlan(plan: PanelPlan): string {
  if (plan.mode === "tests") return plan.addPytest ? "your tests, with pytest" : "your tests";
  if (plan.mode === "entry") return plan.entrypoint ? `your entry file ${plan.entrypoint}` : "your entry file";
  return "nothing yet";
}

export function runButtonLabel(quote: PanelQuote | undefined): string {
  if (!quote) return "Run test";
  return quote.free ? "Run test (free)" : `Run test (${usd(quote.costUsd)})`;
}

/** The run button is usable only for a runnable plan the Solver can pay for. */
export function canRunNow(state: PanelState): boolean {
  return state.phase === "checked" && !!state.plan?.ok && !!state.quote?.canAfford;
}

function Dot({ tone }: { tone: "success" | "danger" | "muted" }) {
  const cls = tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-foreground-muted";
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${cls}`} aria-hidden />;
}

function Findings({ findings }: { findings: PanelFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {findings.map((f, i) => (
        <li key={`${f.code}-${i}`} className="flex gap-2.5">
          <span className="mt-1.5">
            <Dot tone={f.severity === "error" ? "danger" : "muted"} />
          </span>
          <div className="min-w-0">
            <p className={`text-sm ${f.severity === "error" ? "text-danger font-medium" : "text-foreground font-medium"}`}>{f.title}</p>
            <p className="text-xs text-foreground-muted leading-relaxed mt-0.5">{f.message}</p>
            <p className="text-xs text-foreground leading-relaxed mt-1">
              <span className="text-foreground-muted">How to fix: </span>
              {f.fix}{" "}
              <Link href={f.docsUrl} target="_blank" className="underline text-foreground-muted hover:text-foreground">
                Learn more
              </Link>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RunResult({ run, onReset }: { run: PanelRun; onReset: () => void }) {
  const passed = run.status === "PASSED";
  const errored = run.status === "ERROR";
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2.5">
        <Dot tone={passed ? "success" : errored ? "muted" : "danger"} />
        <p className="text-sm font-medium text-foreground">
          {passed ? "Passed" : errored ? "Couldn't run" : "Failed"}
        </p>
        <span className="text-xs font-mono text-foreground-muted">commit {shortSha(run.commitSha)}</span>
        {run.exitCode !== null && <span className="text-xs font-mono text-foreground-muted">exit {run.exitCode}</span>}
      </div>

      {passed && (
        <p className="text-xs text-foreground-muted leading-relaxed">
          This exact commit passed. Submit while your repo is still at this commit and your submission is marked Passed. If you push again first, it shows as Untested.
        </p>
      )}

      {!passed && run.errorMessage && <p className="text-sm text-foreground leading-relaxed">{run.errorMessage}</p>}

      {(errored || run.refunded) && (
        <p className="text-xs text-foreground-muted flex items-center gap-1.5">
          <Dot tone="success" /> You were not charged, and this didn&apos;t use your free test.
        </p>
      )}

      {run.docsUrl && !passed && (
        <Link href={run.docsUrl} target="_blank" className="text-xs underline text-foreground-muted hover:text-foreground w-fit">
          How to fix this
        </Link>
      )}

      {run.output && (
        <details className="group" open={!passed}>
          <summary className="text-xs text-foreground-muted cursor-pointer hover:text-foreground transition-colors">Output</summary>
          <pre className="mt-2 text-xs font-mono text-foreground bg-surface-raised rounded-md p-4 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto border border-border">
            {run.output}
          </pre>
        </details>
      )}

      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onReset}>
        {passed ? "Check again" : errored ? "Try again" : "Check again after fixing"}
      </Button>
    </div>
  );
}

export function SolverTestView({
  repoSelected,
  state,
  onCheck,
  onRun,
  onReset,
}: {
  repoSelected: boolean;
  state: PanelState;
  onCheck: () => void;
  onRun: () => void;
  onReset: () => void;
}) {
  const { phase, plan, quote, run, commitSha, error } = state;

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-5 flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Test your solution</p>
        <p className="text-xs text-foreground-muted leading-relaxed mt-1">
          Run your repo in a clean sandbox before you submit, and find problems before a Giver does. Checking is always free; you pay only if you run it.{" "}
          <Link href="/docs/sandbox" target="_blank" className="underline hover:text-foreground">
            How tests work
          </Link>
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger" role="alert">
          {error.message}
          {error.link && (
            <>
              {" "}
              <Link href={error.link.href} className="underline hover:opacity-80">
                {error.link.label}
              </Link>
            </>
          )}
        </div>
      )}

      {!repoSelected && <p className="text-xs text-foreground-muted">Choose a repository above to check and test it.</p>}

      {repoSelected && phase === "idle" && (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onCheck}>
          Check my repo (free)
        </Button>
      )}

      {repoSelected && phase === "checking" && <p className="text-xs text-foreground-muted">Checking your repository…</p>}

      {repoSelected && (phase === "checked" || phase === "starting") && plan && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
            <span className="font-mono">commit {shortSha(commitSha)}</span>
            <span>
              Will run: <span className="text-foreground">{describePlan(plan)}</span>
            </span>
          </div>

          <Findings findings={plan.findings} />

          {quote && (
            <p className="text-xs text-foreground-muted">
              {quote.free
                ? "This test is free."
                : `This test costs ${usd(quote.costUsd)}, taken from your deposited credit first, then your earnings.`}
              {!quote.canAfford && (
                <>
                  {" "}
                  You need {usd(quote.shortfallUsd)} more.{" "}
                  <Link href={SOLVER_FUNDS_HREF} className="underline text-foreground hover:opacity-80">
                    Add funds
                  </Link>
                </>
              )}
            </p>
          )}

          {!plan.ok && <p className="text-xs text-foreground-muted">Fix the problems above, push your changes, then check again.</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={!canRunNow(state) || phase === "starting"} onClick={onRun}>
              {phase === "starting" ? "Starting…" : runButtonLabel(quote)}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={phase === "starting"} onClick={onReset}>
              Check again
            </Button>
          </div>
        </div>
      )}

      {repoSelected && phase === "running" && (
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <div className="flex items-center gap-2.5">
            <Dot tone="muted" />
            <p className="text-sm text-foreground">Running your test…</p>
            <span className="text-xs font-mono text-foreground-muted">commit {shortSha(commitSha)}</span>
          </div>
          <p className="text-xs text-foreground-muted">This can take up to a couple of minutes. Keep this page open to see the result.</p>
        </div>
      )}

      {repoSelected && phase === "done" && run && <RunResult run={run} onReset={onReset} />}
    </div>
  );
}
