"use client";

import { useState } from "react";
import { Copy, Check, FileJson } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

/**
 * Shown to a Solver on the problem page before they submit — gives them
 * the standard bountied.json skeleton for the Problem's language plus a
 * ready-to-paste prompt for their own AI coding assistant to fill it in.
 *
 * Both the skeleton and the prompt are generated server-side (see
 * lib/problems/manifest-template.ts) and passed in as plain strings — this
 * component only owns the copy-tab UI, it doesn't know how either string
 * was built. Keeps this a dumb presentational piece so the actual
 * schema/prompt logic has exactly one place to change.
 */
export function ManifestHelper({
  languageLabel,
  skeleton,
  prompt,
}: {
  languageLabel: string;
  skeleton: string;
  prompt: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center gap-2 mb-1">
        <FileJson size={16} className="text-foreground" />
        <h2 className="text-sm font-medium text-foreground">
          bountied.json for this bounty
        </h2>
      </div>
      <p className="text-xs text-foreground-muted mb-4">
        Every submission needs a <code className="text-foreground">bountied.json</code> at
        the repo root so the sandbox knows how to install your dependencies. This is
        the standard {languageLabel} skeleton for this bounty — paste the prompt below
        into your AI coding assistant and it&apos;ll inspect your repo and fill in the
        real values for you.
      </p>

      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">AI prompt</TabsTrigger>
          <TabsTrigger value="skeleton">Raw skeleton</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt">
          <CopyBlock text={prompt} />
        </TabsContent>

        <TabsContent value="skeleton">
          <CopyBlock text={skeleton} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the text
      // is still fully visible and selectable below, so this is a
      // degraded-but-usable state, not a broken one. Nothing to surface.
    }
  }

  return (
    <div className="relative mt-3">
      <pre className="text-xs font-mono text-foreground bg-surface-raised rounded-md p-4 pr-12 overflow-x-auto whitespace-pre-wrap max-h-72 overflow-y-auto border border-border">
        {text}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-7 w-7 p-0 border-border bg-surface hover:bg-surface-raised"
        aria-label="Copy to clipboard"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </Button>
    </div>
  );
}
