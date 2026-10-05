import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { getPairingForReview } from "@/lib/desktop/pairing";
import { clientIp } from "@/lib/desktop/ratelimit";
import { AuthorizeCard } from "@/components/desktop/authorize-card";

export const dynamic = "force-dynamic";

const NOT_VALID =
  "This connection request is no longer valid. Open Bountied Desktop and choose Connect to start again.";

export default async function ConnectDesktopPage({
  searchParams,
}: {
  searchParams: Promise<{ req?: string }>;
}) {
  const { req } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const back = `/desktop/connect?req=${encodeURIComponent(req ?? "")}`;
    redirect(`/login?redirectedFrom=${encodeURIComponent(back)}`);
  }
  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");
  if (!profile.role) redirect("/onboarding");

  const pairing = req ? await getPairingForReview(req, profile.id) : null;
  const usable = pairing && !pairing.consumedAt && pairing.expiresAt > new Date();
  const alreadyIssued = usable && pairing.userId === profile.id && pairing.authorizedAt;

  // Helps the user spot a request that did not originate on their own machine.
  const browserIp = clientIp(await headers());
  const differentNetwork = Boolean(pairing?.startIp && browserIp !== "unknown" && pairing.startIp !== browserIp);

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        {!usable ? (
          <div className="rounded-lg border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold tracking-tight mb-2">Request not available</h1>
            <p className="text-sm text-foreground-muted">{NOT_VALID}</p>
          </div>
        ) : alreadyIssued ? (
          <div className="rounded-lg border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold tracking-tight mb-2">Code already generated</h1>
            <p className="text-sm text-foreground-muted">
              For your security a code is shown only once. If you didn&apos;t copy it, return to Bountied
              Desktop and choose Connect to start a new request.
            </p>
          </div>
        ) : (
          <AuthorizeCard
            pairingId={pairing.id}
            account={{ name: profile.name, email: profile.email }}
            device={{ name: pairing.deviceName, platform: pairing.platform, appVersion: pairing.appVersion }}
            requestedAt={pairing.createdAt.toISOString()}
            requestExpiresAt={pairing.expiresAt.toISOString()}
            differentNetwork={differentNetwork}
          />
        )}
      </div>
    </main>
  );
}
