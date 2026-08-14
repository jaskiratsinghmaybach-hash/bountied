"use client";

import { useActionState, useEffect, useRef, useState, useCallback } from "react";
import { FlowStep } from "./flow-step";
import { type BountyTypeValue, StepBountyType } from "./step-bounty-type";
import { StepLanguage } from "./step-language";
import { StepScope } from "./step-scope";
import { WorkspaceLayout } from "./workspace/workspace-layout";
import { FieldDescription } from "./workspace/field-description";
import { FieldRepos } from "./workspace/field-repos";
import { FieldScreenshots } from "./workspace/field-screenshots";
import { FieldLogs } from "./workspace/field-logs";
import { AddonsSection } from "./workspace/addons-section";
import { FieldTags } from "./workspace/field-tags";
import { FieldDeadline, type DeadlinePreset } from "./workspace/field-deadline";
import { FieldRunCommand } from "./workspace/field-run-command";
import { FieldBountyAmount } from "./workspace/field-bounty-amount";
import { SaveStatusIndicator } from "./workspace/save-status-indicator";
import { Pill } from "./pill";
import { getLanguageLabel, getScopeDef } from "./flow-data";
import { type DescriptionSections, parseDescription, serializeDescription } from "@/lib/problems/description-sections";
import { createProblem, updateProblem, autoSaveProblem, type CreateProblemResult } from "@/lib/problems/create-actions";
import { InsufficientCreditsModal } from "@/components/payments/insufficient-credits-modal";

export type ExistingProblem = {
  id: string;
  title: string;
  description: string;
  type: string;
  tags: string[];
  bountyAmount: number | null;
  deadline: string | null;
  runCommand: string;
  language: string | null;
  scope: string | null;
  addons: string[];
  referenceRepoUrls: string[];
  screenshotUrls: string[];
  logs: string | null;
};

type BountyFlowProps = {
  existingProblem?: ExistingProblem;
  githubConnected?: boolean;
};

const initialState: CreateProblemResult | undefined = undefined;

export function BountyFlow({ existingProblem, githubConnected = true }: BountyFlowProps) {
  const isEditing = !!existingProblem;
  const initialDraftId = existingProblem?.id;
  const [draftProblemId, setDraftProblemId] = useState<string | null>(initialDraftId ?? null);

  async function formActionHandler(
    prevState: CreateProblemResult | undefined,
    formData: FormData
  ): Promise<CreateProblemResult> {
    if (draftProblemId) {
      return updateProblem(draftProblemId, prevState, formData);
    }
    return createProblem(prevState, formData);
  }

  const [stateResult, formAction, pending] = useActionState(formActionHandler, initialState);
  const [modalDismissed, setModalDismissed] = useState(false);

  const initialDesc = parseDescription(existingProblem?.description ?? "");

  const [type, setType] = useState<BountyTypeValue | null>((existingProblem?.type as BountyTypeValue) ?? null);
  const [language, setLanguage] = useState<string | null>(existingProblem?.language ?? null);
  const [scope, setScope] = useState<string | null>(existingProblem?.scope ?? null);
  const [customScope, setCustomScope] = useState("");
  const [addons, setAddons] = useState<string[]>(existingProblem?.addons ?? []);

  const [title, setTitle] = useState(existingProblem?.title ?? "");
  const [desc, setDesc] = useState<DescriptionSections>(initialDesc);
  const [repos, setRepos] = useState<string[]>(existingProblem?.referenceRepoUrls ?? []);
  const [screenshots, setScreenshots] = useState<string[]>(existingProblem?.screenshotUrls ?? []);
  const [logs, setLogs] = useState(existingProblem?.logs ?? "");
  const [tags, setTags] = useState(existingProblem?.tags.join(", ") ?? "");
  const [deadlinePreset, setDeadlinePreset] = useState<DeadlinePreset | null>(existingProblem?.deadline ? "custom" : null);
  const [deadlineCustom, setDeadlineCustom] = useState(existingProblem?.deadline ? existingProblem.deadline.split("T")[0] : "");
  const [runCommand, setRunCommand] = useState(existingProblem?.runCommand ?? "python main.py");
  const [bountyAmount, setBountyAmount] = useState(existingProblem?.bountyAmount ? String(existingProblem.bountyAmount) : "");

  const [layoutMode, setLayoutMode] = useState<"pills" | "workspace">(isEditing ? "workspace" : "pills");
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | null>(null);

  const isWorkspace = layoutMode === "workspace";

  const stateRef = useRef({ type, language, scope, customScope, addons, title, desc, repos, screenshots, logs, tags, deadlineCustom, runCommand, bountyAmount });
  useEffect(() => {
    stateRef.current = { type, language, scope, customScope, addons, title, desc, repos, screenshots, logs, tags, deadlineCustom, runCommand, bountyAmount };
  }, [type, language, scope, customScope, addons, title, desc, repos, screenshots, logs, tags, deadlineCustom, runCommand, bountyAmount]);

  const saveTimer = useRef<NodeJS.Timeout>(null);

  const triggerAutoSave = useCallback(() => {
    if (!isWorkspace) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      // Deferred setSaveStatus inside the timer so it doesn't run synchronously in useEffect
      setSaveStatus("saving");

      const s = stateRef.current;
      const formData = new FormData();
      formData.append("intent", "draft");
      if (s.type) formData.append("type", s.type);
      if (s.language) formData.append("language", s.language);
      if (s.scope === "custom") formData.append("scope", s.customScope);
      else if (s.scope) formData.append("scope", s.scope);
      formData.append("addons", JSON.stringify(s.addons));
      formData.append("title", s.title);
      formData.append("description", serializeDescription(s.desc));
      formData.append("referenceRepoUrls", JSON.stringify(s.repos));
      formData.append("screenshotUrls", JSON.stringify(s.screenshots));
      formData.append("logs", s.logs);
      formData.append("tags", s.tags);
      if (s.deadlineCustom) formData.append("deadline", s.deadlineCustom);
      formData.append("runCommand", s.runCommand);
      formData.append("bountyAmount", s.bountyAmount);

      try {
        const res = await autoSaveProblem(draftProblemId, formData);
        if (!("error" in res) && res.draftProblemId) {
          setDraftProblemId(res.draftProblemId);
        }
        setSaveStatus("saved");
      } catch {
        setSaveStatus(null);
      }
    }, 2500);
  }, [isWorkspace, draftProblemId]);

  useEffect(() => {
    if (isWorkspace && !isEditing) {
      triggerAutoSave();
    }

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [type, language, scope, customScope, addons, title, desc, repos, screenshots, logs, tags, deadlineCustom, runCommand, bountyAmount, isWorkspace, isEditing, triggerAutoSave]);

  const resolvedScopeLabel = scope === "custom" ? customScope : (language && scope ? getScopeDef(language, scope)?.label ?? scope : "");

  return (
    <>
      <form action={formAction} className="relative">
        {stateResult && "error" in stateResult && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger mb-6">
            {stateResult.error}
          </p>
        )}

        <WorkspaceLayout
          layoutMode={layoutMode}
          pillPhase={
            <>
              <FlowStep
                stepId="type"
                visible={true}
                question="Bounty type"
                answered={type !== null}
                expanded={type === null}
                summary={type ? <Pill mode="single" selected label={type.replace(/_/g, " ")} /> : null}
                onExpand={() => { setType(null); setLanguage(null); setScope(null); }}
              >
                <StepBountyType value={type} onSelect={setType} />
              </FlowStep>

              <FlowStep
                stepId="language"
                visible={type !== null}
                question="Language"
                answered={language !== null}
                expanded={language === null}
                summary={language ? <Pill mode="single" selected label={getLanguageLabel(language)} /> : null}
                onExpand={() => { setLanguage(null); setScope(null); }}
              >
                <StepLanguage value={language} onSelect={setLanguage} />
              </FlowStep>

              <FlowStep
                stepId="scope"
                visible={language !== null}
                question="Scope"
                answered={scope !== null}
                expanded={scope === null}
                summary={scope ? <Pill mode="single" selected label={resolvedScopeLabel} /> : null}
                onExpand={() => setScope(null)}
              >
                <StepScope
                  languageId={language}
                  scopeId={scope}
                  customScope={customScope}
                  onSelectScope={(id) => {
                    setScope(id);
                    if (id !== "custom") setCustomScope("");
                  }}
                  onCustomScopeChange={setCustomScope}
                  onComplete={() => {
                    setLayoutMode("workspace");
                  }}
                />
              </FlowStep>
            </>
          }
          summaryStrip={
            <>
              <Pill
                mode="single"
                selected
                label={type?.replace(/_/g, " ") ?? ""}
                onClick={() => setLayoutMode("pills")}
                className="hover:opacity-80 transition-opacity"
              />
              <Pill
                mode="single"
                selected
                label={language ? getLanguageLabel(language) : ""}
                onClick={() => setLayoutMode("pills")}
                className="hover:opacity-80 transition-opacity"
              />
              <Pill
                mode="single"
                selected
                label={resolvedScopeLabel}
                onClick={() => setLayoutMode("pills")}
                className="hover:opacity-80 transition-opacity"
              />
            </>
          }
          saveStatus={<SaveStatusIndicator status={saveStatus} />}
          tier1={
            <FieldDescription value={desc} onChange={setDesc} title={title} onTitleChange={setTitle} />
          }
          tier2={
            <>
              <FieldRepos githubConnected={githubConnected} value={repos} onChange={setRepos} maxRepos={3} />
              <FieldScreenshots value={screenshots} onChange={setScreenshots} problemId={draftProblemId} />
              <FieldLogs value={logs} onChange={setLogs} />
            </>
          }
          tier3={
            <>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-foreground-muted mb-2">Addons</label>
                <AddonsSection languageId={language} value={addons} onChange={setAddons} />
              </div>
              <FieldTags value={tags} onChange={setTags} />
              <FieldDeadline preset={deadlinePreset} onPresetChange={setDeadlinePreset} customDate={deadlineCustom} onCustomDateChange={setDeadlineCustom} />
              <FieldRunCommand value={runCommand} onChange={setRunCommand} />
            </>
          }
          rightPanel={
            type !== "OPEN_FREE" && <FieldBountyAmount value={bountyAmount} onChange={setBountyAmount} />
          }
          footer={
            <div className="flex flex-col gap-3">
              <button
                type="submit"
                name="intent"
                value="publish"
                disabled={pending}
                className="w-full rounded-md bg-accent text-background font-medium px-6 py-3.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60 shadow-sm"
              >
                {pending ? "Posting…" : (type === "OPEN_FREE" ? "Post bounty" : "Fund & post bounty")}
              </button>
              <button
                type="submit"
                name="intent"
                value="draft"
                disabled={pending}
                className="w-full rounded-md border border-border text-foreground font-medium px-6 py-3 text-sm hover:bg-surface-raised transition-colors disabled:opacity-60"
              >
                Save as draft
              </button>
            </div>
          }
        />
        <input type="hidden" name="type" value={type ?? ""} />
        <input type="hidden" name="language" value={language ?? ""} />
        <input type="hidden" name="scope" value={scope === "custom" ? customScope : (scope ?? "")} />
        <input type="hidden" name="addons" value={JSON.stringify(addons)} />
        <input type="hidden" name="description" value={serializeDescription(desc)} />
        <input type="hidden" name="referenceRepoUrls" value={JSON.stringify(repos)} />
        <input type="hidden" name="screenshotUrls" value={JSON.stringify(screenshots)} />
      </form>

      {stateResult && "insufficientCredits" in stateResult && !modalDismissed && (
        <InsufficientCreditsModal
          required={stateResult.required}
          draftProblemId={stateResult.draftProblemId}
          onClose={() => setModalDismissed(true)}
        />
      )}

      {stateResult && "insufficientCredits" in stateResult && modalDismissed && (
        <p className="text-sm text-foreground-muted mt-6">
          Your bounty was saved as a draft — add credits any time from{" "}
          <a href="/settings" className="text-accent hover:underline">Settings</a> to publish it.
        </p>
      )}
    </>
  );
}