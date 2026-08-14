"use client";

import { RepoSelector } from "@/components/problems/repo-selector";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { GithubRepoOption } from "@/app/api/github/repos/route";

type FieldReposProps = {
  githubConnected: boolean;
  value: string[];
  onChange: (urls: string[]) => void;
  maxRepos?: number;
};

export function FieldRepos({
  githubConnected,
  value,
  onChange,
  maxRepos = 3,
}: FieldReposProps) {
  if (!githubConnected) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-foreground-muted leading-relaxed">
          Up to {maxRepos} repos the solver should reference (your project, a repro
          repo, etc.). Optional for drafts; required to publish.
        </p>
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 flex items-start gap-2 text-xs text-danger">
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span>GitHub not connected</span>
            <Link href="/integrations" className="underline hover:text-danger/80">
              Go to Integrations to setup the GitHub for accessing your repo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const atMax = value.length >= maxRepos;

  function addRepo(url: string) {
    if (!url || value.includes(url) || value.length >= maxRepos) return;
    onChange([...value, url]);
  }

  function removeRepo(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-foreground-muted leading-relaxed">
        Up to {maxRepos} repos the solver should reference (your project, a repro
        repo, etc.). Optional for drafts; required to publish.
      </p>

      {value.map((url) => (
        <div
          key={url}
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <span className="text-sm font-mono text-foreground truncate">{url}</span>
          <button
            type="button"
            onClick={() => removeRepo(url)}
            className="shrink-0 text-xs text-foreground-muted hover:text-danger transition-colors"
          >
            Remove
          </button>
        </div>
      ))}

      {!atMax && (
        <RepoSelector
          excludeUrls={value}
          onSelect={(repo: GithubRepoOption) => addRepo(repo.htmlUrl)}
        />
      )}

      {atMax && (
        <p className="text-xs text-foreground-muted">
          Maximum of {maxRepos} repositories reached.
        </p>
      )}
    </div>
  );
}
