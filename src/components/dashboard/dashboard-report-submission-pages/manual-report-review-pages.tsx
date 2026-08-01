"use client";

import { useEffect, useState } from "react";

import { FileText, ImageOff, Paperclip, Pencil } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/report-draft-text";
import type { ReportBuilderOverview } from "@/lib/report-builder-view-model";
import {
  getResolvedReportFlowDraft,
  mergeReportFlowDraft,
  type ReportFlowDraft,
} from "@/lib/report-flow";
import {
  formatEvidenceAvailabilityNote,
  formatEvidenceFileType,
  formatEvidenceStatus,
  formatFileSize,
} from "@/lib/report-format";
import {
  getManualEvidenceItems,
  removeManualEvidenceItem,
  type ManualEvidenceItem,
} from "@/lib/report-evidence";
import {
  getOrCreateLiveEvidenceObjectUrl,
  hasLiveEvidenceFile,
  revokeLiveEvidenceFile,
} from "@/lib/report-evidence-runtime";
import {
  MANUAL_REPORT_FLOW_STAGES,
  type ManualReviewOnboardingStepId,
} from "@/lib/report-review-onboarding";
import { cn } from "@/lib/utils";

import {
  ConsentStage,
  CompleteStage,
  DestinationStage,
  OnboardingStepHeader,
  StageActions,
} from "./report-review-onboarding-pages";

type ManualRouterProps = {
  step: ManualReviewOnboardingStepId;
  overview: ReportBuilderOverview | null;
  onGoToStep: (step: ManualReviewOnboardingStepId) => void;
  onGoToDetailsStep: (step: "language" | "community" | "report") => void;
};

/**
 * Phase 8.1 — the one shared attachment card used by both the Incident
 * Report attach panel and the Review stage's evidence list. Shows a
 * current-session preview for images/videos only when the original `File`
 * is still live in this tab (see `report-evidence-runtime.ts`); otherwise
 * shows a truthful "reselect to preview" fallback rather than a broken
 * image/video element or a silently missing preview.
 */
function EvidenceAttachmentCard({
  item,
  onRemove,
}: {
  item: ManualEvidenceItem;
  onRemove: (id: string) => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const isLive = hasLiveEvidenceFile(item.id);
  const previewUrl = isLive ? getOrCreateLiveEvidenceObjectUrl(item.id) : undefined;
  const showMediaPreview =
    (item.category === "image" || item.category === "video") &&
    Boolean(previewUrl) &&
    !previewFailed;

  return (
    <div
      className="flex flex-col gap-3 rounded-[12px] border border-[#e3e8ef] bg-[#f8fafc] p-3 sm:flex-row sm:items-start sm:justify-between"
      data-testid={`evidence-card-${item.id}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {item.category === "image" || item.category === "video" ? (
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#e9eef5]">
            {showMediaPreview && item.category === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`Preview of ${item.fileName}`}
                className="size-16 object-cover"
                onError={() => setPreviewFailed(true)}
              />
            ) : showMediaPreview && item.category === "video" ? (
              <video
                src={previewUrl}
                className="size-16 object-cover"
                controls
                playsInline
                preload="metadata"
                aria-label={`Preview of ${item.fileName}`}
                onError={() => setPreviewFailed(true)}
              >
                <track kind="captions" />
              </video>
            ) : (
              <ImageOff className="size-5 text-[#94a3b8]" aria-hidden="true" />
            )}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[#1f2a3a]" title={item.fileName}>
            {item.fileName}
          </p>
          <p className="mt-0.5 text-xs text-[#60718a]">
            {formatEvidenceFileType(item.category, item.extension)} ·{" "}
            {formatFileSize(item.sizeBytes)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#0f5d9f]" aria-live="polite">
            {formatEvidenceStatus(item.status)}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#7c8da3]">{item.demoNote}</p>

          {(item.category === "image" || item.category === "video") &&
          !isLive ? (
            <p className="mt-1 text-xs leading-5 text-[#9a5b12]" role="status">
              Preview unavailable after refresh. Reselect the file to preview
              it again.
            </p>
          ) : previewFailed ? (
            <p className="mt-1 text-xs leading-5 text-[#9a5b12]" role="status">
              This preview couldn&apos;t be loaded. The file is still
              attached to this report.
            </p>
          ) : null}

          {item.category === "document" && !isLive ? (
            <p className="mt-1 text-xs leading-5 text-[#9a5b12]" role="status">
              {formatEvidenceAvailabilityNote("needs_reselection")}
            </p>
          ) : null}

          {item.extractedText ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-[#0f5d9f]">
                Show text read from this file
              </summary>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">
                Text read directly from this file in your browser
              </p>
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-[#e3e8ef] bg-white p-2 text-[11px] leading-5 text-[#334155]">
                {item.extractedText}
              </pre>
            </details>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="shrink-0 self-start rounded-full border border-[#dbe5f0] bg-white px-3 py-1.5 text-[11px] font-bold text-[#334155] transition hover:bg-[#fff1f0] hover:text-[#b42318]"
        aria-label={`Remove ${item.fileName} from this report`}
      >
        Remove
      </button>
    </div>
  );
}

/**
 * Phase 8 — the manual flow's single Review stage. Replaces the read-only
 * `IncidentReviewSummary` (kept as-is for the Triage path) with an editable
 * report: title, summary/narrative, language, community, and evidence are
 * all reviewable and editable here before Destination.
 */
function ManualReviewStage({
  onGoToStep,
  onGoToDetailsStep,
}: {
  onGoToStep: (step: ManualReviewOnboardingStepId) => void;
  onGoToDetailsStep: (step: "language" | "community" | "report") => void;
}) {
  const [draft, setDraft] = useState<ReportFlowDraft | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<ManualEvidenceItem[]>([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    const resolved = getResolvedReportFlowDraft();
    setDraft(resolved);
    setTitle(resolved?.title ?? "");
    setSummary(resolved?.summary ?? "");
    setEvidenceItems(getManualEvidenceItems(resolved?.evidenceIds ?? []));
  }, []);

  function persistTitle(value: string): void {
    setTitle(value);
    setDraft(mergeReportFlowDraft({ title: value }));
  }

  function persistSummary(value: string): void {
    setSummary(value);
    const existingStructuredFields = draft?.structuredFields ?? {};
    setDraft(
      mergeReportFlowDraft({
        summary: value,
        structuredFields: { ...existingStructuredFields, what: value },
      })
    );
  }

  function handleRemoveEvidence(id: string): void {
    removeManualEvidenceItem(id);
    revokeLiveEvidenceFile(id);
    setEvidenceItems((current) => current.filter((item) => item.id !== id));
    const nextIds = (draft?.evidenceIds ?? []).filter(
      (evidenceId) => evidenceId !== id
    );
    setDraft(mergeReportFlowDraft({ evidenceIds: nextIds }));
  }

  function handleContinue(): void {
    const hasNarrative = summary.trim().length > 0;
    const hasEvidence = evidenceItems.length > 0;

    if (!hasNarrative && !hasEvidence) {
      setValidationMessage(
        "Add a short description of what happened, or attach at least one supported file, before continuing."
      );
      return;
    }

    setValidationMessage(null);
    onGoToStep("destination");
  }

  const languageLabel = draft?.languageLabel || "No language selected";
  const communityLabel = draft?.communityLabel || "Not provided";

  return (
    <div>
      <OnboardingStepHeader
        title="Review your report"
        description="Everything below is stored on this device only. Nothing has been sent — review and edit anything before continuing."
      />

      <Card className="mt-6 rounded-[14px] p-4" data-testid="manual-review-overview">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-[#1f2a3a]">Report overview</h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#94a3b8]">
            Saved {formatTimestamp(draft?.updatedAt ?? null)}
          </p>
        </div>

        <label htmlFor="manual-review-title" className="mt-4 block">
          <span className="text-sm font-bold text-[#1f2a3a]">Report title</span>
          <input
            id="manual-review-title"
            value={title}
            onChange={(event) => persistTitle(event.target.value)}
            placeholder="e.g. Incident report — online harassment"
            className="mt-2 min-h-11 w-full rounded-full border border-[#dbe5f0] bg-white px-4 text-sm text-[#1f2a3a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
          />
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-[12px] border border-[#e3e8ef] bg-[#f8fafc] p-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                Language
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[#1f2a3a]">
                {languageLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToDetailsStep("language")}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#0f5d9f] hover:underline"
            >
              <Pencil size={12} aria-hidden="true" />
              Change
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-[12px] border border-[#e3e8ef] bg-[#f8fafc] p-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                Community
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[#1f2a3a]">
                {communityLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToDetailsStep("community")}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#0f5d9f] hover:underline"
            >
              <Pencil size={12} aria-hidden="true" />
              Change
            </button>
          </div>
        </div>
      </Card>

      <Card className="mt-4 rounded-[14px] p-4" data-testid="manual-review-narrative">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
            <FileText className="size-4 text-[#0f5d9f]" aria-hidden="true" />
            What happened
          </h2>
          <button
            type="button"
            onClick={() => onGoToDetailsStep("report")}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#0f5d9f] hover:underline"
          >
            <Pencil size={12} aria-hidden="true" />
            Edit in Incident Report
          </button>
        </div>
        <label htmlFor="manual-review-summary" className="sr-only">
          What happened
        </label>
        <textarea
          id="manual-review-summary"
          value={summary}
          onChange={(event) => persistSummary(event.target.value)}
          placeholder="Describe what happened in your own words."
          className="mt-3 min-h-40 w-full resize-y rounded-[14px] border border-[#dbe5f0] bg-white p-4 text-sm leading-7 text-[#1f2a3a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
        />
        <p className="mt-2 text-xs leading-5 text-[#94a3b8]">
          Your own words are kept exactly as written — SafeSpeak does not
          rewrite, correct, or reclassify what you enter here.
        </p>
        {summary.trim().length === 0 && evidenceItems.length > 0 ? (
          <p className="mt-2 rounded-[10px] border border-[#dce5f1] bg-[#f8fbff] p-3 text-xs leading-5 text-[#0f5d9f]">
            Supporting files were attached. Add a description when you are
            ready to explain what happened.
          </p>
        ) : null}
      </Card>

      <Card className="mt-4 rounded-[14px] p-4" data-testid="manual-review-evidence">
        <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
          <Paperclip className="size-4 text-[#0f5d9f]" aria-hidden="true" />
          Supporting evidence
        </h2>
        {evidenceItems.length === 0 ? (
          <p className="mt-3 rounded-[12px] border border-dashed border-[#cbd8e6] bg-[#f8fbff] p-4 text-sm text-[#60718a]">
            No files attached. You can add supporting files from the Incident
            Report stage.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {evidenceItems.map((item) => (
              <EvidenceAttachmentCard
                key={item.id}
                item={item}
                onRemove={handleRemoveEvidence}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4 rounded-[14px] border border-[#dce5f1] bg-[#f8fbff] p-4 text-xs leading-5 text-[#60718a]">
        Review all details before continuing. File-content extraction is
        simulated in this demo. Nothing has been sent yet.
      </div>

      {validationMessage ? (
        <p
          className="mt-3 text-sm font-semibold text-[#b42318]"
          role="alert"
          aria-live="assertive"
        >
          {validationMessage}
        </p>
      ) : null}

      <StageActions
        onBack={() => onGoToDetailsStep("report")}
        backLabel="Back to Incident Report"
        onContinue={handleContinue}
        continueLabel="Choose a destination"
      />
    </div>
  );
}

function ManualReportReviewRouter({
  step,
  overview,
  onGoToStep,
  onGoToDetailsStep,
}: ManualRouterProps) {
  if (step === "review") {
    return (
      <ManualReviewStage
        onGoToStep={onGoToStep}
        onGoToDetailsStep={onGoToDetailsStep}
      />
    );
  }

  if (step === "destination") {
    return (
      <DestinationStage
        overview={overview}
        onBack={() => onGoToStep("review")}
        onContinue={() => onGoToStep("consent")}
      />
    );
  }

  if (step === "consent") {
    return (
      <ConsentStage
        onBack={() => onGoToStep("destination")}
        onContinue={() => onGoToStep("complete")}
      />
    );
  }

  return <CompleteStage onBack={() => onGoToStep("consent")} />;
}

/**
 * Unified "Step X of 7" progress readout shared by both halves of the
 * manual flow (Language/Community/Incident Report, then
 * Review/Destination/Consent/Complete) — see
 * `MANUAL_REPORT_FLOW_STAGES` for the canonical stage list this reads.
 */
function ManualReportFlowProgress({
  currentIndex,
  currentLabel,
}: {
  currentIndex: number;
  currentLabel: string;
}) {
  const labels = MANUAL_REPORT_FLOW_STAGES.map((stage) => stage.label);
  const total = labels.length;
  const progress = ((currentIndex + 1) / total) * 100;

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-[#0f5d9f]">
            Step {currentIndex + 1} of {total}
          </p>
          <p className="mt-1 text-xs text-[#60718a]">
            {currentLabel} in the SafeSpeak report flow
          </p>
        </div>
        <ol
          className="hidden flex-wrap gap-1.5 sm:flex"
          aria-label="Manual report flow progress"
        >
          {labels.map((label, index) => (
            <li key={label}>
              <span
                aria-current={index === currentIndex ? "step" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  index === currentIndex
                    ? "bg-[#0f5d9f] text-white"
                    : index < currentIndex
                      ? "bg-[#e7f1fb] text-[#0f5d9f]"
                      : "bg-[#f1f5f9] text-[#64748b]"
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5edf6]">
        <div
          className="h-full rounded-full bg-[#0f5d9f] transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export {
  ManualReviewStage,
  ManualReportReviewRouter,
  ManualReportFlowProgress,
  EvidenceAttachmentCard,
};
