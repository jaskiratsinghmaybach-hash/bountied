"use client";

import { Sparkles, Trophy, Users, Zap, type LucideIcon } from "lucide-react";
import { Pill } from "./pill";

export type BountyTypeValue =
  | "OPEN_BOUNTY"
  | "FIRST_TO_SOLVE"
  | "INVITE_ONLY"
  | "OPEN_FREE";

export type BountyTypeOption = {
  value: BountyTypeValue;
  title: string;
  description: string;
  icon: LucideIcon;
  hasBounty: boolean;
};

/** Same copy as legacy new-bounty-form.tsx — values must match ProblemType enum. */
export const BOUNTY_TYPE_OPTIONS: BountyTypeOption[] = [
  {
    value: "OPEN_BOUNTY",
    title: "Open bounty",
    description:
      "Anyone can submit. You pick the best solution and pay only that solver.",
    icon: Trophy,
    hasBounty: true,
  },
  {
    value: "FIRST_TO_SOLVE",
    title: "First to solve",
    description:
      "Framed as a race, but you still review submissions and pick the winner.",
    icon: Zap,
    hasBounty: true,
  },
  {
    value: "INVITE_ONLY",
    title: "Invite only",
    description:
      "Only solvers you invite by rating or badge can see and submit.",
    icon: Users,
    hasBounty: true,
  },
  {
    value: "OPEN_FREE",
    title: "Free / practice",
    description:
      "No bounty attached. Good for open feedback or portfolio-building tasks.",
    icon: Sparkles,
    hasBounty: false,
  },
];

export function getBountyTypeOption(value: string): BountyTypeOption | undefined {
  return BOUNTY_TYPE_OPTIONS.find((t) => t.value === value);
}

export function getBountyTypeSummary(value: string): string {
  return getBountyTypeOption(value)?.title ?? value;
}

export function bountyTypeHasBounty(value: string): boolean {
  return getBountyTypeOption(value)?.hasBounty ?? true;
}

type StepBountyTypeProps = {
  value: BountyTypeValue | null;
  onSelect: (value: BountyTypeValue) => void;
};

export function StepBountyType({ value, onSelect }: StepBountyTypeProps) {
  return (
    <div className="flex flex-col gap-4">
      {BOUNTY_TYPE_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <div key={option.value} className="space-y-1.5">
            <Pill
              label={option.title}
              selected={selected}
              mode="single"
              onClick={() => onSelect(option.value)}
            />
            <p className="text-xs leading-relaxed text-foreground-muted pl-0.5">
              {option.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
