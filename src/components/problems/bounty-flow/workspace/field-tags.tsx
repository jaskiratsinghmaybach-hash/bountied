import { Input } from "@/components/ui/input";

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
      <Input
        id="bounty-tags"
        name="tags"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="react, websockets, debugging"
        className="w-full bg-surface border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors"
      />
    </div>
  );
}
