"use client";

import { motion } from "framer-motion";
import { BountyTicket } from "./bounty-ticket";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Ambient grid texture — quiet, not a scroll-triggered gimmick */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="font-mono text-xs text-accent tracking-widest uppercase mb-5"
          >
            Escrow-backed &middot; No connects &middot; No proposals
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-6"
          >
            Post a problem.
            <br />
            Fund the bounty.
            <br />
            <span className="text-foreground-muted">Pay who you accept.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-foreground-muted text-lg leading-relaxed mb-8 max-w-md"
          >
            Real programming problems, solved by real people, for real money
            held in escrow before anyone writes a line of code. No formal
            hiring process — just the fastest or best accepted solution wins.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap gap-3"
          >
            <button className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors">
              Post a challenge
            </button>
            <button className="rounded-md border border-border text-foreground font-medium px-5 py-2.5 text-sm hover:bg-surface transition-colors">
              Browse open bounties
            </button>
          </motion.div>
        </div>

        {/* Signature element: stacked, slightly offset bounty tickets — a live problem feed, not a stock hero image */}
        <div className="relative flex flex-col gap-4 md:pl-8">
          <BountyTicket
            title="Fix race condition in WebSocket reconnect logic"
            tags={["typescript", "websockets"]}
            bounty="$85"
            solverCount={7}
            status="open"
            delay={0.2}
          />
          <div className="md:pl-6">
            <BountyTicket
              title="Optimize N+1 query in Django ORM order pipeline"
              tags={["python", "django", "postgres"]}
              bounty="$120"
              solverCount={12}
              status="in_review"
              delay={0.35}
            />
          </div>
          <div className="md:pl-2">
            <BountyTicket
              title="Parametric Blender script for cultivator model"
              tags={["python", "blender"]}
              bounty="$60"
              solverCount={3}
              status="open"
              delay={0.5}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
