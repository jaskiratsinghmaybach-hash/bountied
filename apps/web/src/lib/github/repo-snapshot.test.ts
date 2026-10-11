import { describe, expect, it } from "vitest";
import { fetchRepoSnapshot, parseGithubRepoUrl } from "./repo-snapshot";
import type { FetchLike } from "./repo-snapshot";
import { runPreflight } from "@/lib/solver-tests/preflight";

const COMMIT = "c".repeat(40);
const TREE = "d".repeat(40);
const TOKEN = "ghp_SECRET_TOKEN_VALUE_123";

type Fake = { files: Record<string, string>; sizeOverride?: Record<string, number>; truncated?: boolean };

/** A tiny GitHub: the three endpoints the snapshot reads, shaped like the documented responses. */
function fakeGithub(fake: Fake, overrides: Record<string, Response> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const path = url.replace("https://api.github.com", "");
    for (const [suffix, res] of Object.entries(overrides)) if (path.includes(suffix)) return res.clone();
    if (path === "/repos/me/proj/commits/HEAD") {
      return Response.json({ sha: COMMIT, commit: { tree: { sha: TREE } } });
    }
    if (path === `/repos/me/proj/git/trees/${TREE}?recursive=1`) {
      return Response.json({
        sha: TREE,
        truncated: fake.truncated ?? false,
        tree: [
          ...Object.keys(fake.files).map((p) => ({ path: p, type: "blob", size: fake.sizeOverride?.[p] ?? fake.files[p].length })),
          { path: "src", type: "tree" },
        ],
      });
    }
    const contents = /^\/repos\/me\/proj\/contents\/([^?]+)\?ref=(.+)$/.exec(path);
    if (contents && contents[2] === COMMIT && fake.files[contents[1]] !== undefined) {
      return new Response(fake.files[contents[1]], { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  return { impl, calls };
}

const REPO = "https://github.com/me/proj";

describe("parseGithubRepoUrl", () => {
  it("accepts plain github.com repo URLs, with or without .git", () => {
    expect(parseGithubRepoUrl("https://github.com/me/proj")).toEqual({ owner: "me", repo: "proj" });
    expect(parseGithubRepoUrl("https://github.com/me/proj.git")).toEqual({ owner: "me", repo: "proj" });
  });

  it("rejects other hosts, schemes, shapes and traversal", () => {
    for (const bad of [
      "http://github.com/me/proj",
      "https://evil.com/me/proj",
      "https://github.com.evil.com/me/proj",
      "https://github.com/me",
      "https://github.com/me/proj/tree/main",
      "https://github.com/../proj",
      "https://github.com/me/..",
      "https://github.com/me/pro j",
      "not a url",
    ]) {
      expect(parseGithubRepoUrl(bad)).toBeNull();
    }
  });
});

describe("fetchRepoSnapshot", () => {
  it("returns the commit, the file list and the three root files", async () => {
    const gh = fakeGithub({ files: { "main.py": "print(1)", "bountied.json": '{"dependencies":{}}', "requirements.txt": "numpy\n", "src/a.py": "x" } });
    const r = await fetchRepoSnapshot({ repoUrl: REPO, token: TOKEN, fetchImpl: gh.impl });

    expect(r.ok).toBe(true);
    expect(r.commitSha).toBe(COMMIT);
    expect(r.files).toEqual(["main.py", "bountied.json", "requirements.txt", "src/a.py"]); // directories are not files
    expect(r.bountiedJson).toBe('{"dependencies":{}}');
    expect(r.requirementsTxt).toBe("numpy\n");
    expect(r.packageJson).toBeNull();
  });

  it("reads files at the exact commit, not at a moving branch", async () => {
    const gh = fakeGithub({ files: { "package.json": "{}" } });
    await fetchRepoSnapshot({ repoUrl: REPO, token: TOKEN, fetchImpl: gh.impl });
    const reads = gh.calls.filter((c) => c.url.includes("/contents/"));
    expect(reads).toHaveLength(1);
    expect(reads[0].url).toContain(`ref=${COMMIT}`);
  });

  it("sends the token only as an Authorization header to api.github.com", async () => {
    const gh = fakeGithub({ files: { "main.py": "x" } });
    await fetchRepoSnapshot({ repoUrl: REPO, token: TOKEN, fetchImpl: gh.impl });
    for (const call of gh.calls) {
      expect(call.url.startsWith("https://api.github.com/")).toBe(true);
      expect(call.url).not.toContain(TOKEN);
      expect((call.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("explains access problems without leaking the token", async () => {
    for (const [status, text] of [
      [401, "Reconnect GitHub"],
      [403, "Reconnect GitHub"],
      [404, "not found"],
      [409, "empty"],
    ] as const) {
      const gh = fakeGithub({ files: {} }, { "/commits/HEAD": new Response(`{"message":"${TOKEN}"}`, { status }) });
      const r = await fetchRepoSnapshot({ repoUrl: REPO, token: TOKEN, fetchImpl: gh.impl });
      expect(r.ok).toBe(false);
      expect(r.reason).toContain(text);
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    }
  });

  it("gives a plain message for a network failure, without the error text", async () => {
    const boom: FetchLike = async () => {
      throw new Error(`connect failed for Bearer ${TOKEN}`);
    };
    const r = await fetchRepoSnapshot({ repoUrl: REPO, token: TOKEN, fetchImpl: boom });
    expect(r).toEqual({ ok: false, reason: "Could not reach GitHub. Try again in a moment." });
  });

  it("refuses a bad URL before making any request", async () => {
    const gh = fakeGithub({ files: {} });
    const r = await fetchRepoSnapshot({ repoUrl: "https://evil.com/me/proj", token: TOKEN, fetchImpl: gh.impl });
    expect(r.ok).toBe(false);
    expect(gh.calls).toHaveLength(0);
  });

  it("refuses an oversized manifest instead of reading it", async () => {
    const gh = fakeGithub({ files: { "bountied.json": "{}" }, sizeOverride: { "bountied.json": 5_000_000 } });
    const r = await fetchRepoSnapshot({ repoUrl: REPO, token: TOKEN, fetchImpl: gh.impl });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("too large");
    expect(gh.calls.some((c) => c.url.includes("/contents/"))).toBe(false);
  });

  it("refuses a repository too large to list", async () => {
    const gh = fakeGithub({ files: { "main.py": "x" }, truncated: true });
    const r = await fetchRepoSnapshot({ repoUrl: REPO, token: TOKEN, fetchImpl: gh.impl });
    expect(r).toEqual({ ok: false, reason: "This repository is too large to analyze automatically." });
  });

  it("rejects a malformed commit response rather than trusting it", async () => {
    const gh = fakeGithub({ files: {} }, { "/commits/HEAD": Response.json({ sha: "../../etc", commit: { tree: { sha: TREE } } }) });
    const r = await fetchRepoSnapshot({ repoUrl: REPO, token: TOKEN, fetchImpl: gh.impl });
    expect(r.ok).toBe(false);
  });
});

describe("runPreflight end to end (fake GitHub)", () => {
  it("plans a Python repo with tests and reports the commit", async () => {
    const gh = fakeGithub({ files: { "main.py": "x", "tests/test_main.py": "x" } });
    const r = await runPreflight({ repoUrl: REPO, solverToken: TOKEN, runtime: "PYTHON", fetchImpl: gh.impl });
    expect(r.ok).toBe(true);
    expect(r.commitSha).toBe(COMMIT);
    expect(r.plan).toMatchObject({ ok: true, mode: "tests", addPytest: true });
  });

  it("plans a Node repo with just index.js", async () => {
    const gh = fakeGithub({ files: { "index.js": "console.log(1)" } });
    const r = await runPreflight({ repoUrl: REPO, solverToken: TOKEN, runtime: "NODE", fetchImpl: gh.impl });
    expect(r.plan).toMatchObject({ ok: true, mode: "entry", entrypoint: "index.js", install: false });
  });

  it("returns fixable findings, still with the commit, when the repo has a problem", async () => {
    const gh = fakeGithub({ files: { "README.md": "hi" } });
    const r = await runPreflight({ repoUrl: REPO, solverToken: TOKEN, runtime: "PYTHON", fetchImpl: gh.impl });
    expect(r.ok).toBe(true);
    expect(r.plan?.ok).toBe(false);
    expect(r.plan?.findings[0].code).toBe("NO_ENTRYPOINT");
  });

  it("reports a GitHub problem as not ok, with no plan", async () => {
    const gh = fakeGithub({ files: {} }, { "/commits/HEAD": new Response("{}", { status: 404 }) });
    const r = await runPreflight({ repoUrl: REPO, solverToken: TOKEN, runtime: "PYTHON", fetchImpl: gh.impl });
    expect(r.ok).toBe(false);
    expect(r.plan).toBeUndefined();
  });
});
