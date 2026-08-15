"use client";

import { useState, useRef, useEffect } from "react";
import { FaGithub } from "react-icons/fa";
import { CheckCircle2, MoreVertical, RefreshCw, Unplug, TriangleAlert } from "lucide-react";
import { unlinkGithubIdentity } from "@/lib/auth/unlink-github";
import { relinkGithubIdentity } from "@/lib/auth/relink-github";

export function GithubConnectedCard() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleUnlink() {
    setPending(true);
    setError(null);
    const res = await unlinkGithubIdentity();
    if ("error" in res) {
      setError(res.error);
      setPending(false);
    }
    // If successful, the server action revalidates the page, which will cause this component to unmount
    // and show the ConnectGithubPrompt instead.
  }

  async function handleRelink() {
    setPending(true);
    setError(null);
    
    const res = await relinkGithubIdentity();
    if ("error" in res) {
      setError(res.error);
    }
    setPending(false);
    setOpen(false);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5 flex items-start gap-4">
      <FaGithub size={20} className="text-foreground shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-foreground mb-1">GitHub</p>
            <p className="text-xs text-foreground-muted mb-3">
              Your GitHub account is connected. We have access to your repositories.
            </p>
          </div>
          
          <div className="relative" ref={containerRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="p-1.5 text-foreground-muted hover:text-foreground rounded-md hover:bg-surface-raised transition-colors"
              disabled={pending}
            >
              <MoreVertical size={16} />
            </button>
            
            {open && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-md border border-border bg-surface shadow-lg overflow-hidden z-10 flex flex-col p-1">
                <button
                  type="button"
                  onClick={handleRelink}
                  className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-raised transition-colors rounded-sm text-foreground"
                >
                  <RefreshCw size={14} className="text-foreground-muted" />
                  Relink
                </button>
                <button
                  type="button"
                  onClick={handleUnlink}
                  className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-raised transition-colors rounded-sm text-danger"
                >
                  <Unplug size={14} className="opacity-80" />
                  Unlink
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 mb-3 text-xs text-danger">
            <TriangleAlert size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-emerald-500">
          <CheckCircle2 size={14} />
          <span>Connected</span>
          {pending && <span className="text-foreground-muted ml-2 animate-pulse">Working...</span>}
        </div>
      </div>
    </div>
  );
}
