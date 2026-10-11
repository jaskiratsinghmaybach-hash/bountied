import { describe, expect, it } from "vitest";
import { fetchHeadCommitSha } from "./head-commit";
import type { FetchLike } from "./repo-snapshot";

const SHA = "d".repeat(40);
const reply = (status: number, body: unknown = {}): FetchLike => async () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const params = (fetchImpl: FetchLike) => ({ repoUrl: "https://github.com/o/r", token: "gho_tok", fetchImpl });

describe("fetchHeadCommitSha", () => {
  it("returns the commit at HEAD", async () => {
    expect(await fetchHeadCommitSha(params(reply(200, { sha: SHA })))).toEqual({ ok: true, commitSha: SHA });
  });

  it("asks for commits/HEAD with the token in the Authorization header only", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    await fetchHeadCommitSha(params(async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ sha: SHA })); }));
    expect(seen!.url).toBe("https://api.github.com/repos/o/r/commits/HEAD");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer gho_tok");
    expect(seen!.url).not.toContain("gho_tok");
  });

  it.each([
    [401, /Reconnect GitHub/], [403, /Reconnect GitHub/], [404, /not found/], [409, /empty/], [500, /500/],
  ])("explains a %s", async (status, text) => {
    const r = await fetchHeadCommitSha(params(reply(status)));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(text);
  });

  it("rejects a response without a valid 40-hex sha", async () => {
    for (const body of [{}, { sha: "abc" }, { sha: 5 }, { sha: "G".repeat(40) }]) {
      expect((await fetchHeadCommitSha(params(reply(200, body)))).ok).toBe(false);
    }
  });

  it("reports a network failure instead of throwing", async () => {
    const r = await fetchHeadCommitSha(params(async () => { throw new Error("ECONNRESET"); }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/reach GitHub/);
  });

  it("refuses a non-GitHub URL without calling out", async () => {
    let called = false;
    const r = await fetchHeadCommitSha({ repoUrl: "https://evil.example/o/r", token: "t", fetchImpl: async () => { called = true; return new Response("{}"); } });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
});
