"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function relinkGithubIdentity(): Promise<
  { ok: true } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { githubAccessToken: true },
  });

  if (!profile || !profile.githubAccessToken) {
    return { error: "No GitHub connection found. Please Unlink and connect again." };
  }

  try {
    // Verify the existing token against GitHub API
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${profile.githubAccessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // Ensure we don't cache this verification request
      cache: "no-store",
    });

    if (res.status === 401) {
      return { error: "Your GitHub connection has expired or was revoked. Please Unlink and connect again." };
    }

    if (!res.ok) {
      return { error: `GitHub API error (${res.status}). Please try again later.` };
    }

    const githubUser = (await res.json()) as { login: string; avatar_url?: string };

    // Freshly update the database state
    await prisma.user.update({
      where: { id: user.id },
      data: {
        githubConnected: true,
        githubUsername: githubUser.login,
      },
    });

    revalidatePath("/integrations");
    return { ok: true };
  } catch (err: any) {
    return { error: err.message || "An unexpected error occurred." };
  }
}
