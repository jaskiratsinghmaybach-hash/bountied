import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl, resetTestDatabase } from "@/test/db";
import type { ExecutionResult } from "@/lib/sandbox/execute";

/**
 * The Giver's whole review flow against a real Postgres: claim and charge,
 * run, record, and (for a failure that wasn't the Solver's) refund and return
 * to the queue. Only the E2B sandbox is faked. Runs only when
 * TEST_DATABASE_URL points at a throwaway database (see src/test/db.ts).
 */
const url = getTestDatabaseUrl();

const sandbox = vi.hoisted(() => ({
  next: { ok: true, exitCode: 0, stdout: "3 passed", stderr: "" } as Record<string, unknown>,
  calls: 0,
}));
vi.mock("@/lib/sandbox/execute", () => ({
  executeSubmission: async () => {
    sandbox.calls += 1;
    return sandbox.next;
  },
}));

describe.skipIf(!url)("Giver review flow (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let review: typeof import("./start-review");

  beforeAll(async () => {
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);
    prisma = (await import("@/lib/db")).prisma;
    review = await import("./start-review");
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(() => {
    // A failed run logs its real reason on the server on purpose; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
    sandbox.calls = 0;
    sandbox.next = { ok: true, exitCode: 0, stdout: "3 passed", stderr: "" };
  });

  let seq = 0;
  const result = (r: Partial<ExecutionResult>) => {
    sandbox.next = r as Record<string, unknown>;
  };

  async function setup(opts: { credit?: string; freeUsed?: number; runtime?: "PYTHON" | "NODE" } = {}) {
    seq += 1;
    const giver = await prisma.user.create({
      data: { id: `g${seq}`, email: `g${seq}@test.dev`, name: "Giver", creditBalance: opts.credit ?? "1.00" },
    });
    const solver = await prisma.user.create({ data: { id: `s${seq}`, email: `s${seq}@test.dev`, name: "Solver" } });
    const problem = await prisma.problem.create({
      data: {
        id: `p${seq}`, title: "t", description: "d", tags: [], type: "OPEN_BOUNTY", status: "OPEN", giverId: giver.id,
        freeReviewsUsed: opts.freeUsed ?? 0, runtime: opts.runtime ?? "PYTHON",
      },
    });
    const submission = await prisma.submission.create({
      data: {
        id: `sub${seq}`, problemId: problem.id, solverId: solver.id, repoUrl: "https://github.com/solver/repo", writeup: "w",
        status: "AWAITING_REVIEW", platformRepoUrl: "https://github.com/platform/repo", platformRepoFullName: "platform/repo",
      },
    });
    return { giver, solver, problem, submission };
  }

  const sub = (id: string) => prisma.submission.findUniqueOrThrow({ where: { id } });
  const prob = (id: string) => prisma.problem.findUniqueOrThrow({ where: { id } });
  const credit = async (id: string) => Number((await prisma.user.findUniqueOrThrow({ where: { id } })).creditBalance);
  const ledger = (userId: string) => prisma.creditTransaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

  describe("a run that passes", () => {
    it("uses a free review, records the output and moves to UNDER_REVIEW", async () => {
      const t = await setup();
      const r = await review.startAndRunReview(t.submission.id, t.giver.id);
      expect(r.charged).toBe(false);
      expect(r.refunded).toBe(false);
      const s = await sub(t.submission.id);
      expect(s.status).toBe("UNDER_REVIEW");
      expect(s.sandboxExitCode).toBe(0);
      expect(s.sandboxOutput).toContain("3 passed");
      expect(s.sandboxError).toBeNull();
      expect((await prob(t.problem.id)).freeReviewsUsed).toBe(1);
    });

    it("charges $0.04 once the free reviews are used", async () => {
      const t = await setup({ freeUsed: 3 });
      const r = await review.startAndRunReview(t.submission.id, t.giver.id);
      expect(r.charged).toBe(true);
      expect(await credit(t.giver.id)).toBeCloseTo(0.96, 2);
      expect((await ledger(t.giver.id)).map((x) => x.type)).toEqual(["SUBMISSION_REVIEW"]);
    });
  });

  describe("a run that fails because of Bountied, not the Solver's code", () => {
    const platformFailures: Array<[string, Partial<ExecutionResult>]> = [
      ["the sandbox platform failed", { ok: false, kind: "infra", reason: "E2B unreachable" }],
      ["the mirror could not be cloned", { ok: false, kind: "clone", reason: "clone failed" }],
      ["the sandbox could not be set up", { ok: false, kind: "setup", reason: "setup failed" }],
      ["the package registry was unreachable", { ok: false, kind: "dependency-install", reason: "x", output: "Temporary failure in name resolution" }],
    ];

    it.each(platformFailures)("gives the free review back and returns it to the queue when %s", async (_n, failure) => {
      const t = await setup();
      result(failure);
      const r = await review.startAndRunReview(t.submission.id, t.giver.id);
      expect(r.refunded).toBe(true);
      expect(r.charged).toBe(false);
      expect((await prob(t.problem.id)).freeReviewsUsed).toBe(0);
      expect((await sub(t.submission.id)).status).toBe("AWAITING_REVIEW");
    });

    it("refunds the $0.04 with a REFUND ledger row and returns it to the queue", async () => {
      const t = await setup({ freeUsed: 3 });
      result({ ok: false, kind: "infra", reason: "boom" });
      const r = await review.startAndRunReview(t.submission.id, t.giver.id);
      expect(r.refunded).toBe(true);
      expect(await credit(t.giver.id)).toBe(1);
      const rows = await ledger(t.giver.id);
      expect(rows.map((x) => x.type)).toEqual(["SUBMISSION_REVIEW", "REFUND"]);
      expect(Number(rows[1].amount)).toBe(0.04);
      expect(Number(rows[1].balanceAfter)).toBe(1);
      expect((await sub(t.submission.id)).status).toBe("AWAITING_REVIEW");
    });

    it("lets the Giver run it again, and a good second run is judged normally", async () => {
      const t = await setup();
      result({ ok: false, kind: "infra", reason: "boom" });
      await review.startAndRunReview(t.submission.id, t.giver.id);

      sandbox.next = { ok: true, exitCode: 0, stdout: "all good", stderr: "" };
      const again = await review.startAndRunReview(t.submission.id, t.giver.id);
      expect(again.refunded).toBe(false);
      const s = await sub(t.submission.id);
      expect(s.status).toBe("UNDER_REVIEW");
      expect(s.sandboxOutput).toContain("all good");
      expect(s.sandboxError).toBeNull(); // the earlier failure no longer shows
      expect((await prob(t.problem.id)).freeReviewsUsed).toBe(1);
    });

    it("keeps only a fixed sentence for the Giver, never the raw reason", async () => {
      const t = await setup();
      result({ ok: false, kind: "infra", reason: "secret /srv/app/token ghp_leak line from the solver's file" });
      await review.startAndRunReview(t.submission.id, t.giver.id);
      const s = await sub(t.submission.id);
      expect(s.sandboxError).not.toMatch(/secret|ghp_|\/srv/);
      expect(s.sandboxError?.length).toBeGreaterThan(0);
    });
  });

  describe("a run that fails because of the Solver's code", () => {
    it("keeps the failure and the charge when the program exits non-zero", async () => {
      const t = await setup({ freeUsed: 3 });
      result({ ok: true, exitCode: 1, stdout: "1 failed", stderr: "" });
      const r = await review.startAndRunReview(t.submission.id, t.giver.id);
      expect(r.refunded).toBe(false);
      expect(r.charged).toBe(true);
      expect(await credit(t.giver.id)).toBeCloseTo(0.96, 2);
      const s = await sub(t.submission.id);
      expect(s.status).toBe("SANDBOX_FAILED");
      expect(s.sandboxExitCode).toBe(1);
    });

    it("keeps the failure and the free review when the program times out", async () => {
      const t = await setup();
      result({ ok: false, kind: "timeout", reason: "too slow" });
      const r = await review.startAndRunReview(t.submission.id, t.giver.id);
      expect(r.refunded).toBe(false);
      expect((await prob(t.problem.id)).freeReviewsUsed).toBe(1);
      expect((await sub(t.submission.id)).status).toBe("SANDBOX_FAILED");
    });

    it("keeps the failure when a dependency version doesn't exist (the Solver's to fix)", async () => {
      const t = await setup();
      result({ ok: false, kind: "dependency-install", reason: "x", output: "No matching distribution found for foo==9.9.9" });
      const r = await review.startAndRunReview(t.submission.id, t.giver.id);
      expect(r.refunded).toBe(false);
      expect((await sub(t.submission.id)).status).toBe("DEPENDENCY_INSTALL_FAILED");
    });
  });

  describe("who may run a review, and how often", () => {
    it("refuses anyone but the problem's Giver, and charges nothing", async () => {
      const t = await setup({ freeUsed: 3 });
      await expect(review.startAndRunReview(t.submission.id, t.solver.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(sandbox.calls).toBe(0);
      expect(await credit(t.giver.id)).toBe(1);
    });

    it("refuses an unknown submission", async () => {
      const t = await setup();
      await expect(review.startAndRunReview("nope", t.giver.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("refuses when the Giver can't pay, and leaves the submission waiting", async () => {
      const t = await setup({ credit: "0.01", freeUsed: 3 });
      await expect(review.startAndRunReview(t.submission.id, t.giver.id)).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
      expect((await sub(t.submission.id)).status).toBe("AWAITING_REVIEW");
      expect(await credit(t.giver.id)).toBeCloseTo(0.01, 2);
      expect(sandbox.calls).toBe(0);
    });

    it("runs a double click once and charges once", async () => {
      const t = await setup({ freeUsed: 3 });
      const settled = await Promise.allSettled([1, 2, 3].map(() => review.startAndRunReview(t.submission.id, t.giver.id)));
      expect(settled.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(sandbox.calls).toBe(1);
      expect(await credit(t.giver.id)).toBeCloseTo(0.96, 2);
      expect(await prisma.creditTransaction.count({ where: { userId: t.giver.id } })).toBe(1);
    });

    it("never gives back a review that was already judged", async () => {
      const t = await setup();
      await review.startAndRunReview(t.submission.id, t.giver.id); // passes -> UNDER_REVIEW
      await expect(review.startAndRunReview(t.submission.id, t.giver.id)).rejects.toMatchObject({ code: "NOT_READY" });
      expect((await prob(t.problem.id)).freeReviewsUsed).toBe(1);
    });
  });
});
