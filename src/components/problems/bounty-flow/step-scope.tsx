"use client";

import { useEffect, useRef } from "react";
import { Pill } from "./pill";
import { Input } from "@/components/ui/input";
import {
  CUSTOM_SCOPE_ID,
  getScopeDef,
  getScopesForLanguage,
  isScopeSelectionEnabled,
} from "./flow-data";

export function getScopeSummary(
  languageId: string,
  scopeId: string | null,
  customScope: string
): string {
  if (!scopeId) return "";
  if (scopeId === CUSTOM_SCOPE_ID) {
    const trimmed = customScope.trim();
    return trimmed || "Custom";
  }
  return getScopeDef(languageId, scopeId)?.label ?? scopeId;
}

export function isScopeAnswerComplete(
  scopeId: string | null,
  customScope: string
): boolean {
  if (!scopeId) return false;
  if (scopeId === CUSTOM_SCOPE_ID) return customScope.trim().length > 0;
  return true;
}

type StepScopeProps = {
  languageId: string | null;
  scopeId: string | null;
  customScope: string;
  onSelectScope: (scopeId: string) => void;
  onCustomScopeChange: (value: string) => void;
  /** Fired when a preset scope is picked, or custom text is committed. */
  onComplete?: () => void;
};

export function StepScope({
  languageId,
  scopeId,
  customScope,
  onSelectScope,
  onCustomScopeChange,
  onComplete,
}: StepScopeProps) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const selectionEnabled = isScopeSelectionEnabled(languageId);
  const scopes = languageId ? getScopesForLanguage(languageId) : [];
  const isCustom = scopeId === CUSTOM_SCOPE_ID;

  useEffect(() => {
    if (isCustom) {
      customInputRef.current?.focus();
    }
  }, [isCustom]);

  if (!languageId) {
    return (
      <p className="text-sm text-foreground-muted">
        Pick a language above to see scope options.
      </p>
    );
  }

  if (scopes.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No scope options defined for this language.
      </p>
    );
  }

  function handlePresetSelect(id: string) {
    onSelectScope(id);
    onComplete?.();
  }

  function handleCustomPillClick() {
    onSelectScope(CUSTOM_SCOPE_ID);
  }

  function tryCompleteCustom() {
    if (customScope.trim()) {
      onComplete?.();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {scopes.map((scope) => (
          <Pill
            key={scope.id}
            label={scope.label}
            selected={scopeId === scope.id}
            disabled={!selectionEnabled}
            mode="single"
            onClick={() => handlePresetSelect(scope.id)}
          />
        ))}
        <Pill
          label="Custom"
          selected={isCustom}
          disabled={!selectionEnabled}
          mode="single"
          onClick={handleCustomPillClick}
        />
      </div>

      {isCustom && selectionEnabled && (
        <div>
          <label htmlFor="custom-scope" className="sr-only">
            Custom scope
          </label>
          <Input
            ref={customInputRef}
            id="custom-scope"
            type="text"
            value={customScope}
            onChange={(e) => onCustomScopeChange(e.target.value)}
            onBlur={tryCompleteCustom}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                tryCompleteCustom();
              }
            }}
            placeholder="Describe the scope in your own words…"
            className="w-full bg-surface border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors"
          />
        </div>
      )}
    </div>
  );
}
