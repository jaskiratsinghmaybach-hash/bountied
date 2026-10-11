import { describe, expect, it } from "vitest";
import { readJsonBody } from "./http";

const req = (headers: Record<string, string>, body: string) => new Request("http://x/api", { method: "POST", headers, body });

describe("readJsonBody", () => {
  it("parses a JSON body", async () => {
    const r = await readJsonBody(req({ "content-type": "application/json" }, '{"a":1}'));
    expect(r).toEqual({ ok: true, body: { a: 1 } });
  });

  it("accepts a charset suffix", async () => {
    expect((await readJsonBody(req({ "content-type": "application/json; charset=utf-8" }, "{}"))).ok).toBe(true);
  });

  it("refuses a form post, which another site's page can send", async () => {
    expect((await readJsonBody(req({ "content-type": "application/x-www-form-urlencoded" }, "a=1"))).ok).toBe(false);
    expect((await readJsonBody(req({ "content-type": "text/plain" }, "{}"))).ok).toBe(false);
  });

  it("refuses a missing content type and malformed JSON", async () => {
    expect((await readJsonBody(new Request("http://x/api", { method: "POST", body: "{}", headers: { "content-type": "" } }))).ok).toBe(false);
    expect((await readJsonBody(req({ "content-type": "application/json" }, "{nope"))).ok).toBe(false);
  });
});
