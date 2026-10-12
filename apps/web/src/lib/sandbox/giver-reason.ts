/**
 * What a Giver (and Bountied Desktop, which reads the same column) is told when
 * a review run never produced real output. ZERO-SOURCE: the Giver must never see
 * anything that came out of the Solver's repo before paying. A failed install's
 * stderr, for instance, can echo lines of the Solver's package.json or manifest,
 * and an internal error message can carry paths. So Submission.sandboxError holds
 * one of these FIXED sentences chosen by failure kind, never the runner's raw
 * reason. The raw reason is logged on the server for debugging, and the Solver
 * gets the real detail from their own test run instead.
 *
 * lib/problems/submission-failure.ts classifies a failure by how this text
 * STARTS, so the clone and timeout sentences must keep their current openings.
 */
export type GiverFacingFailureKind = "clone" | "dependency-install" | "setup" | "timeout" | "infra";

export function giverSafeReason(kind: string | undefined | null): string {
  switch (kind) {
    case "clone":
      return "Could not clone the repository.";
    case "dependency-install":
      return "The dependencies in bountied.json could not be installed.";
    case "setup":
      return "The sandbox could not set up this submission.";
    case "timeout":
      return "The program did not finish within the time limit and was stopped.";
    default:
      return "Sandbox execution failed.";
  }
}
