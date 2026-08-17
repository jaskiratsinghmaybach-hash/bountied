"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code2, Briefcase, Sparkles } from "lucide-react";
import { setUserRole } from "@/lib/auth/actions";

type Role = "SOLVER" | "GIVER" | "BOTH";

const roles: {
  value: Role;
  title: string;
  description: string;
  icon: typeof Code2;
}[] = [
  {
    value: "SOLVER",
    title: "I want to solve problems",
    description:
      "Browse open bounties, submit solutions, and get paid the moment your work is accepted.",
    icon: Code2,
  },
  {
    value: "GIVER",
    title: "I want problems solved",
    description:
      "Post a challenge, fund it in escrow, and only pay the solver whose submission you accept.",
    icon: Briefcase,
  },
  {
    value: "BOTH",
    title: "Both",
    description:
      "Switch between posting bounties and solving them — most people end up here eventually.",
    icon: Sparkles,
  },
];

export function RoleSelector({ name }: { name: string }) {
  const [selected, setSelected] = useState<Role | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    if (!selected) return;
    startTransition(async () => {
      await setUserRole(selected);
    });
  }

  return (
    <div className="w-full max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10 text-center"
      >
        <p className="font-mono text-xs text-primary tracking-widest uppercase mb-3">
          One quick thing, {name}
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          How do you want to use Bountied?
        </h1>
      </motion.div>

      <div className="grid gap-3">
        {roles.map((role, i) => {
          const Icon = role.icon;
          const isSelected = selected === role.value;
          const isDisabled = role.value === "BOTH";
          return (
            <motion.button
              key={role.value}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && setSelected(role.value)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
              className={`text-left rounded-lg border p-5 flex items-start gap-4 transition-all ${
                isDisabled
                  ? "border-border/50 bg-surface/50 opacity-40 cursor-not-allowed"
                  : isSelected
                    ? "border-accent bg-surface-raised"
                    : "border-border bg-surface hover:border-foreground-muted"
              }`}
            >
              <div
                className={`rounded-md p-2 shrink-0 ${
                  isSelected ? "bg-primary text-background" : "bg-surface-raised text-foreground-muted"
                }`}
              >
                <Icon size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-foreground">{role.title}</h3>
                  {isDisabled && (
                    <span className="text-[10px] font-mono tracking-wider text-foreground-muted uppercase border border-border px-1.5 py-0.5 rounded-sm bg-surface">
                      Coming Soon
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  {role.description}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            className="mt-6 flex justify-end"
          >
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="rounded-md bg-primary text-background font-medium px-6 py-2.5 text-sm hover:bg-primary/80 transition-colors disabled:opacity-60"
            >
              {isPending ? "Setting up…" : "Continue"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
