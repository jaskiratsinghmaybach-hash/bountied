"use client";

import { useState } from "react";
import { Info, Sparkles, Trophy, Users, Zap, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { flowEase, flowTransition } from "./motion";

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
  const [hoveredInfoId, setHoveredInfoId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {BOUNTY_TYPE_OPTIONS.map((option) => {
        const selected = value === option.value;
        const Icon = option.icon;
        
        // Is this card's info showing?
        const infoVisible = hoveredInfoId === option.value;
        
        return (
          <div 
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={cn(
              "relative flex flex-col justify-center items-start gap-3 rounded-xl border p-5 text-left cursor-pointer transition-colors h-28",
              selected 
                ? "border-2 border-border-strong bg-foreground text-background" 
                : "border-border bg-surface hover:border-foreground-muted text-foreground"
            )}
          >
            <div className="absolute top-2.5 right-2.5">
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setHoveredInfoId(option.value)}
                onMouseLeave={() => setHoveredInfoId(null)}
                className={cn(
                  "transition-colors p-1.5",
                  selected ? "text-background/70 hover:text-background" : "text-foreground-muted hover:text-foreground"
                )}
                aria-label="More info"
              >
                <Info size={14} />
              </button>
              
              <AnimatePresence>
                {infoVisible && (
                  <motion.div
                    initial={{ opacity: 0, x: -4, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -4, scale: 0.95 }}
                    transition={{ ...flowTransition, ease: flowEase, duration: 0.15 }}
                    className="absolute z-50 top-0 left-full ml-2 w-60 p-3 rounded-lg border border-border bg-surface shadow-xl cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs leading-relaxed text-foreground-muted">
                      {option.description}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Icon size={22} className={selected ? "text-background" : "text-foreground-muted"} />
            <span className={cn(
              "font-medium text-sm",
              selected ? "text-background" : "text-foreground"
            )}>
              {option.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
