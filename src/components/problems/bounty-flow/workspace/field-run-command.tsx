type FieldRunCommandProps = {
  value: string;
  onChange: (val: string) => void;
};
export function FieldRunCommand({ value, onChange }: FieldRunCommandProps) {
  return (
    <div>
      <label htmlFor="bounty-runCommand" className="block text-xs text-foreground-muted mb-1.5">
        Run command
      </label>
      <input
        id="bounty-runCommand"
        name="runCommand"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="python main.py"
        className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors font-mono"
      />
      <p className="text-[11px] text-foreground-muted mt-1">
        The exact command your sandbox will run on every submitted repo.
        Solvers see this before submitting so they know what to expect.
      </p>
    </div>
  );
}
