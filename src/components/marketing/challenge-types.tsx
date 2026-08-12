"use client";

import { motion } from "framer-motion";

const types = [
  {
    name: "Open Challenges",
    price: "Open Bounties",
    description:
      "Open to all developers. Post free issues for community support, or attach an escrow bounty to get instant priority submissions.",
    live: true,
  },
  {
    name: "First to Solve",
    price: "Sprint Format",
    description:
      "High-velocity bounty race. Solvers submit fast, verified fixes — funds are released to the first solution that passes review.",
    live: true,
  },
  {
    name: "Invite Only",
    price: "Vetted Solvers",
    description:
      "Target top-rated engineers directly. Restrict access to top-tier solvers based on reputation score and verified badge history.",
    live: true,
  },
  {
    name: "Fixed Price",
    price: "Enterprise",
    description:
      "Scoped milestone contracts for complex features or entire repositories. Designed for teams needing dedicated engineering bandwidth.",
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
          Built for Every Engineering Task
        </h2>
        <p className="text-foreground-muted leading-relaxed">
          Every bounty is 100% funded in escrow before going live — solvers code with guaranteed payouts, givers pay only for results.
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
