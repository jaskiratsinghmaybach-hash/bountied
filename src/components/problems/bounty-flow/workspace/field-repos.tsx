"use client";

import { RepoSelector } from "@/components/problems/repo-selector";
import { ConnectGithubPrompt } from "@/components/auth/connect-github-prompt";
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
      <ConnectGithubPrompt reason="Connect GitHub to attach reference repositories solvers should work against — same verified-repo flow as submissions, no manual URLs." />
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
