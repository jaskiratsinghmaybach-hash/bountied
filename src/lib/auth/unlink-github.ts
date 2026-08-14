"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function unlinkGithubIdentity(): Promise<
  { ok: true } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const { data, error: listError } = await supabase.auth.getUserIdentities();

  if (listError) return { error: listError.message };

  const identities = data?.identities ?? [];
  const githubIdentity = identities.find(
    (i: { provider: string }) => i.provider === "github"
  );
  
  if (!githubIdentity) {
    // If not found in auth but DB says it's connected, we should still clear the DB.
    await prisma.user.update({
      where: { id: user.id },
      data: { githubConnected: false, githubAccessToken: null },
    });
    revalidatePath("/integrations");
    return { ok: true };
  }
  
  if (identities.length < 2) {
    return {
      error:
        "This account only has one linked identity — unlinking would lock you out. Aborting.",
    };
  }

  const { error: unlinkError } = await supabase.auth.unlinkIdentity(githubIdentity);
  if (unlinkError) return { error: unlinkError.message };

  await prisma.user.update({
    where: { id: user.id },
    data: { githubConnected: false, githubAccessToken: null },
  });

  revalidatePath("/integrations");
  return { ok: true };
}
