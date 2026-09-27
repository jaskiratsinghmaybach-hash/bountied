import { Input } from "@/components/ui/input";

const RUN_COMMAND_PLACEHOLDERS: Record<string, string> = {
  python: "python main.py",
  nodejs: "node index.js",
  typescript: "npx tsx index.ts",
};

type FieldRunCommandProps = {
  value: string;
  onChange: (val: string) => void;
  languageId?: string | null;
};
export function FieldRunCommand({ value, onChange, languageId }: FieldRunCommandProps) {
  const placeholder =
    (languageId && RUN_COMMAND_PLACEHOLDERS[languageId]) || "python main.py";
  return (
    <div>
      <label htmlFor="bounty-runCommand" className="block text-xs font-medium uppercase tracking-wide text-foreground-muted mb-2">
        Run command
      </label>
      <Input
        id="bounty-runCommand"
        name="runCommand"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors font-mono"
      />
      <p className="text-[11px] text-foreground-muted mt-2 leading-relaxed">
        The exact command your sandbox will run on every submitted repo.
        Solvers see this before submitting so they know what to expect.
      </p>
    </div>
  );
}
