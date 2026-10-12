"use client";

import { useEffect, useRef, useState } from "react";
import { SolverTestView, SOLVER_FUNDS_HREF, usd } from "./solver-test-view";
import type { PanelPlan, PanelQuote, PanelRun, PanelState } from "./solver-test-view";

const POLL_EVERY_MS = 2_000;
// A run takes up to ~2.5 minutes. Past this the server has already given up on it
// (stale runs are refunded), so stop asking and say so.
const GIVE_UP_AFTER_MS = 12 * 60 * 1000;
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

type ApiReply = { status: number; body: Record<string, unknown> };

async function callApi(url: string, init?: RequestInit): Promise<ApiReply> {
  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  } catch {
    return { status: 0, body: { error: "Could not reach the server. Check your connection and try again." } };
  }
}

const postJson = (url: string, data: unknown) =>
  callApi(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

const message = (body: Record<string, unknown>, fallback: string) => (typeof body.error === "string" ? body.error : fallback);

/**
 * Lets a Solver check (free) and run a sandbox test of the selected repo before
 * submitting. Talks only to /api/solver-tests/*; the server decides who the
 * Solver is, what runtime to use and what to charge, so nothing here is trusted.
 * The look lives in solver-test-view.tsx.
 *
 * Every button is type="button": this panel sits inside the submission <form>.
 */
export function SolverTestPanel({ problemId, repoUrl }: { problemId: string; repoUrl: string | null }) {
  const [state, setState] = useState<PanelState>({ phase: "idle" });
  const runId = state.run?.runId;

  // A different repo means a different test: drop whatever we knew about the last one.
  const lastRepo = useRef(repoUrl);
  useEffect(() => {
    if (lastRepo.current !== repoUrl) {
      lastRepo.current = repoUrl;
      setState({ phase: "idle" });
    }
  }, [repoUrl]);

  // Poll the run until it finishes.
  useEffect(() => {
    if (state.phase !== "running" || !runId) return;
    let cancelled = false;
    let failures = 0;
    const startedAt = Date.now();

    async function tick() {
      const r = await callApi(`/api/solver-tests/${runId}`, { cache: "no-store" });
      if (cancelled) return;

      if (r.status !== 200) {
        failures += 1;
        if (r.status === 404 || failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          setState((s) => ({
            ...s,
            phase: "idle",
            run: undefined,
            error: { message: "We lost track of this test. If it was charged, it is refunded automatically. Check again to start over." },
          }));
        }
        return;
      }
      failures = 0;

      const b = r.body as unknown as PanelRun;
      if (b.status !== "RUNNING") {
        setState((s) => ({ ...s, phase: "done", run: b, error: undefined }));
        return;
      }
      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        setState((s) => ({
          ...s,
          phase: "idle",
          run: undefined,
          error: { message: "This test is taking far longer than expected. It will be stopped and refunded automatically. Check again in a few minutes." },
        }));
      }
    }

    void tick();
    const id = setInterval(() => void tick(), POLL_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state.phase, runId]);

  async function onCheck() {
    if (!repoUrl) return;
    setState({ phase: "checking" });
    const r = await postJson("/api/solver-tests/preflight", { problemId, repoUrl });

    if (r.status === 200) {
      setState({
        phase: "checked",
        commitSha: r.body.commitSha as string,
        plan: r.body.plan as PanelPlan,
        quote: r.body.quote as PanelQuote,
      });
      return;
    }
    setState({
      phase: "idle",
      error: {
        message: message(r.body, "Could not check your repository."),
        link: r.body.code === "GITHUB_NOT_CONNECTED" ? { href: "/integrations", label: "Go to Integrations" } : undefined,
      },
    });
  }

  async function onRun() {
    if (!repoUrl || state.phase !== "checked") return;
    const before = state;
    setState({ ...before, phase: "starting", error: undefined });

    const r = await postJson("/api/solver-tests/run", { problemId, repoUrl, expectedCommitSha: before.commitSha });

    if (r.status === 202) {
      setState({
        phase: "running",
        commitSha: r.body.commitSha as string,
        plan: before.plan,
        quote: before.quote,
        run: {
          runId: r.body.runId as string,
          status: "RUNNING",
          free: !!r.body.free,
          commitSha: r.body.commitSha as string,
          exitCode: null,
          output: null,
          errorCode: null,
          errorMessage: null,
          docsUrl: null,
          refunded: false,
        },
      });
      return;
    }

    const code = r.body.code;
    if (code === "COMMIT_CHANGED") {
      setState({ phase: "idle", error: { message: message(r.body, "Your repository changed. Check again.") } });
    } else if (code === "PLAN_NOT_RUNNABLE") {
      setState({ ...before, phase: "checked", plan: (r.body.plan as PanelPlan) ?? before.plan, error: { message: message(r.body, "Fix the problems first.") } });
    } else if (code === "INSUFFICIENT_FUNDS") {
      const need = typeof r.body.requiredUsd === "number" ? usd(r.body.requiredUsd) : "more";
      setState({
        ...before,
        phase: "checked",
        quote: before.quote ? { ...before.quote, canAfford: false } : before.quote,
        error: { message: `You don't have enough funds for this test (it needs ${need}).`, link: { href: SOLVER_FUNDS_HREF, label: "Add funds" } },
      });
    } else {
      setState({ ...before, phase: "checked", error: { message: message(r.body, "Could not start the test. Try again.") } });
    }
  }

  return (
    <SolverTestView
      repoSelected={!!repoUrl}
      state={state}
      onCheck={() => void onCheck()}
      onRun={() => void onRun()}
      onReset={() => setState({ phase: "idle" })}
    />
  );
}
