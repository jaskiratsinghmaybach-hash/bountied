"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, GitCommitHorizontal, GitFork, LoaderCircle, RefreshCw, Search, TriangleAlert } from "lucide-react";

type Commit = { sha: string; shortSha: string; message: string; author: string; date: string | null; url: string | null; available: boolean };
type Reply = { commits?: Commit[]; hasMore?: boolean; error?: string };

const ago = (date: string | null) => {
  if (!date) return "Date unavailable";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

export function CommitHistoryPanel({ repoUrl, selectedSha, onSelect }: {
  repoUrl: string | null; selectedSha: string | null; onSelect: (sha: string) => void;
}) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const onSelectRef = useRef(onSelect);
  const selectedShaRef = useRef(selectedSha);
  useEffect(() => { onSelectRef.current = onSelect; selectedShaRef.current = selectedSha; }, [onSelect, selectedSha]);

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (!repoUrl) { setCommits([]); setError(null); return; }
    const id = ++requestId.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/github/repos/commits?repoUrl=${encodeURIComponent(repoUrl)}&page=${nextPage}&perPage=50`, { cache: "no-store" });
      const body = await res.json() as Reply;
      if (id !== requestId.current) return;
      if (!res.ok || !body.commits) { setError(body.error ?? "Could not load commit history."); if (!append) setCommits([]); return; }
      setCommits(old => {
        const incoming = append ? [...old, ...body.commits!] : body.commits!;
        const unique = new Map<string, Commit>();
        for (const commit of incoming) unique.set(commit.sha, commit);
        // Preserve previously seen commits so force-pushed/deleted history is
        // visible as unavailable rather than silently disappearing. Only mark
        // them unavailable after every page of the currently reachable chain is loaded.
        if (!body.hasMore) {
          try {
            const key = `bountied:commit-history:${repoUrl}`;
            const prior = JSON.parse(localStorage.getItem(key) ?? "[]") as Commit[];
            for (const oldCommit of prior) if (!unique.has(oldCommit.sha)) unique.set(oldCommit.sha, { ...oldCommit, available: false });
            localStorage.setItem(key, JSON.stringify([...unique.values()].slice(0, 1000)));
          } catch { /* Local history is a convenience, not a source of truth. */ }
        }
        return [...unique.values()];
      });
      setPage(nextPage); setHasMore(!!body.hasMore);
      if (!selectedShaRef.current && nextPage === 1 && body.commits[0]?.sha) onSelectRef.current(body.commits[0].sha);
    } catch { if (id === requestId.current) setError("Could not reach GitHub. Check your connection and retry."); }
    finally { if (id === requestId.current) { setLoading(false); setLoadingMore(false); } }
  }, [repoUrl]);

  useEffect(() => {
    // Defer the initial request so its loading-state updates happen outside
    // the synchronous effect body (React's set-state-in-effect lint rule).
    const timer = window.setTimeout(() => { void load(1, false); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  const filtered = commits.filter(c => `${c.message} ${c.author} ${c.sha}`.toLowerCase().includes(query.toLowerCase()));
  const selectedKnown = selectedSha ? commits.find(c => c.sha === selectedSha) : null;
  const unavailable = !!selectedSha && !loading && !hasMore && (!selectedKnown || !selectedKnown.available);

  return <aside className="min-w-0 rounded-xl border border-border bg-surface-raised/50 flex flex-col overflow-hidden lg:sticky lg:top-24 lg:self-start">
    <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-foreground"><GitFork size={15} /> Commit history</div><p className="mt-1 text-[11px] text-foreground-muted">Choose the exact snapshot to test and submit.</p></div>
      <button type="button" aria-label="Refresh commit history" onClick={() => void load(1, false)} disabled={!repoUrl || loading} className="rounded-md p-2 text-foreground-muted hover:bg-surface hover:text-foreground disabled:opacity-40"><RefreshCw size={14} className={loading ? "animate-spin" : ""}/></button>
    </div>
    {!repoUrl ? <div className="min-h-48 flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"><GitCommitHorizontal size={25} className="text-foreground-muted/60"/><p className="text-sm text-foreground-muted">Select a repository to explore its commits.</p><p className="text-[11px] text-foreground-muted">Your history will appear here.</p></div> : <>
      <div className="p-3 border-b border-border"><div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a commit…" aria-label="Search commits" className="w-full rounded-md border border-border bg-surface pl-8 pr-3 py-2 text-xs text-foreground outline-none focus:border-foreground-muted"/></div></div>
      {error && <div className="m-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger"><div className="flex items-center gap-2"><TriangleAlert size={14}/><span>{error}</span></div><button type="button" className="mt-2 underline" onClick={() => void load(1, false)}>Try again</button></div>}
      {unavailable && <div className="mx-3 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200"><div className="font-medium">Selected commit not in the loaded history</div><p className="mt-1 opacity-80">Load older commits or refresh. If GitHub no longer exposes it, select an available commit before testing or submitting.</p></div>}
      <div className="max-h-[min(62vh,620px)] min-h-48 overflow-y-auto overscroll-contain p-2" aria-label="Scrollable commit history">
        {loading && commits.length === 0 ? <div className="flex items-center justify-center gap-2 py-10 text-xs text-foreground-muted"><LoaderCircle size={14} className="animate-spin"/>Loading history…</div> : filtered.length === 0 ? <p className="px-3 py-8 text-center text-xs text-foreground-muted">{commits.length ? "No commits match that search." : "No commits found."}</p> : <div className="relative pl-2">{filtered.map((commit, i) => {
          const selected = selectedSha === commit.sha;
          return <div key={commit.sha} className="relative pl-6 pb-1" onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHovered(commit.sha), 500); }} onMouseLeave={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHovered(v => v === commit.sha ? null : v); }}>
            <span className={`absolute left-[5px] top-[17px] z-[1] h-2.5 w-2.5 rounded-full border-2 ${selected ? "border-accent bg-accent" : "border-foreground-muted/50 bg-surface"}`} />
            {i !== filtered.length - 1 && <span className="absolute left-[9px] top-6 bottom-[-3px] w-px bg-border"/>}
            <button type="button" disabled={!commit.available} onClick={() => onSelect(commit.sha)} aria-pressed={selected} className={`group w-full rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${!commit.available ? "border-dashed border-amber-500/30 opacity-60" : selected ? "border-accent/50 bg-accent/5 shadow-sm" : "border-transparent hover:border-border hover:bg-surface"}`}>
              <div className="flex items-start justify-between gap-2"><span className={`text-xs font-medium leading-5 line-clamp-2 ${selected ? "text-foreground" : "text-foreground/90"}`}>{commit.message}</span>{selected && <Check size={14} className="mt-0.5 shrink-0 text-accent"/>}</div>
              <div className="mt-2 flex items-center justify-between gap-2"><code className="text-[10px] text-foreground-muted">{commit.shortSha}</code><span className="truncate text-[10px] text-foreground-muted">{!commit.available ? "Unavailable on GitHub" : commit.author}</span></div>
            </button>
            {hovered === commit.sha && <div role="tooltip" className="absolute left-8 right-1 top-full z-20 mt-1 rounded-lg border border-border bg-surface p-3 shadow-xl"><p className="text-xs font-medium text-foreground">{commit.message}</p><p className="mt-1 text-[11px] text-foreground-muted">{ago(commit.date)} · {commit.author}</p><div className="mt-2 flex items-center justify-between gap-2"><code className="text-[10px] text-foreground-muted">{commit.sha}</code>{commit.url && <a href={commit.url} target="_blank" rel="noreferrer" className="text-[10px] underline text-foreground-muted hover:text-foreground">View on GitHub</a>}</div></div>}
          </div>;
        })}</div>}
        {hasMore && <button type="button" disabled={loadingMore} onClick={() => void load(page + 1, true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground-muted hover:bg-surface disabled:opacity-50">{loadingMore ? <LoaderCircle size={13} className="animate-spin"/> : <ChevronDown size={13}/>} Load older commits</button>}
      </div>
      {selectedKnown && <div className="border-t border-border bg-surface px-3 py-3"><div className="flex items-center gap-2 text-[11px] text-emerald-400"><Check size={13}/> Commit selected</div><code className="mt-1 block text-[10px] text-foreground-muted break-all">{selectedKnown.sha}</code><p className="mt-1 text-[10px] text-foreground-muted">Tests and submission will target this snapshot.</p></div>}
    </>}
  </aside>;
}
