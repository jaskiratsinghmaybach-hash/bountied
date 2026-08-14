"use client";

import { Pill } from "./pill";
import {
  getLanguageLabel,
  LANGUAGE_SECTIONS,
  getLanguagesBySection,
  type LanguageDef,
} from "./flow-data";

export function getLanguageSummary(languageId: string): string {
  return getLanguageLabel(languageId);
}

type StepLanguageProps = {
  value: string | null;
  onSelect: (languageId: string) => void;
};

export function StepLanguage({ value, onSelect }: StepLanguageProps) {
  return (
    <div className="flex flex-col gap-6">
      {LANGUAGE_SECTIONS.map((section) => (
        <LanguageSectionGroup
          key={section.id}
          title={section.title}
          languages={getLanguagesBySection(section.id)}
          selectedId={value}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function LanguageSectionGroup({
  title,
  languages,
  selectedId,
  onSelect,
}: {
  title: string;
  languages: LanguageDef[];
  selectedId: string | null;
  onSelect: (languageId: string) => void;
}) {
  return (
    <section>
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted mb-2.5">
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {languages.map((lang) => (
          <Pill
            key={lang.id}
            label={lang.label}
            selected={selectedId === lang.id}
            disabled={!lang.enabled}
            mode="single"
            onClick={() => onSelect(lang.id)}
          />
        ))}
      </div>
    </section>
  );
}
