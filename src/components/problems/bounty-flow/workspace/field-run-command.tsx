import { Input } from "@/components/ui/input";

type FieldRunCommandProps = {
  value: string;
  onChange: (val: string) => void;
};
export function FieldRunCommand({ value, onChange }: FieldRunCommandProps) {
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
        placeholder="python main.py"
        className="w-full bg-surface border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors font-mono"
      />
      <p className="text-[11px] text-foreground-muted mt-2 leading-relaxed">
        The exact command your sandbox will run on every submitted repo.
        Solvers see this before submitting so they know what to expect.
      </p>
    </div>
  );
}
