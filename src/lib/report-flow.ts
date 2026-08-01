"use client";

import type { Route } from "next";

import type { AssistantIncidentCategory } from "@/lib/assistant-categories";
import type { DashboardCardFlowId } from "@/lib/dashboard-card-flows";

const REPORT_FLOW_DRAFT_KEY = "safespeak_report_flow_draft";
const REPORT_FLOW_CURRENT_REPORT_ID_KEY = "safespeak_current_report_id";
const REPORT_FLOW_VIEW_QUERY_KEY = "view";
const REPORT_FLOW_REPORT_ID_QUERY_KEY = "reportId";
const REPORT_FLOW_DESTINATION_ID_QUERY_KEY = "destinationId";
const REPORT_FLOW_SUBMISSION_ID_QUERY_KEY = "submissionId";

export type ReportFlowDraft = {
  reportId?: string;
  selectedDestinationId?: string;
  selectedDestinationName?: string;
  /**
   * Phase 7.2 — `"mock_bundle"` marks a selection made against the governed
   * Published mock bundle (via `MockContentRepository`, e.g. Triage's "Use
   * this reporting option"), as distinct from `"backend"` (a live
   * `ReportDestinationPreview` from `getReportDestinations()`) and
   * `"manual"` (`buildManualDestinationOptions()`'s triage-service-derived
   * fallback list in the onboarding Destination step). This is an additive
   * union member — existing `"backend"`/`"manual"` drafts are unaffected,
   * no migration of stored data is needed.
   */
  selectedDestinationSource?: "backend" | "manual" | "mock_bundle";
  jurisdiction?: string;
  consentGranted?: boolean;
  consentGrantedAt?: string;
  consentMode?: "backend" | "local_only";
  latestSubmissionId?: string;
  shareAnonymityMode?: "identified" | "anonymous" | "pseudonymous";
  shareNotes?: string;
  preparedSubmission?: {
    destinationId: string;
    destinationName: string;
    destinationType?: string;
    channel: string;
    status:
      | "ready_to_share"
      | "submitted"
      | "acknowledged"
      | "requires_manual_action"
      | "config_missing"
      | "failed";
    missingRequiredInfo?: string[];
    reason?: string;
    message?: string;
    actuallySent?: boolean;
    updatedAt: string;
  };
  title: string;
  date: string;
  location: string;
  summary: string;
  safetyStatus?: "safe" | "unsafe" | "unknown" | "";
  structuredFields?: Record<string, unknown>;
  incidentType?: string;
  incidentCategory?: AssistantIncidentCategory;
  topic?: DashboardCardFlowId;
  starterPrompt?: string;
  evidenceIds: string[];
  /**
   * Phase 8 — stable language code selected on the manual flow's Language
   * stage (e.g. `"en-AU"`), plus the human-readable label captured at
   * selection time so Review/Consent/Complete never need to re-resolve it
   * against the catalogue. Never rendered as a raw code on its own.
   */
  language?: string;
  languageLabel?: string;
  /** Readable community-background selection(s), or the explicit skip label. Never inferred from other fields. */
  community?: string;
  communityLabel?: string;
  /** Which entry point produced this draft — informs copy, not gating logic. */
  entrySource?: "manual" | "triage";
  updatedAt: string;
};

export type PreparedSubmissionStatus = NonNullable<
  ReportFlowDraft["preparedSubmission"]
>["status"];

export const defaultReportFlowDraft: Omit<ReportFlowDraft, "updatedAt"> = {
  title: "",
  date: "",
  location: "",
  summary: "",
  evidenceIds: [],
};

export function getReportFlowDraft(): ReportFlowDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(REPORT_FLOW_DRAFT_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ReportFlowDraft;
  } catch {
    window.sessionStorage.removeItem(REPORT_FLOW_DRAFT_KEY);
    return null;
  }
}

function getReportFlowStoredReportId(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (
    window.sessionStorage.getItem(REPORT_FLOW_CURRENT_REPORT_ID_KEY) ??
    undefined
  );
}

export function getReportFlowQueryState(): Partial<
  Pick<
    ReportFlowDraft,
    "reportId" | "selectedDestinationId" | "latestSubmissionId"
  >
> {
  if (typeof window === "undefined") {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const reportId = params.get(REPORT_FLOW_REPORT_ID_QUERY_KEY) ?? undefined;
  const selectedDestinationId =
    params.get(REPORT_FLOW_DESTINATION_ID_QUERY_KEY) ?? undefined;
  const latestSubmissionId =
    params.get(REPORT_FLOW_SUBMISSION_ID_QUERY_KEY) ?? undefined;
  const queryState: Partial<
    Pick<
      ReportFlowDraft,
      "reportId" | "selectedDestinationId" | "latestSubmissionId"
    >
  > = {};

  if (reportId) {
    queryState.reportId = reportId;
  }

  if (selectedDestinationId) {
    queryState.selectedDestinationId = selectedDestinationId;
  }

  if (latestSubmissionId) {
    queryState.latestSubmissionId = latestSubmissionId;
  }

  return queryState;
}

export function getResolvedReportFlowDraft(): ReportFlowDraft | null {
  const draft = getReportFlowDraft();
  const queryState = getReportFlowQueryState();
  const storedReportId = getReportFlowStoredReportId();

  if (
    !draft &&
    !queryState.reportId &&
    !storedReportId &&
    !queryState.selectedDestinationId
  ) {
    return null;
  }

  return {
    ...defaultReportFlowDraft,
    ...(storedReportId ? { reportId: storedReportId } : {}),
    ...draft,
    ...queryState,
    evidenceIds: draft?.evidenceIds ?? [],
    updatedAt: draft?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function buildReportFlowHref(
  view: string,
  state: Partial<
    Pick<
      ReportFlowDraft,
      "reportId" | "selectedDestinationId" | "latestSubmissionId"
    >
  > = {}
): Route {
  const params = new URLSearchParams();

  params.set(REPORT_FLOW_VIEW_QUERY_KEY, view);

  if (state.reportId) {
    params.set(REPORT_FLOW_REPORT_ID_QUERY_KEY, state.reportId);
  }

  if (state.selectedDestinationId) {
    params.set(
      REPORT_FLOW_DESTINATION_ID_QUERY_KEY,
      state.selectedDestinationId
    );
  }

  if (state.latestSubmissionId) {
    params.set(REPORT_FLOW_SUBMISSION_ID_QUERY_KEY, state.latestSubmissionId);
  }

  return `/dashboard?${params.toString()}` as Route;
}

export function saveReportFlowDraft(
  draft: Omit<ReportFlowDraft, "updatedAt">
): ReportFlowDraft {
  const nextDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
  } satisfies ReportFlowDraft;

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(
      REPORT_FLOW_DRAFT_KEY,
      JSON.stringify(nextDraft)
    );

    if (nextDraft.reportId) {
      window.sessionStorage.setItem(
        REPORT_FLOW_CURRENT_REPORT_ID_KEY,
        nextDraft.reportId
      );
    }
  }

  return nextDraft;
}

export function mergeReportFlowDraft(
  partialDraft: Partial<Omit<ReportFlowDraft, "updatedAt">>
): ReportFlowDraft {
  const currentDraft = getResolvedReportFlowDraft();

  return saveReportFlowDraft({
    ...defaultReportFlowDraft,
    ...currentDraft,
    ...partialDraft,
    evidenceIds: partialDraft.evidenceIds ?? currentDraft?.evidenceIds ?? [],
  });
}

export function clearReportFlowDraft(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(REPORT_FLOW_DRAFT_KEY);
  window.sessionStorage.removeItem(REPORT_FLOW_CURRENT_REPORT_ID_KEY);
}

/**
 * Phase 7.2 — the one shared helper every destination-selection surface
 * (Triage's "Use this reporting option", the onboarding Destination step)
 * uses to update `selectedDestinationId`/`selectedDestinationName`/
 * `selectedDestinationSource` on the canonical draft. Never duplicates the
 * update logic per call site.
 *
 * Selecting a *different* destination than the one currently stored
 * invalidates prior consent and any prepared submission — consenting to
 * share with destination A must not silently carry over to destination B.
 * Re-selecting the *same* destination is a no-op beyond refreshing
 * `updatedAt` (idempotent — never clears consent/submission state that is
 * still valid for the same selection).
 */
export function updateSelectedReportDestination(input: {
  id: string;
  name: string;
  source: NonNullable<ReportFlowDraft["selectedDestinationSource"]>;
}): ReportFlowDraft {
  const current = getResolvedReportFlowDraft();
  const isSameSelection = current?.selectedDestinationId === input.id;

  return mergeReportFlowDraft({
    selectedDestinationId: input.id,
    selectedDestinationName: input.name,
    selectedDestinationSource: input.source,
    ...(isSameSelection
      ? {}
      : {
          consentGranted: undefined,
          consentGrantedAt: undefined,
          consentMode: undefined,
          preparedSubmission: undefined,
          latestSubmissionId: undefined,
        }),
  });
}
