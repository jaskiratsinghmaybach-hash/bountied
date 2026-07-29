"use client";

import { motion } from "framer-motion";

interface BountyTicketProps {
  title: string;
  tags: string[];
  bounty: string;
  solverCount: number;
  status: "open" | "in_review" | "completed";
  delay?: number;
}

const statusConfig = {
  open: { label: "OPEN", color: "text-accent", dot: "bg-accent" },
  in_review: { label: "IN REVIEW", color: "text-money", dot: "bg-money" },
  completed: { label: "COMPLETED", color: "text-foreground-muted", dot: "bg-foreground-muted" },
};

export function BountyTicket({
  title,
  tags,
  bounty,
  solverCount,
  status,
  delay = 0,
}: BountyTicketProps) {
  const cfg = statusConfig[status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg border border-border bg-surface p-5 w-full max-w-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          <span className={`text-xs font-mono font-medium tracking-wide ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <span className="text-xs text-foreground-muted font-mono">
          {solverCount} solving
        </span>
      </div>

      <h3 className="text-foreground font-medium text-[15px] mb-2 leading-snug">
        {title}
      </h3>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-[11px] font-mono text-foreground-muted bg-surface-raised px-2 py-0.5 rounded border border-border"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-end justify-between pt-3 border-t border-border">
        <span className="text-[11px] text-foreground-muted uppercase tracking-wide">
          Bounty
        </span>
        <span className="font-mono text-lg font-semibold text-money">
          {bounty}
        </span>
      </div>
    </motion.div>
  );
}
