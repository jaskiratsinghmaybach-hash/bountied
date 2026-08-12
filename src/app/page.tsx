import { BountyTicket } from "@/components/marketing/bounty-ticket";
import { Hero } from "@/components/marketing/hero";
import { ChallengeTypes } from "@/components/marketing/challenge-types";

export default function Home() {
  return (
    <main className="flex-1 min-h-0 overflow-y-auto">
      <Hero />
      <ChallengeTypes />
    </main>
  );
}
