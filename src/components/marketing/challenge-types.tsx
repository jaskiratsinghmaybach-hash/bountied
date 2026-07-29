"use client";

import { motion } from "framer-motion";

const types = [
  {
    name: "Open Challenges",
    price: "Free or bountied",
    description:
      "Anyone can attempt these. Post for practice with no money attached, or add a bounty to attract serious solvers.",
    live: true,
  },
  {
    name: "First to Solve",
    price: "Bountied only",
    description:
      "The race format. Every submission is funded before it's posted — the giver picks the fastest accurate solution.",
    live: true,
  },
  {
    name: "Invite Only",
    price: "Bountied",
    description:
      "Bring your rated, badge-holding solvers directly onto your project. Built for ongoing work with people you trust.",
    live: true,
  },
  {
    name: "Fixed Price",
    price: "Enterprise",
    description:
      "Traditional scoped engagements with premium tooling. Built for teams that need more than a single bounty.",
    live: false,
  },
];

export function ChallengeTypes() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mb-12 max-w-xl"
      >
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Four ways to get a problem solved
        </h2>
        <p className="text-foreground-muted leading-relaxed">
          Every paid format is escrow-funded before it goes live — solvers
          never race for money that might not exist.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-4">
        {types.map((type, i) => (
          <motion.div
            key={type.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className={`rounded-lg border border-border p-6 ${
              type.live ? "bg-surface" : "bg-surface/50"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-foreground">{type.name}</h3>
              {!type.live && (
                <span className="text-[10px] font-mono uppercase tracking-wide text-foreground-muted border border-border rounded px-1.5 py-0.5">
                  Coming soon
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-accent-dim mb-3">
              {type.price}
            </p>
            <p className="text-sm text-foreground-muted leading-relaxed">
              {type.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
