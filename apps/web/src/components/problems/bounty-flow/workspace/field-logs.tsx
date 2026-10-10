"use client";

import { useRef } from "react";
import { FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type FieldLogsProps = {
  value: string;
  onChange: (value: string) => void;
};

export function FieldLogs({ value, onChange }: FieldLogsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      onChange(value ? `${value}\n\n${text}` : text);
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-foreground-muted leading-relaxed">
        Optional logs — paste output directly or upload a <span className="font-mono">.txt</span> /{" "}
        <span className="font-mono">.log</span> file.
      </p>

      <Textarea
        id="bounty-logs"
        name="logs"
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste stack traces, server logs, or sandbox output…"
        className="w-full bg-surface border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors resize-y font-mono text-[13px]"
      />

      <Button
        type="button"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-2 w-fit border border-border text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors px-3 py-2 text-sm h-auto"
      >
        <FileText size={16} />
        Upload log file
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.log,text/plain"
        className="sr-only"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
