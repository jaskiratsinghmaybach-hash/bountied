"use client";

import type { DescriptionSections } from "@/lib/problems/description-sections";

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors resize-y";

type FieldDescriptionProps = {
  value: DescriptionSections;
  onChange: (next: DescriptionSections) => void;
  title: string;
  onTitleChange: (title: string) => void;
};

export function FieldDescription({
  value,
  onChange,
  title,
  onTitleChange,
}: FieldDescriptionProps) {
  function patch(field: keyof DescriptionSections, text: string) {
    onChange({ ...value, [field]: text });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label htmlFor="bounty-title" className="block text-xs text-foreground-muted mb-1.5">
          Title
        </label>
        <input
          id="bounty-title"
          name="title"
          type="text"
          required
          minLength={5}
          maxLength={120}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Fix race condition in our WebSocket reconnect logic"
          className={`${fieldClass} resize-none`}
        />
      </div>

      <div>
        <label
          htmlFor="bounty-description"
          className="block text-xs text-foreground-muted mb-1.5"
        >
          Description
        </label>
        <textarea
          id="bounty-description"
          name="descriptionProblem"
          rows={5}
          value={value.description}
          onChange={(e) => patch("description", e.target.value)}
          placeholder="What's the general context? How does this fit into your product or codebase?"
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor="bounty-whats-broken"
          className="block text-xs text-foreground-muted mb-1.5"
        >
          What&apos;s broken / needs fixing
        </label>
        <textarea
          id="bounty-whats-broken"
          name="descriptionWhatsBroken"
          rows={4}
          value={value.whatsBroken}
          onChange={(e) => patch("whatsBroken", e.target.value)}
          placeholder="Describe the symptom or bug — what's happening now that's wrong?"
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor="bounty-desired-output"
          className="block text-xs text-foreground-muted mb-1.5"
        >
          Desired output / what a correct solution looks like
        </label>
        <textarea
          id="bounty-desired-output"
          name="descriptionDesiredOutput"
          rows={4}
          value={value.desiredOutput}
          onChange={(e) => patch("desiredOutput", e.target.value)}
          placeholder="What should a correct fix produce or behave like once done?"
          className={fieldClass}
        />
      </div>
    </div>
  );
}
