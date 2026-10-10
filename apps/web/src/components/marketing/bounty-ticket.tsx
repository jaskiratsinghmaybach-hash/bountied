"use client";

import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BountyTicketProps {
  title: string;
  tags: string[];
  bounty: string;
  solverCount: number;
  status: "open" | "in_review" | "completed";
  delay?: number;
}

const statusConfig = {
  open: { label: "OPEN", color: "text-primary", dot: "bg-primary" },
  in_review: { label: "IN REVIEW", color: "text-emerald-500", dot: "bg-emerald-500" },
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
      className="w-full max-w-sm"
    >
      <Card className="p-5 bg-surface border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            <span className={`text-xs font-mono font-medium tracking-wide ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <span className="text-xs text-foreground-muted font-mono">
            {solverCount} active solvers
          </span>
        </div>

        <h3 className="text-foreground font-medium text-[15px] mb-2 leading-snug">
          {title}
        </h3>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[11px] font-mono font-normal rounded-sm px-2 py-0.5"
            >
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-end justify-between pt-3 border-t border-border">
          <span className="text-[11px] text-foreground-muted uppercase tracking-wide">
            Reward
          </span>
          <span className="font-mono text-lg font-semibold text-emerald-500">
            {bounty}
          </span>
        </div>
      </Card>
    </motion.div>
  );
}
