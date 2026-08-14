"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaGithub, FaLock } from "react-icons/fa";
import { ChevronDown, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { GithubRepoOption } from "@/app/api/github/repos/route";

/**
 * Replaces a free-text repo URL field with a real dropdown of the
 * solver's own GitHub repos, fetched via /api/github/repos. Eliminates
 * an entire failure mode (typo'd URLs that only surface as an error deep
 * inside sandbox execution) by only ever letting the solver pick from
 * repos that genuinely exist and that their token can access.
 *
 * Renders the selected repo's real GitHub URL into a hidden input named
 * "repoUrl" so the surrounding <form> (and the server action reading
 * FormData) doesn't need to change at all — this is a drop-in swap for
 * the old plain <input name="repoUrl">.
 */
export function RepoSelector({
  defaultValue,
  onSelectionChange,
  excludeUrls,
  onSelect,
}: {
  defaultValue?: string;
  /** Called with true/false whenever a repo becomes selected/deselected — lets the parent form gate its submit button without needing to read the hidden input's value directly. */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** URLs already chosen upstream — hide them from the dropdown so the giver can't pick the same repo twice. */
  excludeUrls?: string[];
  /** When provided, called with the chosen GithubRepoOption instead of (or in addition to) writing to the hidden input. Used by FieldRepos for multi-repo picking. */
  onSelect?: (repo: GithubRepoOption) => void;
}) {
  const [repos, setRepos] = useState<GithubRepoOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GithubRepoOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onSelectionChange?.(selected !== null);
  }, [selected, onSelectionChange]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/github/repos");
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Could not load your repos.");
        } else {
          setRepos(data.repos as GithubRepoOption[]);
          if (defaultValue) {
            const match = (data.repos as GithubRepoOption[]).find(
              (r) => r.htmlUrl === defaultValue
            );
            if (match) setSelected(match);
          }
        }
      } catch {
        if (!cancelled) setError("Could not reach the server to load your repos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!repos) return [];
    const base = excludeUrls?.length
      ? repos.filter((r) => !excludeUrls.includes(r.htmlUrl))
      : repos;
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, query, excludeUrls]);

  if (loading) {
    return (
      <div className="rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground-muted">
        Loading your repos…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 flex items-start gap-2 text-xs text-danger">
        <TriangleAlert size={13} className="shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span>{error}</span>
          <Link href="/integrations" className="underline hover:text-danger/80">
            Go to Integrations to setup the GitHub for accessing your repo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name="repoUrl" value={selected?.htmlUrl ?? ""} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-md border border-border bg-surface-raised pl-8 pr-3 py-2.5 text-sm text-left outline-none focus:border-accent transition-colors relative"
      >
        <FaGithub
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
        />
        <span className={selected ? "text-foreground font-mono" : "text-foreground-muted"}>
          {selected ? selected.fullName : "Select a repository…"}
        </span>
        <ChevronDown size={14} className="text-foreground-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-surface shadow-lg max-h-72 overflow-hidden flex flex-col">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your repos…"
            className="px-3 py-2.5 text-sm bg-surface-raised text-foreground outline-none border-b border-border font-mono"
          />
          <div className="overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-foreground-muted">
                {repos?.length === 0
                  ? "No repos found on your connected GitHub account."
                  : "No repos match your search."}
              </p>
            )}
            {filtered.map((repo) => (
              <button
                key={repo.fullName}
                type="button"
                onClick={() => {
                  setSelected(repo);
                  setOpen(false);
                  setQuery("");
                  onSelect?.(repo);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-raised transition-colors"
              >
                {repo.private && (
                  <FaLock size={10} className="text-foreground-muted shrink-0" />
                )}
                <span className="font-mono text-foreground truncate">{repo.fullName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}