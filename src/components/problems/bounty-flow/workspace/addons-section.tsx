import { useState } from "react";
import { Pill } from "../pill";
import { Input } from "@/components/ui/input";
import { getAddonsForLanguage } from "../flow-addons";
import { isScopeSelectionEnabled } from "../flow-data";

type AddonsSectionProps = {
  languageId: string | null;
  value: string[];
  onChange: (addons: string[]) => void;
};

export function AddonsSection({ languageId, value, onChange }: AddonsSectionProps) {
  const [customAddon, setCustomAddon] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  if (!languageId) return null;
  const defs = getAddonsForLanguage(languageId);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function commitCustom() {
    const trimmed = customAddon.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setCustomAddon("");
    setIsAddingCustom(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="addons" value={JSON.stringify(value)} />
      <div className="flex flex-wrap gap-2">
        {defs.map((def) => (
          <Pill
            key={def.id}
            mode="multi"
            selected={value.includes(def.id)}
            onClick={() => toggle(def.id)}
            disabled={!isScopeSelectionEnabled(languageId)}
            label={def.label}
          />
        ))}
        {value.filter(v => !defs.find(d => d.id === v)).map(custom => (
          <Pill
            key={custom}
            mode="multi"
            selected={true}
            onClick={() => toggle(custom)}
            disabled={false}
            label={custom}
          />
        ))}
        {isAddingCustom ? (
          <Input
            type="text"
            autoFocus
            value={customAddon}
            onChange={(e) => setCustomAddon(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCustom();
              }
            }}
            placeholder="Other addon…"
            className="h-auto w-auto rounded-full border border-border bg-surface-raised px-4 py-1.5 text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong"
          />
        ) : (
          <Pill
            mode="multi"
            selected={false}
            onClick={() => setIsAddingCustom(true)}
            disabled={false}
            label="+ Other (specify)"
          />
        )}
      </div>
    </div>
  );
}
