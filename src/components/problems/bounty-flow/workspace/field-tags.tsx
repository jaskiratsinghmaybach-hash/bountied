type FieldTagsProps = {
  value: string;
  onChange: (val: string) => void;
};
export function FieldTags({ value, onChange }: FieldTagsProps) {
  return (
    <div>
      <label htmlFor="bounty-tags" className="block text-xs font-medium uppercase tracking-wide text-foreground-muted mb-2">
        Tags <span className="normal-case font-normal text-foreground-muted">(comma-separated)</span>
      </label>
      <input
        id="bounty-tags"
        name="tags"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="react, websockets, debugging"
        className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
      />
    </div>
  );
}
