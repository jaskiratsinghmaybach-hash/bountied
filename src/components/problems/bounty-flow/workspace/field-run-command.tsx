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
      <input
        id="bounty-runCommand"
        name="runCommand"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="python main.py"
        className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all font-mono"
      />
      <p className="text-[11px] text-foreground-muted mt-2 leading-relaxed">
        The exact command your sandbox will run on every submitted repo.
        Solvers see this before submitting so they know what to expect.
      </p>
    </div>
  );
}
