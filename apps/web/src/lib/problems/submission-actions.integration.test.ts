import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl, resetTestDatabase } from "@/test/db";

/**
 * createSubmission and the mirror step that follows it, against a real Postgres:
 * what URLs are accepted, how the Solver's own test result gates and labels the
 * submission, and how a PASSED label is re-verified when the repo is mirrored.
 * GitHub (HEAD and bountied.json), the mirror and the session are faked.
 * Runs only when TEST_DATABASE_URL points at a throwaway database (src/test/db.ts).
 */
const url = getTestDatabaseUrl();

const fake = vi.hoisted(() => ({
  user: null as null | { id: string; githubAccessToken: string | null },
  afterTasks: [] as Array<() => Promise<unknown>>,
  head: { status: 200, sha: "a".repeat(40) },
  manifest: null as string | null,
  mirror: { ok: true, mirroredCommitSha: "a".repeat(40) } as Record<string, unknown>,
  mirrorCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => void fake.afterTasks.push(task) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => fake.user }));
vi.mock("@/lib/github/mirror", () => ({
  mirrorSubmissionRepo: async (p: Record<string, unknown>) => {
    fake.mirrorCalls.push(p);
    return fake.mirror;
  },
}));

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe.skipIf(!url)("createSubmission (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let actions: typeof import("./submission-actions");

  beforeAll(async () => {
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);
    prisma = (await import("@/lib/db")).prisma;
    actions = await import("./submission-actions");
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma?.$disconnect();
  });

  beforeEach(() => {
    fake.afterTasks = [];
    fake.mirrorCalls = [];
    fake.head = { status: 200, sha: SHA_A };
    fake.manifest = null;
    fake.mirror = { ok: true, mirroredCommitSha: SHA_A, repo: { fullName: "plat/sub", htmlUrl: "https://github.com/plat/sub", cloneUrl: "https://github.com/plat/sub.git" } };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.endsWith("/commits/HEAD")) {
        return new Response(JSON.stringify({ sha: fake.head.sha }), { status: fake.head.status });
      }
      if (u.includes("/contents/bountied.json")) {
        if (fake.manifest === null) return new Response("{}", { status: 404 });
        return new Response(JSON.stringify({ type: "file", encoding: "base64", content: Buffer.from(fake.manifest).toString("base64") }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
  });

  let seq = 0;
  async function setup(opts: { runtime?: "PYTHON" | "NODE"; policy?: unknown } = {}) {
    seq += 1;
    const giver = await prisma.user.create({ data: { id: `g${seq}`, email: `g${seq}@test.dev`, name: "Giver" } });
    const solver = await prisma.user.create({
      data: { id: `s${seq}`, email: `s${seq}@test.dev`, name: "Solver", githubAccessToken: "gho_solver" },
    });
    const problem = await prisma.problem.create({
      data: {
        id: `p${seq}`, title: "Problem", description: "d", tags: [], type: "OPEN_BOUNTY", status: "OPEN", giverId: giver.id,
        runtime: opts.runtime ?? "PYTHON", ...(opts.policy ? { dependencyPolicy: opts.policy as object } : {}),
      },
    });
    fake.user = { id: solver.id, githubAccessToken: "gho_solver" };
    return { giver, solver, problem };
  }

  const WRITEUP = "This is my approach and why it works, in enough words to pass.";
  const submit = (problemId: string, fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ writeup: WRITEUP, ...fields })) fd.set(k, v);
    return actions.createSubmission(problemId, undefined, fd);
  };
  const rows = (solverId: string) => prisma.submission.findMany({ where: { solverId }, orderBy: { submittedAt: "asc" } });
  const run = (t: { solver: { id: string }; problem: { id: string } }, over: Record<string, unknown>) =>
    prisma.solverTestRun.create({
      data: {
        id: `run${++seq}`, solverId: t.solver.id, problemId: t.problem.id, repoUrl: "https://github.com/solver/repo",
        commitSha: SHA_A, status: "PASSED", isFree: false, mode: "tests", ...over,
      } as never,
    });
  const REPO = "https://github.com/solver/repo";

  describe("the repository URL", () => {
    const refused = [
      "https://github.com/own/repo$(touch$IFS/tmp/pwned)",
      "https://github.com/own/repo;id",
      "https://github.com/own/repo`id`",
      "https://github.com/own/repo/tree/main",
      "http://github.com/own/repo",
      "https://evil.test/own/repo",
      "https://github.com.evil.test/own/repo",
      "git@github.com:own/repo.git",
      "javascript:alert(1)",
      "not a url",
    ];

    it.each(refused)("refuses %j and saves nothing", async (bad) => {
      const t = await setup();
      const r = await submit(t.problem.id, { repoUrl: bad });
      expect("error" in r && r.error).toMatch(/GitHub repository/);
      expect(await rows(t.solver.id)).toHaveLength(0);
      expect(fake.afterTasks).toHaveLength(0);
    });

    it("refuses an empty repo", async () => {
      const t = await setup();
      expect("error" in (await submit(t.problem.id, { repoUrl: "" }))).toBe(true);
    });

    it("saves the URL rebuilt from owner and repo, dropping .git, query and fragment", async () => {
      const t = await setup();
      const r = await submit(t.problem.id, { repoUrl: "https://github.com/Solver/Re.po.git?x=1#frag" });
      expect("ok" in r && r.ok).toBe(true);
      expect((await rows(t.solver.id))[0].repoUrl).toBe("https://github.com/Solver/Re.po");
    });
  });

  describe("basic rules", () => {
    it("needs a login, a long enough write-up, an open problem and attempts left", async () => {
      const t = await setup();
      fake.user = null;
      expect("error" in (await submit(t.problem.id, { repoUrl: REPO }))).toBe(true);
      fake.user = { id: t.solver.id, githubAccessToken: "gho_solver" };

      expect("error" in (await submit(t.problem.id, { repoUrl: REPO, writeup: "short" }))).toBe(true);

      await prisma.problem.update({ where: { id: t.problem.id }, data: { status: "COMPLETED" } });
      expect("error" in (await submit(t.problem.id, { repoUrl: REPO }))).toBe(true);
      await prisma.problem.update({ where: { id: t.problem.id }, data: { status: "OPEN" } });

      for (let i = 0; i < 3; i++) expect("ok" in (await submit(t.problem.id, { repoUrl: REPO }))).toBe(true);
      const fourth = await submit(t.problem.id, { repoUrl: REPO });
      expect("error" in fourth && fourth.error).toMatch(/all 3 submission attempts/);
      expect(await rows(t.solver.id)).toHaveLength(3);
    });
  });

  describe("the Solver's own test result", () => {
    it("allows an untested submission and labels it UNTESTED, without asking GitHub anything", async () => {
      const t = await setup();
      const calls: string[] = [];
      const real = globalThis.fetch;
      vi.stubGlobal("fetch", async (i: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(i));
        return real(i, init);
      });
      const r = await submit(t.problem.id, { repoUrl: REPO });
      expect("ok" in r && r.ok).toBe(true);
      const s = (await rows(t.solver.id))[0];
      expect(s.testStatus).toBe("UNTESTED");
      expect(s.testedCommitSha).toBeNull();
      expect(s.testRunId).toBeNull();
      expect(calls.some((c) => c.endsWith("/commits/HEAD"))).toBe(false);
      expect(fake.afterTasks).toHaveLength(1);
    });

    it("labels a submission PASSED, with the commit and run, when HEAD is the commit that passed", async () => {
      const t = await setup();
      const passing = await run(t, { commitSha: SHA_A, status: "PASSED" });
      const r = await submit(t.problem.id, { repoUrl: REPO });
      expect("ok" in r && r.ok).toBe(true);
      const s = (await rows(t.solver.id))[0];
      expect(s.testStatus).toBe("PASSED");
      expect(s.testedCommitSha).toBe(SHA_A);
      expect(s.testRunId).toBe(passing.id);
    });

    it("labels it UNTESTED when the Solver pushed again after the passing test", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "PASSED" });
      fake.head.sha = SHA_B;
      await submit(t.problem.id, { repoUrl: REPO });
      const s = (await rows(t.solver.id))[0];
      expect(s.testStatus).toBe("UNTESTED");
      expect(s.testedCommitSha).toBeNull();
    });

    it("matches the repo regardless of letter case in the URL", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "PASSED", repoUrl: "https://github.com/SOLVER/Repo" });
      await submit(t.problem.id, { repoUrl: "https://github.com/solver/repo" });
      expect((await rows(t.solver.id))[0].testStatus).toBe("PASSED");
    });

    it("blocks a commit whose test FAILED, with how to fix it, and saves nothing", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "FAILED", errorCode: "TESTS_FAILED", errorMessage: "Your tests failed. Run them locally." });
      const r = await submit(t.problem.id, { repoUrl: REPO });
      expect("error" in r && r.error).toContain("Run them locally");
      expect("code" in r && r.code).toBe("TEST_FAILED");
      expect("docsUrl" in r && r.docsUrl).toBe("/docs/sandbox#TESTS_FAILED");
      expect(await rows(t.solver.id)).toHaveLength(0);
      expect(fake.afterTasks).toHaveLength(0);
    });

    it("blocks a commit whose test ERRORED", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "ERROR", errorCode: "PLATFORM_ERROR", errorMessage: "Bountied had a problem." });
      const r = await submit(t.problem.id, { repoUrl: REPO });
      expect("code" in r && r.code).toBe("TEST_ERROR");
    });

    it("blocks while a test of this commit is still running", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "RUNNING" });
      expect("code" in (await submit(t.problem.id, { repoUrl: REPO })) && true).toBe(true);
      expect(await rows(t.solver.id)).toHaveLength(0);
    });

    it("blocks, rather than guessing, when the repo was tested but GitHub can't be asked for HEAD", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "PASSED" });
      fake.head.status = 500;
      const r = await submit(t.problem.id, { repoUrl: REPO });
      expect("code" in r && r.code).toBe("HEAD_UNVERIFIABLE");
      expect(await rows(t.solver.id)).toHaveLength(0);
    });

    it("lets a new commit through even if an older commit failed", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_B, status: "FAILED", errorCode: "TESTS_FAILED" });
      expect("ok" in (await submit(t.problem.id, { repoUrl: REPO }))).toBe(true);
    });

    it("ignores any test status the form tries to send", async () => {
      const t = await setup();
      await submit(t.problem.id, {
        repoUrl: REPO, testStatus: "PASSED", testedCommitSha: SHA_A, testRunId: "run-from-someone-else",
      });
      const s = (await rows(t.solver.id))[0];
      expect(s.testStatus).toBe("UNTESTED");
      expect(s.testedCommitSha).toBeNull();
      expect(s.testRunId).toBeNull();
    });

    it("never uses another Solver's passing test", async () => {
      const t = await setup();
      const other = await prisma.user.create({ data: { id: `o${++seq}`, email: `o${seq}@test.dev`, name: "Other" } });
      await run({ solver: other, problem: t.problem }, { commitSha: SHA_A, status: "PASSED" });
      await submit(t.problem.id, { repoUrl: REPO });
      expect((await rows(t.solver.id))[0].testStatus).toBe("UNTESTED");
    });
  });

  describe("mirroring a submission", () => {
    async function submitAndMirror(t: Awaited<ReturnType<typeof setup>>) {
      await submit(t.problem.id, { repoUrl: REPO });
      const [row] = await rows(t.solver.id);
      await fake.afterTasks[0]();
      return prisma.submission.findUniqueOrThrow({ where: { id: row.id } });
    }

    it("keeps PASSED when the mirrored commit is the one that passed", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "PASSED" });
      fake.mirror = { ...fake.mirror, mirroredCommitSha: SHA_A };
      const s = await submitAndMirror(t);
      expect(s.status).toBe("AWAITING_REVIEW");
      expect(s.testStatus).toBe("PASSED");
      expect(s.testedCommitSha).toBe(SHA_A);
    });

    it("drops back to UNTESTED when the Solver pushed between submitting and mirroring", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "PASSED" });
      fake.mirror = { ...fake.mirror, mirroredCommitSha: SHA_B };
      const s = await submitAndMirror(t);
      expect(s.status).toBe("AWAITING_REVIEW");
      expect(s.testStatus).toBe("UNTESTED");
      expect(s.testedCommitSha).toBeNull();
      expect(s.testRunId).toBeNull();
    });

    it("drops back to UNTESTED when the mirrored commit can't be read", async () => {
      const t = await setup();
      await run(t, { commitSha: SHA_A, status: "PASSED" });
      fake.mirror = { ...fake.mirror, mirroredCommitSha: null };
      expect((await submitAndMirror(t)).testStatus).toBe("UNTESTED");
    });

    it("leaves an UNTESTED submission as it is", async () => {
      const t = await setup();
      const s = await submitAndMirror(t);
      expect(s.status).toBe("AWAITING_REVIEW");
      expect(s.testStatus).toBe("UNTESTED");
    });

    it("hands the mirror only the validated, rebuilt repo URL and the Solver's own token", async () => {
      const t = await setup();
      await submit(t.problem.id, { repoUrl: "https://github.com/solver/repo.git?q=1" });
      await fake.afterTasks[0]();
      expect(fake.mirrorCalls[0]).toMatchObject({ sourceRepoUrl: "https://github.com/solver/repo", solverToken: "gho_solver" });
    });

    it("records a failed mirror as a failure, and keeps the fixed Giver-facing classification working", async () => {
      const t = await setup();
      fake.mirror = { ok: false, reason: "Could not read your repository." };
      const s = await submitAndMirror(t);
      expect(s.status).toBe("SANDBOX_FAILED");
      expect(s.sandboxError).toContain("Repository mirror failed");
    });
  });

  describe("the Giver's dependency policy at mirror time", () => {
    it("rejects a banned package without mirroring", async () => {
      const t = await setup({ policy: { bannedPackages: ["requests"] } });
      fake.manifest = JSON.stringify({ dependencies: { requests: "2.31.0" } });
      await submit(t.problem.id, { repoUrl: REPO });
      await fake.afterTasks[0]();
      const [s] = await rows(t.solver.id);
      expect(s.status).toBe("DEPENDENCY_POLICY_VIOLATION");
      expect(fake.mirrorCalls).toHaveLength(0);
    });

    it("applies a Node allow-list exactly: socket.io allowed does not allow socket-io", async () => {
      const t = await setup({ runtime: "NODE", policy: { allowedPackages: ["socket.io"] } });
      fake.manifest = JSON.stringify({ dependencies: { "socket-io": "4.0.0" } });
      await submit(t.problem.id, { repoUrl: REPO });
      await fake.afterTasks[0]();
      expect((await rows(t.solver.id))[0].status).toBe("DEPENDENCY_POLICY_VIOLATION");
      expect(fake.mirrorCalls).toHaveLength(0);
    });

    it("lets a compliant Node manifest through to the mirror", async () => {
      const t = await setup({ runtime: "NODE", policy: { allowedPackages: ["socket.io"] } });
      fake.manifest = JSON.stringify({ dependencies: { "socket.io": "4.7.2" } });
      await submit(t.problem.id, { repoUrl: REPO });
      await fake.afterTasks[0]();
      expect(fake.mirrorCalls).toHaveLength(1);
    });
  });
});
