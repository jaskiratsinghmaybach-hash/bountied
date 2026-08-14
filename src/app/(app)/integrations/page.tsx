import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { ConnectGithubPrompt } from "@/components/auth/connect-github-prompt";
import { GithubConnectedCard } from "@/components/auth/github-connected-card";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");

  return (
    <main className="px-8 py-10 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Integrations</h1>
      <p className="text-sm text-foreground-muted mb-8">
        Connect your accounts to unlock features like syncing repositories and automated payments.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GitHub Integration */}
        {profile.githubConnected ? (
          <GithubConnectedCard />
        ) : (
          <ConnectGithubPrompt reason="Connect your GitHub account to link your repositories to bounties and submit solutions." />
        )}

        {/* Placeholder for future integrations */}
        <div className="rounded-lg border border-border bg-surface-raised opacity-60 p-5 flex items-start gap-4 cursor-not-allowed">
          <div className="w-5 h-5 rounded-full bg-border shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground mb-1">Slack (Coming Soon)</p>
            <p className="text-xs text-foreground-muted">
              Get notifications for new bounties, submissions, and payments directly in your Slack workspace.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
