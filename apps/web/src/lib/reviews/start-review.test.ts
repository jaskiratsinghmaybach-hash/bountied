import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Logic tests with an in-memory stand-in for the database (the real SQL is
 * exercised by the Postgres integration tests). They check WHICH refund
 * happens and WHEN, which is what the free-review rule depends on.
 */
const db = vi.hoisted(() => ({
  state: {
    freeReviewsUsed: 0,
    credit: 1,
    status: "AWAITING_REVIEW",
    transactions: [] as Array<{ type: string; amount: number; balanceAfter: number }>,
  },
  run: { refundable: false, ok: true } as { refundable?: boolean; ok: boolean },
  failRefund: false,
}));

vi.mock("@/lib/sandbox/run-submission", () => ({ runAndRecordSubmission: async () => db.run }));
vi.mock("@/lib/db", () => {
  const tx = {
    submission: {
      findUnique: async () => ({ id: "s1", problem: { id: "p1", giverId: "g1" } }),
      updateMany: async () => {
        if (db.state.status !== "AWAITING_REVIEW") return { count: 0 };
        db.state.status = "RUNNING";
        return { count: 1 };
      },
    },
    problem: {
      updateMany: async (a: { where: { freeReviewsUsed: { lt?: number; gt?: number } }; data: { freeReviewsUsed: { increment?: number; decrement?: number } } }) => {
        const w = a.where.freeReviewsUsed;
        if (w.gt !== undefined && db.failRefund) throw new Error("db down");
        if (w.lt !== undefined && !(db.state.freeReviewsUsed < w.lt)) return { count: 0 };
        if (w.gt !== undefined && !(db.state.freeReviewsUsed > w.gt)) return { count: 0 };
        db.state.freeReviewsUsed += a.data.freeReviewsUsed.increment ?? -(a.data.freeReviewsUsed.decrement ?? 0);
        return { count: 1 };
      },
    },
    user: {
      updateMany: async (a: { where: { creditBalance: { gte: number } }; data: { creditBalance: { decrement: number } } }) => {
        if (db.state.credit < a.where.creditBalance.gte) return { count: 0 };
        db.state.credit = Math.round((db.state.credit - a.data.creditBalance.decrement) * 100) / 100;
        return { count: 1 };
      },
      update: async (a: { data: { creditBalance: { increment: number } } }) => {
        db.state.credit = Math.round((db.state.credit + a.data.creditBalance.increment) * 100) / 100;
        return {};
      },
      findUniqueOrThrow: async () => ({ creditBalance: db.state.credit }),
    },
    creditTransaction: {
      create: async (a: { data: { type: string; amount: number; balanceAfter: number } }) => {
        db.state.transactions.push({ type: a.data.type, amount: a.data.amount, balanceAfter: a.data.balanceAfter });
        return {};
      },
    },
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { refundReview, startAndRunReview } from "./start-review";

beforeEach(() => {
  db.state.freeReviewsUsed = 0;
  db.state.credit = 1;
  db.state.status = "AWAITING_REVIEW";
  db.state.transactions = [];
  db.run = { ok: true, refundable: false };
  db.failRefund = false;
});

describe("startAndRunReview: platform failures do not cost the Giver", () => {
  it("gives the free review back when the run failed on the platform", async () => {
    db.run = { ok: true, refundable: true };
    const r = await startAndRunReview("s1", "g1");
    expect(r.refunded).toBe(true);
    expect(r.charged).toBe(false);
    expect(db.state.freeReviewsUsed).toBe(0);
    expect(db.state.credit).toBe(1);
  });

  it("keeps the free review used when the Solver's program ran and failed", async () => {
    db.run = { ok: true, refundable: false };
    const r = await startAndRunReview("s1", "g1");
    expect(r.refunded).toBe(false);
    expect(db.state.freeReviewsUsed).toBe(1);
  });

  it("refunds the $0.04 and logs a REFUND when a paid review failed on the platform", async () => {
    db.state.freeReviewsUsed = 3; // all free reviews already used
    db.run = { ok: false, refundable: true };
    const r = await startAndRunReview("s1", "g1");
    expect(r.refunded).toBe(true);
    expect(r.charged).toBe(false);
    expect(db.state.credit).toBe(1);
    expect(db.state.transactions.map((t) => t.type)).toEqual(["SUBMISSION_REVIEW", "REFUND"]);
    expect(db.state.transactions[1].amount).toBe(0.04);
    expect(db.state.transactions[1].balanceAfter).toBe(1);
  });

  it("keeps the $0.04 when a paid review ran the Solver's code and it failed", async () => {
    db.state.freeReviewsUsed = 3;
    const r = await startAndRunReview("s1", "g1");
    expect(r.charged).toBe(true);
    expect(db.state.credit).toBe(0.96);
    expect(db.state.transactions.map((t) => t.type)).toEqual(["SUBMISSION_REVIEW"]);
  });

  it("still returns the recorded result if the refund itself throws", async () => {
    db.run = { ok: true, refundable: true };
    db.failRefund = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await startAndRunReview("s1", "g1");
    spy.mockRestore();
    expect(r.outcome).toBe(db.run);
    expect(r.refunded).toBe(false);
    expect(r.charged).toBe(false); // the free review is still used; the failed refund was logged for follow-up
    expect(db.state.freeReviewsUsed).toBe(1);
  });
});

describe("refundReview", () => {
  it("never takes freeReviewsUsed below zero", async () => {
    const ok = await refundReview({ giverId: "g1", problemId: "p1", submissionId: "s1", charged: false });
    expect(ok).toBe(false);
    expect(db.state.freeReviewsUsed).toBe(0);
  });
});
