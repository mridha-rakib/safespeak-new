"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  HeartHandshake,
  LifeBuoy,
  Loader2,
  Phone,
  RefreshCw,
  Save,
  Scale,
  Sparkles,
  Upload,
  UserRoundCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AssistantIncidentCategory } from "@/lib/assistant-categories";
import { getAssistantTriageSource } from "@/lib/assistant-triage";
import type { DashboardCardFlowId } from "@/lib/dashboard-card-flows";
import {
  MANUAL_EVIDENCE_ACCEPTED_FORMATS_LABEL,
  MANUAL_EVIDENCE_ACCEPT_ATTRIBUTE,
  MANUAL_EVIDENCE_LIMITS,
  classifyEvidenceFile,
  processEvidenceFileForDemo,
  validateEvidenceFile,
} from "@/lib/demo-evidence-processing";
import {
  type MicroEducationItem,
  listPublishedMicroEducation,
} from "@/lib/microeducation";
import { getResolvedReportFlowDraft, mergeReportFlowDraft } from "@/lib/report-flow";
import {
  type ReportBuilderOverview,
  buildReportBuilderOverview,
} from "@/lib/report-builder-view-model";
import {
  REPORT_COMMUNITY_OPTIONS,
  REPORT_COMMUNITY_SKIP_OPTION,
} from "@/lib/report-community";
import {
  type InjuredValue,
  type ReportDraft,
  type SafetyStatusValue,
  buildReportDraftText,
  formatTimestamp,
  toTitleCase,
} from "@/lib/report-draft-text";
import {
  type ManualEvidenceItem,
  addManualEvidenceItem,
  computeEvidenceFingerprint,
  getManualEvidenceItems,
  hasManualEvidenceFingerprint,
  removeManualEvidenceItem,
  updateManualEvidenceItem,
} from "@/lib/report-evidence";
import {
  registerLiveEvidenceFile,
  revokeAllLiveEvidenceFiles,
  revokeLiveEvidenceFile,
} from "@/lib/report-evidence-runtime";
import { formatFileSize } from "@/lib/report-format";
import {
  type ReportLanguageCode,
  LANGUAGE_TRANSLATION_DISCLAIMER,
  REPORT_LANGUAGE_OPTIONS,
  formatReportLanguageLabel,
} from "@/lib/report-language";
import {
  LEGACY_MANUAL_DETAILS_STEP_MAP,
  MANUAL_REVIEW_ONBOARDING_STEPS,
  REPORT_REVIEW_ONBOARDING_STEPS,
  type ManualReviewOnboardingStepId,
  type ReportReviewOnboardingStepId,
  isReportReviewOnboardingStep,
  normalizeManualOnboardingStep,
  reportReviewOnboardingStepHref,
} from "@/lib/report-review-onboarding";
import { COVERT_MODE_KEY, NEUTRAL_ROUTE } from "@/lib/safety";
import type { TriageSupportOption } from "@/lib/triage-view-model";
import { cn } from "@/lib/utils";

import {
  EvidenceAttachmentCard,
  ManualReportFlowProgress,
  ManualReportReviewRouter,
} from "./manual-report-review-pages";
import {
  ReportReviewOnboardingProgress,
  ReportReviewOnboardingRouter,
} from "./report-review-onboarding-pages";

const FLOW_STORAGE_KEY = "safespeak_report_onboarding_flow";
const REPORT_DRAFT_STORAGE_KEY = "safespeak_report_entry_draft";

/**
 * Phase 8 — the manual flow's pre-"Incident Report" steps. Know/Privacy/Hub
 * (previously `information`/`privacy`/`services`) have been removed; a
 * visit to one of those old query values is normalised to `report` (see
 * `LEGACY_MANUAL_DETAILS_STEP_MAP`) rather than rendered or crashed on.
 * `report`'s internal id is unchanged (many other surfaces already link to
 * `step=report`) — only its visible label and content changed to "Incident
 * Report".
 */
const steps = [
  { id: "language", label: "Language" },
  { id: "community", label: "Community" },
  { id: "report", label: "Incident Report" },
] as const;

type ReportOnboardingStep = (typeof steps)[number]["id"];
type LanguageCode = ReportLanguageCode;

type ReportOnboardingState = {
  language: LanguageCode | null;
  communityBackground: string[];
  faithBackground: string | null;
  lifeStage: string | null;
  reportDraft: ReportDraft;
  autoFilledFields: string[];
  lastAppliedTriageUpdatedAt: string | null;
};

const defaultReportDraft: ReportDraft = {
  title: "",
  date: "",
  location: "",
  summary: "",
  safetyStatus: "",
  wasInjured: "",
  relationshipToPerson: "",
  evidenceContext: "",
  updatedAt: null,
};

const defaultState: ReportOnboardingState = {
  language: null,
  communityBackground: [],
  faithBackground: null,
  lifeStage: null,
  reportDraft: defaultReportDraft,
  autoFilledFields: [],
  lastAppliedTriageUpdatedAt: null,
};

const communityOptions = REPORT_COMMUNITY_OPTIONS;
const communitySkipOption = REPORT_COMMUNITY_SKIP_OPTION;

const faithOptions = [
  "Christian",
  "Muslim",
  "Hindu",
  "Sikh",
  "Buddhist",
  "Jewish",
  "Other faith",
  "Secular / No faith",
  "Prefer not to answer",
] as const;

const lifeStageOptions = [
  "Youth (13-25)",
  "Working Age (26-55)",
  "Mature (56+)",
  "Prefer not to answer",
] as const;

function isStep(value: string | null): value is ReportOnboardingStep {
  return steps.some((step) => step.id === value);
}

function stepHref(step: ReportOnboardingStep, fromTriage = false): Route {
  const suffix = fromTriage ? "&fromTriage=1" : "";
  return `/dashboard?view=reportsubmissiondetails&step=${step}${suffix}` as Route;
}

function safeParseState(raw: string | null): ReportOnboardingState {
  if (!raw) return defaultState;

  try {
    const parsed = JSON.parse(raw) as Partial<ReportOnboardingState>;
    return {
      ...defaultState,
      ...parsed,
      communityBackground: Array.isArray(parsed.communityBackground)
        ? parsed.communityBackground.filter((item): item is string => typeof item === "string")
        : [],
      reportDraft: {
        ...defaultReportDraft,
        ...parsed.reportDraft,
      },
      autoFilledFields: Array.isArray(parsed.autoFilledFields)
        ? parsed.autoFilledFields.filter(
            (item): item is string => typeof item === "string"
          )
        : [],
    };
  } catch {
    return defaultState;
  }
}

function saveSessionDraft(draft: ReportDraft): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(REPORT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function quickExit(): void {
  if (typeof window === "undefined") return;

  revokeAllLiveEvidenceFiles();
  window.sessionStorage.removeItem(FLOW_STORAGE_KEY);
  window.sessionStorage.removeItem(REPORT_DRAFT_STORAGE_KEY);
  window.sessionStorage.setItem(COVERT_MODE_KEY, "1");
  window.location.replace(NEUTRAL_ROUTE);
}

function ReportSubmissionDetailsPage({
  initialMessage,
}: {
  initialCategory?: AssistantIncidentCategory;
  initialTopic?: DashboardCardFlowId;
  initialMessage?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStep = searchParams.get("step");
  const fromTriage = searchParams.get("fromTriage") === "1";
  const onboardingStep: ReportReviewOnboardingStepId | ManualReviewOnboardingStepId | null =
    fromTriage
      ? isReportReviewOnboardingStep(requestedStep)
        ? requestedStep
        : null
      : requestedStep
        ? normalizeManualOnboardingStep(requestedStep)
        : null;
  const activeStep = isStep(requestedStep)
    ? requestedStep
    : fromTriage
      ? "report"
      : "language";
  const [state, setState] = useState<ReportOnboardingState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [reportOverview, setReportOverview] =
    useState<ReportBuilderOverview | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<ManualEvidenceItem[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [isProcessingEvidence, setIsProcessingEvidence] = useState(false);
  const [reportValidationMessage, setReportValidationMessage] = useState<
    string | null
  >(null);
  const isSavingRef = useRef(false);
  const isNavigatingToReviewRef = useRef(false);

  useEffect(() => {
    const stored = safeParseState(window.sessionStorage.getItem(FLOW_STORAGE_KEY));
    const storedDraft = window.sessionStorage.getItem(REPORT_DRAFT_STORAGE_KEY);
    let reportDraft = stored.reportDraft;

    if (storedDraft) {
      try {
        reportDraft = {
          ...defaultReportDraft,
          ...(JSON.parse(storedDraft) as Partial<ReportDraft>),
        };
      } catch {
        window.sessionStorage.removeItem(REPORT_DRAFT_STORAGE_KEY);
      }
    }

    let autoFilledFields = stored.autoFilledFields;
    let lastAppliedTriageUpdatedAt = stored.lastAppliedTriageUpdatedAt;

    const triageSource = getAssistantTriageSource();
    const overview = buildReportBuilderOverview(triageSource);
    setReportOverview(overview);

    if (
      triageSource &&
      overview &&
      triageSource.updatedAt !== lastAppliedTriageUpdatedAt
    ) {
      const nextAutoFilled = new Set(autoFilledFields);

      if (overview.prefill.title && !reportDraft.title) {
        reportDraft = { ...reportDraft, title: overview.prefill.title };
        nextAutoFilled.add("title");
      }
      if (overview.prefill.whatHappened && !reportDraft.summary) {
        reportDraft = { ...reportDraft, summary: overview.prefill.whatHappened };
        nextAutoFilled.add("summary");
      }
      if (overview.prefill.safetyStatus && !reportDraft.safetyStatus) {
        reportDraft = {
          ...reportDraft,
          safetyStatus: overview.prefill.safetyStatus,
        };
        nextAutoFilled.add("safetyStatus");
      }
      if (overview.prefill.location && !reportDraft.location) {
        reportDraft = { ...reportDraft, location: overview.prefill.location };
        nextAutoFilled.add("location");
      }

      autoFilledFields = Array.from(nextAutoFilled);
      lastAppliedTriageUpdatedAt = triageSource.updatedAt;
    }

    setState({
      ...stored,
      reportDraft: {
        ...reportDraft,
        summary: reportDraft.summary || initialMessage || "",
      },
      autoFilledFields,
      lastAppliedTriageUpdatedAt,
    });

    const canonicalDraft = getResolvedReportFlowDraft();
    setEvidenceItems(getManualEvidenceItems(canonicalDraft?.evidenceIds ?? []));

    setHydrated(true);
  }, [initialMessage]);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  // Old Know/Privacy/Hub ("information"/"privacy"/"services") pre-report steps and
  // Triage-only "next"/"preview" onboarding sub-stages (when reached without
  // fromTriage=1) are removed from the manual flow. Normalise both to a safe,
  // in-flow destination instead of rendering, crashing, or losing the draft.
  useEffect(() => {
    if (!requestedStep) return;

    if (requestedStep in LEGACY_MANUAL_DETAILS_STEP_MAP) {
      router.replace(stepHref("report", fromTriage));
      return;
    }

    if (
      !fromTriage &&
      (requestedStep === "next" || requestedStep === "preview")
    ) {
      router.replace(reportReviewOnboardingStepHref("review", false));
    }
  }, [requestedStep, fromTriage, router]);

  useEffect(() => {
    if (onboardingStep) return;
    if (requestedStep && requestedStep in LEGACY_MANUAL_DETAILS_STEP_MAP) return;
    if (!fromTriage && (requestedStep === "next" || requestedStep === "preview")) return;
    if (!isStep(requestedStep)) {
      router.replace(stepHref(fromTriage ? "report" : "language", fromTriage));
    }
  }, [requestedStep, onboardingStep, router, fromTriage]);

  useEffect(() => {
    if (activeStep === "report" && !onboardingStep) {
      isNavigatingToReviewRef.current = false;
    }
  }, [activeStep, onboardingStep]);

  // Evidence can be removed from the Review stage (a separate component
  // instance with its own local state — see ManualReviewStage) without this
  // page ever remounting. Re-reading the canonical store each time the
  // Incident Report step becomes active keeps this step's attachment list
  // (and its duplicate-fingerprint check) from going stale — latest-edits-win.
  useEffect(() => {
    if (!hydrated || onboardingStep || activeStep !== "report") return;

    const canonicalDraft = getResolvedReportFlowDraft();
    setEvidenceItems(getManualEvidenceItems(canonicalDraft?.evidenceIds ?? []));
  }, [activeStep, onboardingStep, hydrated]);

  useEffect(() => {
    if (!onboardingStep || !hydrated) return;

    const config = fromTriage
      ? REPORT_REVIEW_ONBOARDING_STEPS[onboardingStep as ReportReviewOnboardingStepId]
      : MANUAL_REVIEW_ONBOARDING_STEPS[onboardingStep as ManualReviewOnboardingStepId];
    if (config.allowDirectAccess) return;

    const resolvedDraft = getResolvedReportFlowDraft();

    if (config.requiresDestination && !resolvedDraft?.selectedDestinationId) {
      router.replace(
        reportReviewOnboardingStepHref("destination", fromTriage)
      );
      return;
    }

    if (config.requiresConsent && !resolvedDraft?.consentGranted) {
      router.replace(reportReviewOnboardingStepHref("consent", fromTriage));
    }
  }, [onboardingStep, hydrated, fromTriage, router]);

  const currentStepIndex = steps.findIndex((step) => step.id === activeStep);
  const selectedLanguage = useMemo(
    () => REPORT_LANGUAGE_OPTIONS.find((language) => language.code === state.language),
    [state.language]
  );

  function updateState(partial: Partial<ReportOnboardingState>): void {
    setState((current) => ({ ...current, ...partial }));
  }

  function goToStep(step: ReportOnboardingStep): void {
    router.push(stepHref(step, fromTriage));
  }

  function goNext(): void {
    if (activeStep === "language" && !state.language) {
      setLanguageError("Select a language to continue.");
      return;
    }

    const nextStep = steps[currentStepIndex + 1]?.id;
    if (nextStep) {
      goToStep(nextStep);
    }
  }

  function headerBack(): void {
    if (onboardingStep) {
      const previous = fromTriage
        ? REPORT_REVIEW_ONBOARDING_STEPS[onboardingStep as ReportReviewOnboardingStepId].previous
        : MANUAL_REVIEW_ONBOARDING_STEPS[onboardingStep as ManualReviewOnboardingStepId].previous;
      router.push(
        previous
          ? reportReviewOnboardingStepHref(previous, fromTriage)
          : stepHref("report", fromTriage)
      );
      return;
    }
    goBack();
  }

  function goBack(): void {
    const previousStep = steps[currentStepIndex - 1]?.id;
    if (previousStep) {
      goToStep(previousStep);
    } else {
      router.push("/dashboard" as Route);
    }
  }

  function selectLanguage(code: LanguageCode): void {
    updateState({ language: code });
    setLanguageError(null);
    mergeReportFlowDraft({
      language: code,
      languageLabel: formatReportLanguageLabel(code),
    });
  }

  function toggleCommunity(option: string): void {
    const current = state.communityBackground;
    let nextSelections: string[];

    if (option === REPORT_COMMUNITY_SKIP_OPTION) {
      nextSelections = [REPORT_COMMUNITY_SKIP_OPTION];
    } else {
      const withoutSkip = current.filter(
        (item) => item !== REPORT_COMMUNITY_SKIP_OPTION
      );
      const exists = withoutSkip.includes(option);

      if (exists) {
        nextSelections = withoutSkip.filter((item) => item !== option);
      } else if (withoutSkip.length >= 3) {
        return;
      } else {
        nextSelections = [...withoutSkip, option];
      }
    }

    updateState({ communityBackground: nextSelections });
    mergeReportFlowDraft({
      community: nextSelections.join(", ") || undefined,
      communityLabel: nextSelections.length
        ? nextSelections.join(", ")
        : "Not provided",
    });
  }

  function updateDraft(partial: Partial<ReportDraft>): void {
    const nextDraft = {
      ...state.reportDraft,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    updateState({ reportDraft: nextDraft });
    saveSessionDraft(nextDraft);
  }

  function updateDraftField<K extends keyof ReportDraft>(
    key: K,
    value: ReportDraft[K]
  ): void {
    updateDraft({ [key]: value } as Partial<ReportDraft>);

    if (state.autoFilledFields.includes(key)) {
      updateState({
        autoFilledFields: state.autoFilledFields.filter((field) => field !== key),
      });
    }

    if (reportValidationMessage) {
      setReportValidationMessage(null);
    }
  }

  function handleDiscardPrefill(): void {
    if (state.autoFilledFields.length === 0) return;

    const cleared: Partial<ReportDraft> = {};
    for (const field of state.autoFilledFields) {
      if (field in defaultReportDraft) {
        cleared[field as keyof ReportDraft] = defaultReportDraft[
          field as keyof ReportDraft
        ] as never;
      }
    }

    updateDraft(cleared);
    updateState({ autoFilledFields: [] });
  }

  function handleSaveLocalDraft(): void {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      saveSessionDraft(state.reportDraft);
      setDraftFeedback("Saved locally in this browser session.");
    } catch {
      setDraftFeedback("Could not save the local draft. Try again.");
    } finally {
      window.setTimeout(() => {
        isSavingRef.current = false;
      }, 400);
    }
  }

  function handleDownloadTxt(): void {
    try {
      const blob = new Blob(
        [buildReportDraftText(state.reportDraft, reportOverview)],
        { type: "text/plain;charset=utf-8" }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "safespeak-report-draft.txt";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDraftFeedback("Downloaded safespeak-report-draft.txt");
    } catch {
      setDraftFeedback("Could not generate the download. Try again.");
    }
  }

  async function handleCopyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        buildReportDraftText(state.reportDraft, reportOverview)
      );
      setCopyFeedback("Copied report text to your clipboard.");
    } catch {
      setCopyFeedback(
        "Could not copy automatically. Select and copy the text manually."
      );
    }
  }

  async function handleFilesSelected(files: FileList | File[]): Promise<void> {
    const fileList = Array.isArray(files) ? files : Array.from(files);
    if (!fileList.length) return;

    setEvidenceError(null);

    const accepted: ManualEvidenceItem[] = [];
    const acceptedFiles = new Map<string, File>();
    // Seeded from already-attached items so a file re-selected later (not just
    // twice in one picker action) is caught too; extended as this batch is
    // processed so duplicates *within* one selection are also caught.
    const seenFingerprints = new Set(evidenceItems.map((item) => item.fingerprint));
    let runningCount = evidenceItems.length;

    for (const file of fileList) {
      const validation = validateEvidenceFile(file, runningCount);

      if (!validation.ok) {
        setEvidenceError(validation.reason);
        continue;
      }

      const classification = classifyEvidenceFile(file);
      if (!classification) {
        setEvidenceError(
          `${file.name} isn't a supported file type in this demo.`
        );
        continue;
      }

      const fingerprint = computeEvidenceFingerprint(file, classification.extension);

      // Checked against both the in-memory batch/state (fast) and the
      // canonical store directly (source of truth) — the latter guards
      // against `evidenceItems` state having gone stale relative to a
      // removal made elsewhere (e.g. the Review stage).
      if (seenFingerprints.has(fingerprint) || hasManualEvidenceFingerprint(fingerprint)) {
        setEvidenceError(`${file.name} is already attached.`);
        continue;
      }
      seenFingerprints.add(fingerprint);

      const id = `${fingerprint}-${Math.random().toString(36).slice(2, 8)}`;
      const item: ManualEvidenceItem = {
        id,
        fingerprint,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        extension: classification.extension,
        sizeBytes: file.size,
        category: classification.category,
        status: "selected",
        demoNote: "Preparing this attachment...",
        addedAt: new Date().toISOString(),
      };

      addManualEvidenceItem(item);
      registerLiveEvidenceFile(id, file);
      accepted.push(item);
      acceptedFiles.set(id, file);
      runningCount += 1;
    }

    if (!accepted.length) return;

    setEvidenceItems((current) => [...current, ...accepted]);
    const canonicalDraft = getResolvedReportFlowDraft();
    mergeReportFlowDraft({
      evidenceIds: [
        ...new Set([
          ...(canonicalDraft?.evidenceIds ?? []),
          ...accepted.map((item) => item.id),
        ]),
      ],
    });
    setReportValidationMessage(null);

    setIsProcessingEvidence(true);
    try {
      await Promise.all(
        accepted.map(async (item) => {
          const file = acceptedFiles.get(item.id);
          if (!file) return;

          const demoResult = await processEvidenceFileForDemo(file, item.category);
          const patch = {
            status: demoResult.status,
            demoNote: demoResult.demoNote,
            extractedText: demoResult.extractedText,
          };

          updateManualEvidenceItem(item.id, patch);
          setEvidenceItems((current) =>
            current.map((existing) =>
              existing.id === item.id ? { ...existing, ...patch } : existing
            )
          );
        })
      );
    } finally {
      setIsProcessingEvidence(false);
    }
  }

  function handleRemoveEvidence(id: string): void {
    removeManualEvidenceItem(id);
    revokeLiveEvidenceFile(id);
    setEvidenceItems((current) => current.filter((item) => item.id !== id));
    const canonicalDraft = getResolvedReportFlowDraft();
    mergeReportFlowDraft({
      evidenceIds: (canonicalDraft?.evidenceIds ?? []).filter(
        (evidenceId) => evidenceId !== id
      ),
    });
  }

  function handleReviewIncident(): void {
    if (isNavigatingToReviewRef.current) return;

    const hasNarrative = state.reportDraft.summary.trim().length > 0;
    const hasEvidence = evidenceItems.length > 0;

    if (!hasNarrative && !hasEvidence) {
      setReportValidationMessage(
        "Add a short description of what happened, or attach a supported file, before continuing."
      );
      return;
    }

    isNavigatingToReviewRef.current = true;

    saveSessionDraft(state.reportDraft);

    const draft = state.reportDraft;
    mergeReportFlowDraft({
      title: draft.title,
      date: draft.date,
      location: draft.location,
      summary: draft.summary,
      safetyStatus: draft.safetyStatus || undefined,
      incidentType: reportOverview?.matchedPathway.category,
      entrySource: fromTriage ? "triage" : "manual",
      structuredFields: {
        who: draft.relationshipToPerson || undefined,
        what: draft.summary || undefined,
        when: draft.date || undefined,
        where: draft.location || undefined,
        injuries: draft.wasInjured || undefined,
        witnesses: draft.evidenceContext || undefined,
      },
    });

    router.push(reportReviewOnboardingStepHref("review", fromTriage));
  }

  if (!hydrated) {
    return (
      <div className="px-3 py-6 text-sm text-[#60718a] sm:px-5">
        Loading report flow...
      </div>
    );
  }

  // Only meaningful for the manual (non-Triage) onboarding steps
  // (review/destination/consent/complete) — the Triage path renders
  // ReportReviewOnboardingProgress instead and never reads these, but
  // `onboardingStep` can still be a Triage-only id like "next"/"preview"
  // here (not a key of MANUAL_REVIEW_ONBOARDING_STEPS), so this must not
  // index into that map unless we're actually on the manual path.
  const manualOnboardingStep =
    onboardingStep && !fromTriage
      ? (onboardingStep as ManualReviewOnboardingStepId)
      : null;
  const manualStageIndex = manualOnboardingStep
    ? 3 + MANUAL_REVIEW_ONBOARDING_STEPS[manualOnboardingStep].order
    : currentStepIndex;
  const manualStageLabel = manualOnboardingStep
    ? MANUAL_REVIEW_ONBOARDING_STEPS[manualOnboardingStep].label
    : steps[currentStepIndex]?.label ?? "Language";

  return (
    <div className="px-2 pb-28 pt-2 text-[#1f2a3a] sm:px-4 sm:pb-36 sm:pt-4">
      <div className="mx-auto w-full max-w-[1184px]">
        <div className="mb-3 flex flex-col gap-3 border-b border-[#d9e2ee] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={headerBack}
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-[#d7e1ee] bg-white px-3 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back
          </button>

          <button
            type="button"
            onClick={quickExit}
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-[#d7e1ee] bg-white px-3 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
          >
            <X size={14} aria-hidden="true" />
            Quick Exit
          </button>
        </div>

        <section
          aria-labelledby="report-flow-heading"
          className="rounded-[16px] border border-[#dce4ef] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-5 lg:p-6"
        >
          {onboardingStep && fromTriage ? (
            <ReportReviewOnboardingProgress
              currentStepId={onboardingStep as ReportReviewOnboardingStepId}
            />
          ) : (
            <ManualReportFlowProgress
              currentIndex={manualStageIndex}
              currentLabel={manualStageLabel}
            />
          )}

          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
            {onboardingStep && fromTriage ? (
              <ReportReviewOnboardingRouter
                step={onboardingStep as ReportReviewOnboardingStepId}
                overview={reportOverview}
                onGoToStep={(step) =>
                  router.push(reportReviewOnboardingStepHref(step, fromTriage))
                }
                onEditDetails={() => router.push(stepHref("report", fromTriage))}
              />
            ) : onboardingStep ? (
              <ManualReportReviewRouter
                step={onboardingStep as ManualReviewOnboardingStepId}
                overview={reportOverview}
                onGoToStep={(step) =>
                  router.push(reportReviewOnboardingStepHref(step, false))
                }
                onGoToDetailsStep={(step) => router.push(stepHref(step, false))}
              />
            ) : activeStep === "language" ? (
              <LanguageStep
                error={languageError}
                onContinue={goNext}
                onSelect={selectLanguage}
                selectedLanguage={selectedLanguage}
                selectedLanguageCode={state.language}
              />
            ) : activeStep === "community" ? (
              <CommunityStep
                communitySelections={state.communityBackground}
                faithBackground={state.faithBackground}
                lifeStage={state.lifeStage}
                onBack={goBack}
                onContinue={goNext}
                onFaithChange={(faithBackground) => updateState({ faithBackground })}
                onLifeStageChange={(lifeStage) => updateState({ lifeStage })}
                onToggleCommunity={toggleCommunity}
              />
            ) : (
              <ReportEntryStep
                draft={state.reportDraft}
                autoFilledFields={state.autoFilledFields}
                overview={reportOverview}
                fromTriage={fromTriage}
                draftFeedback={draftFeedback}
                copyFeedback={copyFeedback}
                evidenceItems={evidenceItems}
                evidenceError={evidenceError}
                isProcessingEvidence={isProcessingEvidence}
                validationMessage={reportValidationMessage}
                onBack={
                  fromTriage
                    ? () => router.push("/dashboard?view=reportsubmissionsupport" as Route)
                    : () => goToStep("community")
                }
                onDraftFieldChange={updateDraftField}
                onDiscardPrefill={handleDiscardPrefill}
                onSaveLocalDraft={handleSaveLocalDraft}
                onDownloadTxt={handleDownloadTxt}
                onCopyToClipboard={() => {
                  void handleCopyToClipboard();
                }}
                onFilesSelected={(files) => {
                  void handleFilesSelected(files);
                }}
                onRemoveEvidence={handleRemoveEvidence}
                onReviewIncident={handleReviewIncident}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StepHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <header className="max-w-3xl">
      {eyebrow ? (
        <p className="text-xs font-bold uppercase text-[#0f5d9f]">{eyebrow}</p>
      ) : null}
      <h1 id="report-flow-heading" className="mt-2 text-3xl font-extrabold tracking-normal text-[#1f2a3a] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#60718a] sm:text-base">
        {description}
      </p>
    </header>
  );
}

function FlowActions({
  onBack,
  onContinue,
  continueLabel = "Continue",
  backLabel = "Back",
}: {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  backLabel?: string;
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#e3ebf5] pt-5 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <Button
          variant="outline"
          onClick={onBack}
          className="min-h-11 rounded-full"
        >
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button
        onClick={onContinue}
        className="min-h-11 rounded-full bg-[#0f5d9f] hover:bg-[#0b528d]"
      >
        {continueLabel}
        <ArrowRight className="ml-2 size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

function LanguageStep({
  error,
  onContinue,
  onSelect,
  selectedLanguage,
  selectedLanguageCode,
}: {
  error: string | null;
  onContinue: () => void;
  onSelect: (code: LanguageCode) => void;
  selectedLanguage?: (typeof REPORT_LANGUAGE_OPTIONS)[number];
  selectedLanguageCode: LanguageCode | null;
}) {
  return (
    <div>
      <StepHeader
        title="Select your language"
        description="Choose the language you'd like to use for the SafeSpeak report experience."
      />

      <div className="mt-4 rounded-[14px] border border-[#dce5f1] bg-[#f8fbff] p-4 text-xs leading-5 text-[#60718a]">
        {LANGUAGE_TRANSLATION_DISCLAIMER}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="SafeSpeak language">
        {REPORT_LANGUAGE_OPTIONS.map((language) => {
          const selected = language.code === selectedLanguageCode;
          return (
            <button
              key={language.code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(language.code)}
              className={cn(
                "min-h-32 rounded-[14px] border bg-white p-4 text-left transition hover:border-[#9dc2e4] hover:bg-[#f8fbff]",
                selected
                  ? "border-[#0f5d9f] ring-2 ring-[#0f5d9f]/20"
                  : "border-[#dbe5f0]"
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-[#eef6fd] px-2.5 py-1 text-xs font-bold text-[#0f5d9f]">
                  {language.region}
                </span>
                {selected ? (
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#0f5d9f] text-white">
                    <Check size={14} aria-hidden="true" />
                  </span>
                ) : null}
              </span>
              <span className="mt-5 block text-base font-bold text-[#1f2a3a]">
                {language.englishName}
              </span>
              <span className="mt-1 block break-words text-sm text-[#60718a]">
                {language.nativeName}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-[14px] border border-[#dce5f1] bg-[#f8fbff] p-4" aria-live="polite">
        <p className="text-sm font-semibold text-[#1f2a3a]">
          Selected language: {selectedLanguage ? `${selectedLanguage.englishName} / ${selectedLanguage.nativeName}` : "None yet"}
        </p>
        <p className="mt-1 text-xs leading-5 text-[#60718a]">
          This preference is kept in this browser for the current SafeSpeak flow.
        </p>
      </div>

      {error ? (
        <p className="mt-3 text-sm font-semibold text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}

      <FlowActions onContinue={onContinue} />
    </div>
  );
}

function CommunityStep({
  communitySelections,
  faithBackground,
  lifeStage,
  onBack,
  onContinue,
  onFaithChange,
  onLifeStageChange,
  onToggleCommunity,
}: {
  communitySelections: string[];
  faithBackground: string | null;
  lifeStage: string | null;
  onBack: () => void;
  onContinue: () => void;
  onFaithChange: (value: string | null) => void;
  onLifeStageChange: (value: string | null) => void;
  onToggleCommunity: (value: string) => void;
}) {
  const reachedLimit =
    communitySelections.filter((item) => item !== communitySkipOption).length >= 3 &&
    !communitySelections.includes(communitySkipOption);

  return (
    <div>
      <StepHeader
        eyebrow="Optional"
        title="Tell us about your community & faith"
        description="These selections can help SafeSpeak adapt support resources and tone. You can skip anything that does not feel relevant."
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[14px] p-4">
          <SectionTitle
            icon={<UserRoundCheck size={18} aria-hidden="true" />}
            title="Cultural / community background"
            description="You can select up to 3 options. This is completely optional."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {[...communityOptions, communitySkipOption].map((option) => {
              const selected = communitySelections.includes(option);
              const disabled = reachedLimit && !selected && option !== communitySkipOption;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => onToggleCommunity(option)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
                    selected
                      ? "border-[#0f5d9f] bg-[#e7f1fb] text-[#0f5d9f]"
                      : "border-[#dbe5f0] bg-white text-[#334155] hover:bg-[#f8fbff]"
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {reachedLimit ? (
            <p className="mt-3 text-xs font-semibold text-[#0f5d9f]" aria-live="polite">
              You have selected the maximum of three options.
            </p>
          ) : null}
        </Card>

        <div className="grid gap-4">
          <ChoicePanel
            description="Some people prefer support that aligns with their beliefs. Choose one or skip."
            icon={<HeartHandshake size={18} aria-hidden="true" />}
            onChange={onFaithChange}
            options={faithOptions}
            selectedValue={faithBackground}
            title="Faith / spiritual background"
          />
          <ChoicePanel
            description="This helps us tailor content to be most relevant for you."
            icon={<LifeBuoy size={18} aria-hidden="true" />}
            onChange={onLifeStageChange}
            options={lifeStageOptions}
            selectedValue={lifeStage}
            title="Life stage"
          />
        </div>
      </div>

      <p className="mt-5 rounded-[14px] border border-[#dce5f1] bg-[#f8fbff] p-4 text-sm leading-6 text-[#60718a]">
        All selections are optional and can be changed later. Nothing on this page is submitted.
      </p>

      <FlowActions onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[#0f5d9f]">
        {icon}
        <h2 className="text-base font-bold text-[#1f2a3a]">{title}</h2>
      </div>
      <p className="mt-1 text-sm leading-6 text-[#60718a]">{description}</p>
    </div>
  );
}

function ChoicePanel<TOption extends string>({
  description,
  icon,
  onChange,
  options,
  selectedValue,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  onChange: (value: TOption | null) => void;
  options: readonly TOption[];
  selectedValue: string | null;
  title: string;
}) {
  return (
    <Card className="rounded-[14px] p-4">
      <SectionTitle icon={icon} title={title} description={description} />
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={title}>
        {options.map((option) => {
          const selected = selectedValue === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : option)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-semibold transition",
                selected
                  ? "border-[#0f5d9f] bg-[#e7f1fb] text-[#0f5d9f]"
                  : "border-[#dbe5f0] bg-white text-[#334155] hover:bg-[#f8fbff]"
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function AutoFilledBadge() {
  return (
    <Badge className="ml-2 border-[#bfdcf5] bg-[#eef6ff] text-[10px] font-bold text-[#0f5d9f]">
      <Sparkles className="mr-1 size-3" aria-hidden="true" />
      Auto-filled
    </Badge>
  );
}

function OptionalTag() {
  return <span className="ml-1 font-normal text-[#94a3b8]">(optional)</span>;
}

function ReportServiceRow({ service }: { service: TriageSupportOption }) {
  return (
    <div
      className="rounded-[12px] border border-[#e3e8ef] bg-[#f8fafc] p-3"
      data-testid={`report-service-${service.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#1f2a3a]">{service.name}</p>
          <p className="mt-0.5 text-xs text-[#60718a]">{service.category}</p>
        </div>
        {service.recommendationLabel ? (
          <Badge
            className={cn(
              "text-[10px] font-bold",
              service.recommendationPriority === "emergency_only"
                ? "border-[#fecaca] bg-[#fee2e2] text-[#b91c1c]"
                : service.recommendationPriority === "recommended"
                  ? "border-[#bbf7d0] bg-[#dcfce7] text-[#15803d]"
                  : "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]"
            )}
          >
            {service.recommendationLabel}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#475569]">{service.description}</p>
      {service.emergencyOnly ? (
        <p className="mt-1 text-[11px] font-semibold text-[#b91c1c]">
          Call only if you are in immediate danger.
        </p>
      ) : null}
      {service.phoneDial ? (
        <a
          href={`tel:${service.phoneDial}`}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0f5d9f] px-3 text-[11px] font-bold text-white transition hover:bg-[#0b528d]"
        >
          <Phone className="size-3" aria-hidden="true" />
          Call {service.phoneDisplay ?? service.phoneDial}
        </a>
      ) : null}
    </div>
  );
}

function ReportMicrocards({ category }: { category: string }) {
  const [cards, setCards] = useState<MicroEducationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void listPublishedMicroEducation()
      .then((items) => {
        if (!isMounted) return;

        const normalizedCategory = category.toLowerCase();
        const relevant = items.filter((item) => {
          const chips = item.chips.map((chip) => chip.toLowerCase());
          return (
            chips.includes("safety") ||
            (normalizedCategory.includes("physical") && chips.includes("harassment")) ||
            item.incidentCategories?.some((incidentCategory) =>
              normalizedCategory.includes(incidentCategory.replace(/_/g, " "))
            )
          );
        });

        setCards(relevant.slice(0, 4));
      })
      .catch(() => {
        if (isMounted) setCards([]);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [category]);

  if (!isLoading && cards.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4 rounded-[14px] p-4" data-testid="report-microcards">
      <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
        <BookOpen className="size-4 text-[#0f5d9f]" aria-hidden="true" />
        Guidance for this incident
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {isLoading
          ? Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-[12px] bg-[#f1f5f9]"
              />
            ))
          : cards.map((card) => (
              <div
                key={card.id}
                className="rounded-[12px] border border-[#e3e8ef] bg-[#f8fafc] p-3"
              >
                <p className="text-xs font-bold text-[#1f2a3a]">{card.title}</p>
                <p className="mt-1 text-xs leading-5 text-[#60718a]">
                  {card.summary}
                </p>
              </div>
            ))}
      </div>
    </Card>
  );
}

const INCIDENT_PROMPT_CHIPS = [
  "What happened?",
  "When did it happen?",
  "Where did it happen?",
  "Who was involved?",
  "How did it affect you?",
  "Anything else a reviewer should know?",
];

function ReportEntryStep({
  draft,
  autoFilledFields,
  overview,
  fromTriage,
  draftFeedback,
  copyFeedback,
  evidenceItems,
  evidenceError,
  isProcessingEvidence,
  validationMessage,
  onBack,
  onDraftFieldChange,
  onDiscardPrefill,
  onSaveLocalDraft,
  onDownloadTxt,
  onCopyToClipboard,
  onFilesSelected,
  onRemoveEvidence,
  onReviewIncident,
}: {
  draft: ReportDraft;
  autoFilledFields: string[];
  overview: ReportBuilderOverview | null;
  fromTriage: boolean;
  draftFeedback: string | null;
  copyFeedback: string | null;
  evidenceItems: ManualEvidenceItem[];
  evidenceError: string | null;
  isProcessingEvidence: boolean;
  validationMessage: string | null;
  onBack: () => void;
  onDraftFieldChange: <K extends keyof ReportDraft>(
    key: K,
    value: ReportDraft[K]
  ) => void;
  onDiscardPrefill: () => void;
  onSaveLocalDraft: () => void;
  onDownloadTxt: () => void;
  onCopyToClipboard: () => void;
  onFilesSelected: (files: FileList | File[]) => void;
  onRemoveEvidence: (id: string) => void;
  onReviewIncident: () => void;
}) {
  const isAutoFilled = (field: keyof ReportDraft) =>
    autoFilledFields.includes(field);

  return (
    <div>
      <StepHeader
        title="Tell us what happened"
        description="Write your incident description, attach supporting files, or both. Nothing is submitted, shared, or sent anywhere in this prototype — you review everything before continuing."
      />

      {overview ? (
        <>
          <Card
            className="mt-6 rounded-[14px] border-[#dbe5f0] bg-[#f8fbff] p-4"
            data-testid="report-incident-classification"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0f5d9f]">
              Incident classification
            </p>
            <h2 className="mt-1 text-lg font-extrabold text-[#1f2a3a]">
              {toTitleCase(overview.incident.title)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#60718a]">
              {overview.incident.description}
            </p>
            <p className="mt-2 text-xs italic leading-5 text-[#94a3b8]">
              {overview.incident.disclaimer}
            </p>
          </Card>

          <Card className="mt-4 rounded-[14px] border-[#f2d8b0] bg-[#fffaf2] p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-[#9a5b12]"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-bold text-[#9a5b12]">
                  Information, not legal advice
                </p>
                <p className="mt-1 text-xs leading-5 text-[#9a5b12]">
                  SafeSpeak provides information, not legal advice. Nothing is
                  submitted automatically, and you choose what happens next.
                  If you are in immediate danger, call 000.
                </p>
              </div>
            </div>
          </Card>

          <Card
            className="mt-4 rounded-[14px] p-4"
            data-testid="report-conversation-match"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-[#1f2a3a]">What you told us</h2>
                <p className="mt-1 text-sm leading-6 text-[#60718a]">
                  Supported fields below were carried over from your SafeSpeak
                  conversation. Review and edit anything before continuing.
                </p>
              </div>
              {overview.incident.urgencyLevel ? (
                <Badge className="border-[#bfdcf5] bg-[#eef6ff] text-[#0f5d9f]">
                  {overview.incident.urgencyLevel} urgency
                </Badge>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/dashboard?view=assistantconversation"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#dbe5f0] bg-white px-3 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Re-answer Triage
              </Link>
              <Link
                href="/dashboard?view=reportsubmissionsupport"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#dbe5f0] bg-white px-3 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
              >
                Change category
              </Link>
              {autoFilledFields.length > 0 ? (
                <button
                  type="button"
                  onClick={onDiscardPrefill}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#dbe5f0] bg-white px-3 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Discard pre-fill
                </button>
              ) : null}
            </div>
          </Card>

          <Card
            className="mt-4 rounded-[14px] p-4"
            data-testid="report-matched-pathway"
          >
            <h2 className="font-bold text-[#1f2a3a]">Matched pathway</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#94a3b8]">
                  Category
                </p>
                <p className="mt-1 text-sm font-semibold text-[#1f2a3a]">
                  {toTitleCase(overview.matchedPathway.category)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#94a3b8]">
                  Destination
                </p>
                <p className="mt-1 text-sm font-semibold text-[#1f2a3a]">
                  {overview.matchedPathway.destination}
                </p>
              </div>
              {overview.matchedPathway.legalLookupLabel ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#94a3b8]">
                    Legal lookup
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#1f2a3a]">
                    {overview.matchedPathway.legalLookupLabel}
                  </p>
                </div>
              ) : null}
            </div>
            {overview.matchedPathway.autoFilled ? (
              <p className="mt-3 text-xs leading-5 text-[#94a3b8]">
                Auto-filled from your Triage result. SafeSpeak has not
                contacted this destination.
              </p>
            ) : null}
          </Card>

          <ReportMicrocards category={overview.incident.title} />
        </>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-[14px] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="incident-title" className="block sm:col-span-2">
              <span className="flex flex-wrap items-center text-sm font-bold text-[#1f2a3a]">
                Incident Title
                {isAutoFilled("title") ? <AutoFilledBadge /> : null}
              </span>
              <input
                id="incident-title"
                value={draft.title}
                onChange={(event) => onDraftFieldChange("title", event.target.value)}
                placeholder="e.g. Online scam attempt"
                className="mt-2 min-h-11 w-full rounded-full border border-[#dbe5f0] bg-white px-4 text-sm text-[#1f2a3a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
              />
            </label>

            <label htmlFor="incident-summary" className="block sm:col-span-2">
              <span className="flex flex-wrap items-center text-sm font-bold text-[#1f2a3a]">
                What happened?
                {isAutoFilled("summary") ? <AutoFilledBadge /> : null}
              </span>
              <span className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
                {INCIDENT_PROMPT_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11px] font-semibold text-[#64748b]"
                  >
                    {chip}
                  </span>
                ))}
              </span>
              <textarea
                id="incident-summary"
                value={draft.summary}
                onChange={(event) =>
                  onDraftFieldChange("summary", event.target.value)
                }
                placeholder="Describe what happened in your own words. The prompts above are suggestions, not required fields — write as much or as little as feels useful."
                className="mt-2 min-h-48 w-full resize-y rounded-[14px] border border-[#dbe5f0] bg-white p-4 text-sm leading-7 text-[#1f2a3a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
              />
              <span className="mt-1 block text-xs leading-5 text-[#94a3b8]">
                Your words are kept exactly as written. Line breaks and any
                language or script you use are preserved.
              </span>
            </label>

            <label htmlFor="incident-safety" className="block">
              <span className="flex flex-wrap items-center text-sm font-bold text-[#1f2a3a]">
                Are you safe and away from the person who hurt you?
                {isAutoFilled("safetyStatus") ? <AutoFilledBadge /> : null}
              </span>
              <select
                id="incident-safety"
                value={draft.safetyStatus}
                onChange={(event) =>
                  onDraftFieldChange(
                    "safetyStatus",
                    event.target.value as SafetyStatusValue
                  )
                }
                className="mt-2 min-h-11 w-full rounded-full border border-[#dbe5f0] bg-white px-4 text-sm text-[#1f2a3a] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
              >
                <option value="">Prefer not to answer</option>
                <option value="safe">I am safe now</option>
                <option value="unsafe">I am not safe</option>
                <option value="unknown">I&apos;m not sure</option>
              </select>
            </label>

            <label htmlFor="incident-injured" className="block">
              <span className="text-sm font-bold text-[#1f2a3a]">
                Were you injured?
                <OptionalTag />
              </span>
              <select
                id="incident-injured"
                value={draft.wasInjured}
                onChange={(event) =>
                  onDraftFieldChange(
                    "wasInjured",
                    event.target.value as InjuredValue
                  )
                }
                className="mt-2 min-h-11 w-full rounded-full border border-[#dbe5f0] bg-white px-4 text-sm text-[#1f2a3a] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
              >
                <option value="">Skip this question</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
                <option value="unsure">Not sure</option>
              </select>
            </label>

            <label htmlFor="incident-location" className="block">
              <span className="flex flex-wrap items-center text-sm font-bold text-[#1f2a3a]">
                Where did it happen?
                <OptionalTag />
                {isAutoFilled("location") ? <AutoFilledBadge /> : null}
              </span>
              <input
                id="incident-location"
                value={draft.location}
                onChange={(event) =>
                  onDraftFieldChange("location", event.target.value)
                }
                placeholder="City or post code"
                className="mt-2 min-h-11 w-full rounded-full border border-[#dbe5f0] bg-white px-4 text-sm text-[#1f2a3a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
              />
            </label>

            <label htmlFor="incident-date" className="block">
              <span className="text-sm font-bold text-[#1f2a3a]">
                When did it happen?
                <OptionalTag />
              </span>
              <input
                id="incident-date"
                type="date"
                value={draft.date}
                onChange={(event) => onDraftFieldChange("date", event.target.value)}
                className="mt-2 min-h-11 w-full rounded-full border border-[#dbe5f0] bg-white px-4 text-sm text-[#1f2a3a] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
              />
            </label>

            <label htmlFor="incident-relationship" className="block sm:col-span-2">
              <span className="text-sm font-bold text-[#1f2a3a]">
                Do you know the person who did this, or were they a stranger?
                <OptionalTag />
              </span>
              <input
                id="incident-relationship"
                value={draft.relationshipToPerson}
                onChange={(event) =>
                  onDraftFieldChange("relationshipToPerson", event.target.value)
                }
                placeholder="e.g. Stranger, colleague, family member"
                className="mt-2 min-h-11 w-full rounded-full border border-[#dbe5f0] bg-white px-4 text-sm text-[#1f2a3a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
              />
            </label>

            <label htmlFor="incident-evidence" className="block sm:col-span-2">
              <span className="text-sm font-bold text-[#1f2a3a]">
                Were there any witnesses, CCTV, photos, messages, or medical
                records?
                <OptionalTag />
              </span>
              <textarea
                id="incident-evidence"
                value={draft.evidenceContext}
                onChange={(event) =>
                  onDraftFieldChange("evidenceContext", event.target.value)
                }
                placeholder="Note anything you have. Nothing is uploaded automatically."
                className="mt-2 min-h-24 w-full resize-y rounded-[14px] border border-[#dbe5f0] bg-white p-4 text-sm leading-7 text-[#1f2a3a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
              />
            </label>
          </div>
        </Card>

        <aside className="grid gap-4">
          <Card className="rounded-[14px] p-4">
            <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
              <Save className="size-4 text-[#0f5d9f]" aria-hidden="true" />
              Draft status
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#60718a]">
              Saved locally in this browser&apos;s session storage:{" "}
              <span className="font-semibold text-[#1f2a3a]">
                {formatTimestamp(draft.updatedAt)}
              </span>
            </p>
            <p className="mt-2 text-xs leading-5 text-[#60718a]">
              Closing this browser session may remove the draft. No report API
              is called.
            </p>
          </Card>

          <EvidenceUploadPanel
            evidenceItems={evidenceItems}
            evidenceError={evidenceError}
            isProcessingEvidence={isProcessingEvidence}
            onFilesSelected={onFilesSelected}
            onRemoveEvidence={onRemoveEvidence}
          />

          {overview && overview.services.length > 0 ? (
            <Card
              className="rounded-[14px] p-4"
              data-testid="report-tailored-services"
            >
              <h2 className="font-bold text-[#1f2a3a]">Where to go next</h2>
              <div className="mt-3 grid gap-3">
                {[...overview.services]
                  .sort((a, b) => a.order - b.order)
                  .map((service) => (
                    <ReportServiceRow key={service.id} service={service} />
                  ))}
              </div>
            </Card>
          ) : null}

          {overview ? (
            <Card
              className="rounded-[14px] p-4"
              data-testid="report-legal-information"
            >
              <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
                <Scale className="size-4 text-[#0f5d9f]" aria-hidden="true" />
                Legal information
              </h2>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#94a3b8]">
                Jurisdiction: {overview.legalInfo.jurisdiction}
              </p>
              <p className="mt-2 text-xs leading-5 text-[#60718a]">
                {overview.legalInfo.summary}
              </p>
              <p className="mt-2 text-[11px] italic leading-5 text-[#94a3b8]">
                {overview.legalInfo.citationPolicy}
              </p>
            </Card>
          ) : null}
        </aside>
      </div>

      <Card
        className="mt-4 rounded-[14px] p-4"
        data-testid="report-local-draft-preview"
      >
        <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
          <FileText className="size-4 text-[#0f5d9f]" aria-hidden="true" />
          Local report draft
        </h2>
        <p className="mt-1 text-xs leading-5 text-[#60718a]">
          Generated in your browser from the details above. Nothing is
          submitted, shared, or sent to a service. You decide whether and when
          to save, download, copy, or review it.
        </p>
        <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[12px] border border-[#e3e8ef] bg-[#f8fafc] p-3 text-xs leading-5 text-[#334155]">
          {buildReportDraftText(draft, overview)}
        </pre>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={onSaveLocalDraft}
            className="min-h-10 rounded-full"
          >
            <Save className="mr-2 size-4" aria-hidden="true" />
            Save local draft
          </Button>
          <Button
            variant="outline"
            onClick={onDownloadTxt}
            className="min-h-10 rounded-full"
          >
            <Download className="mr-2 size-4" aria-hidden="true" />
            Download .txt
          </Button>
          <Button
            variant="outline"
            onClick={onCopyToClipboard}
            className="min-h-10 rounded-full"
          >
            <Copy className="mr-2 size-4" aria-hidden="true" />
            Copy
          </Button>
        </div>
        <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs font-semibold text-[#0f5d9f]">
          {draftFeedback ?? copyFeedback ?? ""}
        </p>
      </Card>

      {validationMessage ? (
        <p
          className="mt-4 text-sm font-semibold text-[#b42318]"
          role="alert"
          aria-live="assertive"
        >
          {validationMessage}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#e3ebf5] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={onBack} className="min-h-11 rounded-full">
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          {fromTriage ? "Back to Triage" : "Back to Community"}
        </Button>
        <Button
          onClick={onReviewIncident}
          className="min-h-11 rounded-full bg-[#0f5d9f] hover:bg-[#0b528d]"
        >
          Review your incident
          <ArrowRight className="ml-2 size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function EvidenceUploadPanel({
  evidenceItems,
  evidenceError,
  isProcessingEvidence,
  onFilesSelected,
  onRemoveEvidence,
}: {
  evidenceItems: ManualEvidenceItem[];
  evidenceError: string | null;
  isProcessingEvidence: boolean;
  onFilesSelected: (files: FileList | File[]) => void;
  onRemoveEvidence: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  function openFileBrowser(): void {
    fileInputRef.current?.click();
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragActive(false);
    if (event.dataTransfer.files?.length) {
      onFilesSelected(event.dataTransfer.files);
    }
  }

  return (
    <Card className="rounded-[14px] p-4" data-testid="evidence-upload-panel">
      <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
        <Upload className="size-4 text-[#0f5d9f]" aria-hidden="true" />
        Supporting evidence
        <span className="font-normal text-[#94a3b8]">(optional)</span>
      </h2>
      <p className="mt-1 text-xs leading-5 text-[#60718a]">
        Attach {MANUAL_EVIDENCE_ACCEPTED_FORMATS_LABEL.toLowerCase()}. Up to{" "}
        {MANUAL_EVIDENCE_LIMITS.maxFileCount} files, {formatFileSize(MANUAL_EVIDENCE_LIMITS.maxFileSizeBytes)}{" "}
        each. Files stay on this device — nothing is uploaded to a server in
        this prototype.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={openFileBrowser}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFileBrowser();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          "mt-3 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-dashed p-4 text-center transition",
          isDragActive
            ? "border-[#0f5d9f] bg-[#f2f8fd]"
            : "border-[#cbd8e6] bg-[#f8fbff] hover:bg-[#f2f8fd]"
        )}
        aria-label="Browse or drop files to attach as supporting evidence"
      >
        <Upload className="size-5 text-[#0f5d9f]" aria-hidden="true" />
        <span className="text-xs font-semibold text-[#0f5d9f]">
          Browse files or drag and drop
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={MANUAL_EVIDENCE_ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) {
              onFilesSelected(event.target.files);
            }
            event.target.value = "";
          }}
        />
      </div>

      {isProcessingEvidence ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#0f5d9f]" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Preparing attached files...
        </p>
      ) : null}

      {evidenceError ? (
        <p className="mt-3 text-xs font-semibold text-[#b42318]" role="alert">
          {evidenceError}
        </p>
      ) : null}

      {evidenceItems.length > 0 ? (
        <div className="mt-3 grid gap-2" aria-label="Attached files">
          {evidenceItems.map((item) => (
            <EvidenceAttachmentCard
              key={item.id}
              item={item}
              onRemove={onRemoveEvidence}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-[#94a3b8]">
          No files attached yet.
        </p>
      )}

      <p className="mt-3 text-[11px] italic leading-5 text-[#94a3b8]">
        File-content extraction is simulated in this prototype — attached
        files are not analysed, transcribed, or read by AI.
      </p>
    </Card>
  );
}

export { ReportSubmissionDetailsPage };
