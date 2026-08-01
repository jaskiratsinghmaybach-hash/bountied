"use client";

import { useActionState, useState } from "react";
import { Sparkles, Trophy, Users, Zap } from "lucide-react";
import { createProblem, type CreateProblemResult } from "@/lib/problems/create-actions";
import { InsufficientCreditsModal } from "@/components/payments/insufficient-credits-modal";

const TYPES: {
  value: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  hasBounty: boolean;
}[] = [
  {
    value: "OPEN_BOUNTY",
    title: "Open bounty",
    description: "Anyone can submit. You pick the best solution and pay only that solver.",
    icon: Trophy,
    hasBounty: true,
  },
  {
    value: "FIRST_TO_SOLVE",
    title: "First to solve",
    description: "Framed as a race, but you still review submissions and pick the winner.",
    icon: Zap,
    hasBounty: true,
  },
  {
    value: "INVITE_ONLY",
    title: "Invite only",
    description: "Only solvers you invite by rating or badge can see and submit.",
    icon: Users,
    hasBounty: true,
  },
  {
    value: "OPEN_FREE",
    title: "Free / practice",
    description: "No bounty attached. Good for open feedback or portfolio-building tasks.",
    icon: Sparkles,
    hasBounty: false,
  },
];

const initialState: CreateProblemResult | undefined = undefined;

export function NewBountyForm() {
  const [state, formAction, pending] = useActionState(createProblem, initialState);
  const [type, setType] = useState("OPEN_BOUNTY");
  const [bountyAmount, setBountyAmount] = useState("");
  const [modalDismissed, setModalDismissed] = useState(false);

  const selected = TYPES.find((t) => t.value === type)!;
  const platformFee = Number(bountyAmount) > 0 ? Number(bountyAmount) * 0.1 : 0;
  const totalCharge = Number(bountyAmount) > 0 ? Number(bountyAmount) + platformFee : 0;

  return (
    <>
      <form action={formAction} className="flex flex-col gap-8">
        {state && "error" in state && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {state.error}
          </p>
        )}

        <div>
          <label className="block text-xs text-foreground-muted uppercase tracking-wide mb-3">
            Bounty type
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const isSelected = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`text-left rounded-lg border p-4 flex items-start gap-3 transition-colors ${
                    isSelected
                      ? "border-accent bg-surface-raised"
                      : "border-border bg-surface hover:border-foreground-muted"
                  }`}
                >
                  <div
                    className={`rounded-md p-1.5 shrink-0 ${
                      isSelected ? "bg-accent text-background" : "bg-surface-raised text-foreground-muted"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-0.5">{t.title}</h3>
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      {t.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <input type="hidden" name="type" value={type} />
        </div>

        <div>
          <label htmlFor="title" className="block text-xs text-foreground-muted mb-1.5">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            minLength={5}
            maxLength={120}
            placeholder="Fix race condition in our WebSocket reconnect logic"
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-xs text-foreground-muted mb-1.5">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            required
            minLength={20}
            rows={6}
            placeholder="What's the problem? What does a correct solution look like? Include repro steps, constraints, and how you'll judge submissions."
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors resize-y"
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-xs text-foreground-muted mb-1.5">
            Tags <span className="text-foreground-muted">(comma-separated)</span>
          </label>
          <input
            id="tags"
            name="tags"
            placeholder="react, websockets, debugging"
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
          />
        </div>

        <div>
          <label htmlFor="deadline" className="block text-xs text-foreground-muted mb-1.5">
            Deadline <span className="text-foreground-muted">(optional)</span>
          </label>
          <input
            id="deadline"
            name="deadline"
            type="date"
            className="w-full sm:w-64 rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
          />
        </div>

        {selected.hasBounty && (
          <div className="rounded-lg border border-money/30 bg-money/5 p-5">
            <label htmlFor="bountyAmount" className="block text-xs text-foreground-muted mb-1.5">
              Bounty amount (USD)
            </label>
            <div className="relative w-full sm:w-56">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
                $
              </span>
              <input
                id="bountyAmount"
                name="bountyAmount"
                type="number"
                min={5}
                step="0.01"
                required
                value={bountyAmount}
                onChange={(e) => setBountyAmount(e.target.value)}
                placeholder="100.00"
                className="w-full rounded-md border border-border bg-surface pl-6 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors font-mono"
              />
            </div>

            {Number(bountyAmount) > 0 && (
              <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono">
                <div className="flex justify-between text-foreground-muted">
                  <span>Bounty (goes to solver)</span>
                  <span>${Number(bountyAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-foreground-muted">
                  <span>Platform fee (10%)</span>
                  <span>${platformFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-foreground font-semibold pt-1.5 border-t border-border">
                  <span>Total charged to your credits</span>
                  <span className="text-money">${totalCharge.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-accent text-background font-medium px-6 py-3 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
        >
          {pending
            ? "Posting…"
            : selected.hasBounty
              ? "Fund & post bounty"
              : "Post bounty"}
        </button>
      </form>

      {state && "insufficientCredits" in state && !modalDismissed && (
        <InsufficientCreditsModal
          required={state.required}
          draftProblemId={state.draftProblemId}
          onClose={() => setModalDismissed(true)}
        />
      )}

      {state && "insufficientCredits" in state && modalDismissed && (
        <p className="text-sm text-foreground-muted">
          Your bounty was saved as a draft — add credits any time from{" "}
          <a href="/settings" className="text-accent hover:underline">
            Settings
          </a>{" "}
          to publish it.
        </p>
      )}
    </>
  );
}
