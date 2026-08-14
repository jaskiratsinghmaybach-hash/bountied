type FieldTagsProps = {
  value: string;
  onChange: (val: string) => void;
};
export function FieldTags({ value, onChange }: FieldTagsProps) {
  return (
    <div>
      <label htmlFor="bounty-tags" className="block text-xs text-foreground-muted mb-1.5">
        Tags <span className="text-foreground-muted">(comma-separated)</span>
      </label>
      <input
        id="bounty-tags"
        name="tags"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="react, websockets, debugging"
        className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
      />
    </div>
  );
}
