"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BountyTicket } from "./bounty-ticket";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function Hero() {
  const router = useRouter();
  const supabase = createClient();

  async function handleCta(target: "login" | "signup") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push(target === "login" ? "/login" : "/signup");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <section className="relative border-b border-border">
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
            className="font-mono text-xs text-primary tracking-widest uppercase mb-5"
          >
            Escrow-backed &middot; No bidding &middot; No proposals
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-6"
          >
            Ship code faster.
            <br />
            Fund the bounty.
            <br />
            <span className="text-foreground-muted">Pay on approval.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-foreground-muted text-lg leading-relaxed mb-8 max-w-md"
          >
            Escrow-backed code bounties solved by verified developers. No
            resumes, no long hiring calls, no upfront risk — money is released
            only when a working solution passes your review.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap gap-3"
          >
            <Button
              type="button"
              size="lg"
              className="px-5 py-2.5 h-auto text-sm"
              onClick={() => handleCta("signup")}
            >
              Launch a Bounty
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-5 py-2.5 h-auto text-sm"
              onClick={() => handleCta("login")}
            >
              Solve & Earn
            </Button>
          </motion.div>
        </div>

        {/* Signature element: stacked, slightly offset bounty tickets — a live problem feed, not a stock hero image */}
        <div className="relative flex flex-col gap-4 md:pl-8">
          <BountyTicket
            title="Fix WebSocket reconnect race condition in Next.js backend"
            tags={["typescript", "next.js", "websockets"]}
            bounty="$85"
            solverCount={7}
            status="open"
            delay={0.2}
          />
          <div className="md:pl-6">
            <BountyTicket
              title="Optimize Django ORM N+1 query for 100k+ order records"
              tags={["python", "django", "postgresql"]}
              bounty="$120"
              solverCount={12}
              status="in_review"
              delay={0.35}
            />
          </div>
          <div className="md:pl-2">
            <BountyTicket
              title="Automate 3D mesh generation via Blender Python API"
              tags={["python", "blender-3d", "cad"]}
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
