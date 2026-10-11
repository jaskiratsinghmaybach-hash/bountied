import type { Metadata } from "next";
import { SOLVER_FREE_TEST_BOUNTY_LIMIT, MAX_SUBMISSION_ATTEMPTS, SOLVER_TEST_COST_USD } from "@/lib/solver-tests/charge";
import { EXAMPLE_MANIFEST, FINDING_GROUPS, RESULT_GROUPS, SANDBOX_DOCS } from "@/lib/solver-tests/docs-content";
import type { DocEntry, DocMoney } from "@/lib/solver-tests/docs-content";

export const metadata: Metadata = {
  title: "How sandbox tests work · Bountied",
  description: "What a Solver test runs, what the free check looks for, and how to fix each result.",
};

const MONEY_LABEL: Record<DocMoney, string> = {
  "free-check": "Free check",
  charged: "Charged",
  "not-charged": "Not charged",
};

// Status dot pattern: grey = neutral, green = positive (not charged). No other colours.
const MONEY_DOT: Record<DocMoney, string> = {
  "free-check": "bg-muted-foreground",
  charged: "bg-muted-foreground",
  "not-charged": "bg-green-500",
};

function Entry({ code, entry }: { code: string; entry: DocEntry }) {
  return (
    // The id is the anchor every in-product link points at: /docs/sandbox#<CODE>.
    <section id={code} className="scroll-mt-24 border-t border-border py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold">{entry.title}</h3>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`inline-block size-1.5 rounded-full ${MONEY_DOT[entry.money]}`} aria-hidden />
          {MONEY_LABEL[entry.money]}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{code}</p>
      <p className="mt-3 text-sm leading-relaxed">{entry.what}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
        {entry.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}

export default function SandboxDocsPage() {
  const cost = SOLVER_TEST_COST_USD.toFixed(2);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">How sandbox tests work</h1>
      <p className="mt-3 text-muted-foreground">
        A test runs your repository in a clean sandbox before you submit, so you find out about problems before a Giver does.
      </p>

      <h2 className="mt-10 text-xl font-semibold">The basics</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          Every test runs the exact commit at the tip of your default branch, using your own read-only GitHub access. Push before you test.
        </li>
        <li>
          You get {MAX_SUBMISSION_ATTEMPTS} attempts per bounty. The first test on each of your first {SOLVER_FREE_TEST_BOUNTY_LIMIT} bounties is free,
          and an unused free test stays available on attempts 2 and 3. Every other test costs ${cost}, taken from your deposited credit first, then your earnings.
        </li>
        <li>If a test fails because of Bountied and not your code, you are refunded and it never uses your free test.</li>
        <li>A free check, which looks for problems without running anything, is always free.</li>
        <li>Bountied only runs fixed commands: your tests, or your entry file. Custom commands aren&apos;t supported.</li>
        <li>
          A commit whose test failed can&apos;t be submitted until you fix it. Submitting without testing is allowed and is shown as Untested. A submission
          is shown as Passed only when its code is the exact commit that passed.
        </li>
        <li>Givers see whether your test passed, its terminal output, the exit code and the commit. They never see your source code before they pay.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">What gets run</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        <li>
          <strong>Python:</strong> if you have tests (test_*.py, *_test.py, or a tests/ folder), pytest runs them. Otherwise Bountied runs main.py, app.py,
          run.py or index.py.
        </li>
        <li>
          <strong>Node:</strong> your package.json &quot;test&quot; script runs if it is a real one. Otherwise Bountied runs your entry file: the entrypoint in
          bountied.json, then &quot;main&quot; in package.json, then index.js, main.js or app.js.
        </li>
        <li>Packages are installed only if bountied.json declares them.</li>
      </ul>

      <h2 id="manifest" className="mt-10 scroll-mt-24 text-xl font-semibold">
        bountied.json
      </h2>
      <p className="mt-3 text-sm leading-relaxed">
        This file in your repo root tells Bountied what to install. Optional fields: &quot;executionMode&quot; (&quot;test&quot;, &quot;build-test&quot; or
        &quot;run&quot;) and &quot;entrypoint&quot; (a relative path such as &quot;main.py&quot;).
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted p-4 text-xs leading-relaxed">
        <code>{EXAMPLE_MANIFEST}</code>
      </pre>

      <h2 className="mt-12 text-2xl font-semibold">The free check</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Before you run, Bountied reads your repo and reports these. Nothing is charged for a check.
      </p>
      {FINDING_GROUPS.map((group) => (
        <div key={group.severity} className="mt-8">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{group.heading}</h3>
          {group.codes.map((code) => (
            <Entry key={code} code={code} entry={SANDBOX_DOCS[code]} />
          ))}
        </div>
      ))}

      <h2 className="mt-12 text-2xl font-semibold">After a run</h2>
      <p className="mt-2 text-sm text-muted-foreground">What each result means and how to fix it.</p>
      {RESULT_GROUPS.map((group) => (
        <div key={group.heading} className="mt-8">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{group.heading}</h3>
          {group.codes.map((code) => (
            <Entry key={code} code={code} entry={SANDBOX_DOCS[code]} />
          ))}
        </div>
      ))}
    </main>
  );
}
