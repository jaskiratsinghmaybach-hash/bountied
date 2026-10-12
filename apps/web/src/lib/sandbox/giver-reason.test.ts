import { describe, expect, it } from "vitest";
import { giverSafeReason } from "./giver-reason";
import { classifySubmissionFailure } from "@/lib/problems/submission-failure";

const fields = (status: string, sandboxError: string | null, sandboxExitCode: number | null = null) => ({
  status,
  sandboxError,
  sandboxOutput: null,
  sandboxExitCode,
});

describe("giverSafeReason", () => {
  it("is a fixed sentence per failure kind", () => {
    const kinds = ["clone", "dependency-install", "setup", "timeout", "infra"];
    const texts = kinds.map((k) => giverSafeReason(k));
    expect(new Set(texts).size).toBe(kinds.length);
    for (const t of texts) expect(t.length).toBeGreaterThan(10);
  });

  it("falls back to a generic sentence for an unknown or missing kind", () => {
    expect(giverSafeReason(undefined)).toBe(giverSafeReason("infra"));
    expect(giverSafeReason("something-new")).toBe(giverSafeReason("infra"));
  });

  it("never carries anything from the failed step, whatever the input", () => {
    // The function takes only a kind, so a stderr line cannot reach its output.
    for (const k of ["clone", "dependency-install", "setup", "timeout", "infra"]) {
      expect(giverSafeReason(k)).not.toMatch(/ghp_|gho_|Traceback|\.py|package\.json:|line \d+/);
    }
  });

  it("keeps the openings that failure classification depends on", () => {
    expect(giverSafeReason("clone").startsWith("Could not clone the repository")).toBe(true);
    const clone = classifySubmissionFailure(fields("SANDBOX_FAILED", giverSafeReason("clone")));
    expect(clone?.summary).toMatch(/clone/i);
    expect(clone?.suggestible).toBe(false);
  });

  it("is classified as a Solver-side problem when the program timed out", () => {
    const timeout = classifySubmissionFailure(fields("SANDBOX_FAILED", giverSafeReason("timeout")));
    expect(timeout?.summary).toMatch(/time limit|finish/i);
    expect(timeout?.suggestible).toBe(true);
  });

  it("is classified as a platform problem for infra and setup", () => {
    for (const k of ["infra", "setup"]) {
      const c = classifySubmissionFailure(fields("SANDBOX_FAILED", giverSafeReason(k)));
      expect(c?.summary).toMatch(/platform/i);
      expect(c?.suggestible).toBe(false);
    }
  });
});
