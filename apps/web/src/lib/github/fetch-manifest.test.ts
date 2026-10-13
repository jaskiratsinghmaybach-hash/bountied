import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBountiedManifest } from "./fetch-manifest";

const calls: Array<{ url: string; init?: RequestInit }> = [];
function stub(status: number, body: unknown = {}) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  });
}
afterEach(() => vi.unstubAllGlobals());

const b64 = (text: string) => Buffer.from(text).toString("base64");

describe("fetchBountiedManifest", () => {
  it("reads bountied.json from the Solver's repo with the Solver's token in a header", async () => {
    stub(200, { type: "file", content: b64('{"dependencies":{}}') });
    const r = await fetchBountiedManifest({ repoUrl: "https://github.com/solver/repo", solverToken: "gho_tok" });
    expect(r).toEqual({ ok: true, content: '{"dependencies":{}}' });
    expect(calls[0].url).toBe("https://api.github.com/repos/solver/repo/contents/bountied.json");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer gho_tok");
    expect(calls[0].url).not.toContain("gho_tok");
  });

  it("decodes the base64 GitHub wraps over several lines", async () => {
    const text = '{"dependencies":{"requests":"2.31.0"}}';
    const wrapped = b64(text).replace(/(.{20})/g, "$1\n");
    stub(200, { type: "file", content: wrapped });
    expect(await fetchBountiedManifest({ repoUrl: "https://github.com/a/b", solverToken: "t" })).toEqual({ ok: true, content: text });
  });

  it("treats a missing file as 'no manifest', not an error", async () => {
    stub(404);
    expect(await fetchBountiedManifest({ repoUrl: "https://github.com/a/b", solverToken: "t" })).toEqual({ ok: true, content: null });
  });

  it("treats a directory or submodule at that path as 'no manifest'", async () => {
    stub(200, { type: "dir" });
    expect(await fetchBountiedManifest({ repoUrl: "https://github.com/a/b", solverToken: "t" })).toEqual({ ok: true, content: null });
  });

  it("reports a rejected token and other GitHub errors", async () => {
    stub(401);
    const a = await fetchBountiedManifest({ repoUrl: "https://github.com/a/b", solverToken: "t" });
    expect(a.ok).toBe(false);
    stub(500);
    const b = await fetchBountiedManifest({ repoUrl: "https://github.com/a/b", solverToken: "t" });
    expect(b.ok === false && b.reason).toContain("500");
  });

  it.each([
    "https://github.com/own/repo$(id)",
    "https://github.com/a%2Fb/c",
    "https://github.com/own/repo/../../user",
    "https://github.com/own",
    "http://github.com/own/repo",
    "https://evil.test/own/repo",
    "https://github.com.evil.test/own/repo",
    "ssh://git@github.com/own/repo",
    "nonsense",
    "",
  ])("refuses %j without sending a request", async (bad) => {
    stub(200, { type: "file", content: b64("{}") });
    const r = await fetchBountiedManifest({ repoUrl: bad, solverToken: "t" });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
