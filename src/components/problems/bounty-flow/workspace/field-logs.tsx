"use client";

import { useRef } from "react";
import { FileText } from "lucide-react";

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

      <textarea
        id="bounty-logs"
        name="logs"
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste stack traces, server logs, or sandbox output…"
        className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors resize-y font-mono text-[13px]"
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex items-center gap-2 w-fit rounded-md border border-border px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors"
      >
        <FileText size={16} />
        Upload log file
      </button>
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
