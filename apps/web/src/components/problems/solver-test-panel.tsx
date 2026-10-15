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
export function SolverTestPanel({ problemId, repoUrl, selectedCommitSha, onCommitResolved }: { problemId: string; repoUrl: string | null; selectedCommitSha: string | null; onCommitResolved: (sha: string) => void }) {
  const [state, setState] = useState<PanelState>({ phase: "idle" });
  const runId = state.run?.runId;
  const selectedRef = useRef(selectedCommitSha);
  const lastRepo = useRef(repoUrl);
  // Keep each commit's full UI state while the user browses other commits.
  // The database remains authoritative across refreshes; this map prevents a
  // commit switch from discarding the result already fetched in this session.
  const commitStates = useRef(new Map<string, PanelState>());
  const cacheKey = (repo: string, sha: string) => `${repo.trim().toLowerCase()}::${sha.toLowerCase()}`;

  useEffect(() => {
    const repoChanged = lastRepo.current !== repoUrl;

    // Save the outgoing commit before restoring the newly selected one. Do not
    // save an old repo's state under the newly selected repository's key.
    if (!repoChanged && repoUrl && state.commitSha) {
      commitStates.current.set(cacheKey(repoUrl, state.commitSha), state);
    }

    if (repoChanged || selectedRef.current !== selectedCommitSha) {
      lastRepo.current = repoUrl;
      selectedRef.current = selectedCommitSha;
      const cached = !repoChanged && repoUrl && selectedCommitSha
        ? commitStates.current.get(cacheKey(repoUrl, selectedCommitSha))
        : undefined;
      setState(cached ?? { phase: "idle" });
    }
  }, [repoUrl, selectedCommitSha, state]);

  // Restore the latest persisted run for the exact selected commit after a page
  // refresh or commit switch. The server/database is authoritative; this is not
  // merely a per-mount React cache.
  const historyRequest = useRef(0);
  useEffect(() => {
    if (!repoUrl || !selectedCommitSha || !/^[0-9a-f]{40}$/i.test(selectedCommitSha)) return;
    const requestId = ++historyRequest.current;
    const params = new URLSearchParams({ problemId, repoUrl, commitSha: selectedCommitSha });

    void (async () => {
      const reply = await callApi(`/api/solver-tests/history?${params.toString()}`, { cache: "no-store" });
      if (requestId !== historyRequest.current || reply.status !== 200 || reply.body.found !== true) return;
      const rawRun = reply.body.run as PanelRun | undefined;
      if (!rawRun || rawRun.commitSha?.toLowerCase() !== selectedCommitSha.toLowerCase()) return;
      const restored: PanelState = {
        phase: rawRun.status === "RUNNING" ? "running" : "done",
        commitSha: rawRun.commitSha,
        run: rawRun,
      };
      setState((current) => {
        // A user may start/check a test while the history request is in flight.
        // Never let a slower history response overwrite that newer interaction.
        if (current.phase === "checking" || current.phase === "starting" || current.phase === "running") return current;
        return restored;
      });
    })();

    return () => {
      if (historyRequest.current === requestId) historyRequest.current += 1;
    };
  }, [problemId, repoUrl, selectedCommitSha]);

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
    const r = await postJson("/api/solver-tests/preflight", { problemId, repoUrl, ...(selectedCommitSha ? { commitSha: selectedCommitSha } : {}) });

    if (r.status === 200) {
      onCommitResolved(r.body.commitSha as string);
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

    const r = await postJson("/api/solver-tests/run", { problemId, repoUrl, commitSha: before.commitSha, expectedCommitSha: before.commitSha });

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
