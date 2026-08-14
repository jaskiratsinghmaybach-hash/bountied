"use client";

import type { DescriptionSections } from "@/lib/problems/description-sections";

const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all resize-y placeholder:text-foreground-muted/60";

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
    <div className="flex flex-col gap-8">
      {/* Title — large, prominent, full-width */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bounty-title" className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
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
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base font-medium text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all placeholder:text-foreground-muted/50"
        />
      </div>

      {/* Description — 3 sub-fields in a clean column */}
      <div className="grid gap-6 sm:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bounty-description" className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            Description
          </label>
          <textarea
            id="bounty-description"
            name="descriptionProblem"
            rows={5}
            value={value.description}
            onChange={(e) => patch("description", e.target.value)}
            placeholder="What's the general context? How does this fit into your product or codebase?"
            className={textareaClass}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bounty-whats-broken" className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              What&apos;s broken / needs fixing
            </label>
            <textarea
              id="bounty-whats-broken"
              name="descriptionWhatsBroken"
              rows={5}
              value={value.whatsBroken}
              onChange={(e) => patch("whatsBroken", e.target.value)}
              placeholder="Describe the symptom or bug — what's happening now that's wrong?"
              className={textareaClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="bounty-desired-output" className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Desired output / what a correct solution looks like
            </label>
            <textarea
              id="bounty-desired-output"
              name="descriptionDesiredOutput"
              rows={5}
              value={value.desiredOutput}
              onChange={(e) => patch("desiredOutput", e.target.value)}
              placeholder="What should a correct fix produce or behave like once done?"
              className={textareaClass}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

