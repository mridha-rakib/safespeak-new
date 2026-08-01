"use client";

import type { Route } from "next";

import type { ReportBuilderOverview } from "@/lib/report-builder-view-model";
import type { ReportDestinationPreview } from "@/lib/reports-client";
import { buildDemoSupportOptions } from "@/lib/triage-view-model";

/**
 * Canonical step ids for the guided "Review your incident" onboarding that
 * runs entirely under `view=reportsubmissiondetails`. Distinct from the
 * details page's own pre-report onboarding steps (language/community/
 * information/privacy/services/report) and from `report`, which already
 * names the editable Incident Builder form step - "preview" is used instead
 * of the reference wording "report" for stage 3 to avoid colliding with
 * that existing step id.
 */
export type ReportReviewOnboardingStepId =
  | "review"
  | "next"
  | "preview"
  | "destination"
  | "consent"
  | "complete";

export type ReportReviewOnboardingStepConfig = {
  id: ReportReviewOnboardingStepId;
  label: string;
  queryValue: string;
  previous: ReportReviewOnboardingStepId | null;
  next: ReportReviewOnboardingStepId | null;
  order: number;
  requiresDestination: boolean;
  requiresConsent: boolean;
  allowDirectAccess: boolean;
};

export const REPORT_REVIEW_ONBOARDING_STEPS: Record<
  ReportReviewOnboardingStepId,
  ReportReviewOnboardingStepConfig
> = {
  review: {
    id: "review",
    label: "Review",
    queryValue: "review",
    previous: null,
    next: "next",
    order: 0,
    requiresDestination: false,
    requiresConsent: false,
    allowDirectAccess: true,
  },
  next: {
    id: "next",
    label: "Next",
    queryValue: "next",
    previous: "review",
    next: "preview",
    order: 1,
    requiresDestination: false,
    requiresConsent: false,
    allowDirectAccess: true,
  },
  preview: {
    id: "preview",
    label: "Report",
    queryValue: "preview",
    previous: "next",
    next: "destination",
    order: 2,
    requiresDestination: false,
    requiresConsent: false,
    allowDirectAccess: true,
  },
  destination: {
    id: "destination",
    label: "Destination",
    queryValue: "destination",
    previous: "preview",
    next: "consent",
    order: 3,
    requiresDestination: false,
    requiresConsent: false,
    allowDirectAccess: true,
  },
  consent: {
    id: "consent",
    label: "Consent",
    queryValue: "consent",
    previous: "destination",
    next: "complete",
    order: 4,
    requiresDestination: true,
    requiresConsent: false,
    allowDirectAccess: false,
  },
  complete: {
    id: "complete",
    label: "Complete",
    queryValue: "complete",
    previous: "consent",
    next: null,
    order: 5,
    requiresDestination: true,
    requiresConsent: true,
    allowDirectAccess: false,
  },
};

export const REPORT_REVIEW_ONBOARDING_STEP_ORDER: ReportReviewOnboardingStepConfig[] =
  Object.values(REPORT_REVIEW_ONBOARDING_STEPS).sort(
    (a, b) => a.order - b.order
  );

export function isReportReviewOnboardingStep(
  value: string | null | undefined
): value is ReportReviewOnboardingStepId {
  return Boolean(value) && value! in REPORT_REVIEW_ONBOARDING_STEPS;
}

export function reportReviewOnboardingStepHref(
  step: ReportReviewOnboardingStepId,
  fromTriage: boolean
): Route {
  const suffix = fromTriage ? "&fromTriage=1" : "";
  return `/dashboard?view=reportsubmissiondetails&step=${step}${suffix}` as Route;
}

/**
 * Phase 8 — the manual entry flow's post-"Incident Report" stages. Distinct
 * from `REPORT_REVIEW_ONBOARDING_STEPS` (which stays exactly as it was, and
 * continues to serve the Assistant/Triage entry path via `fromTriage=1`):
 * the manual flow has no "Choose your next step" or "Report preview"
 * sub-stages — its Review stage is a single, richer, editable stage that
 * replaces both. `destination`/`consent`/`complete` reuse the exact same
 * `DestinationStage`/`ConsentStage`/`CompleteStage` components as the
 * Triage path — only the step *sequence* differs, per Phase 8 scope.
 */
export type ManualReviewOnboardingStepId =
  | "review"
  | "destination"
  | "consent"
  | "complete";

export const MANUAL_REVIEW_ONBOARDING_STEPS: Record<
  ManualReviewOnboardingStepId,
  ReportReviewOnboardingStepConfig
> = {
  review: {
    id: "review",
    label: "Review",
    queryValue: "review",
    previous: null,
    next: "destination",
    order: 0,
    requiresDestination: false,
    requiresConsent: false,
    allowDirectAccess: true,
  },
  destination: {
    id: "destination",
    label: "Destination",
    queryValue: "destination",
    previous: "review",
    next: "consent",
    order: 1,
    requiresDestination: false,
    requiresConsent: false,
    allowDirectAccess: true,
  },
  consent: {
    id: "consent",
    label: "Consent",
    queryValue: "consent",
    previous: "destination",
    next: "complete",
    order: 2,
    requiresDestination: true,
    requiresConsent: false,
    allowDirectAccess: false,
  },
  complete: {
    id: "complete",
    label: "Complete",
    queryValue: "complete",
    previous: "consent",
    next: null,
    order: 3,
    requiresDestination: true,
    requiresConsent: true,
    allowDirectAccess: false,
  },
};

export const MANUAL_REVIEW_ONBOARDING_STEP_ORDER: ReportReviewOnboardingStepConfig[] =
  Object.values(MANUAL_REVIEW_ONBOARDING_STEPS).sort(
    (a, b) => a.order - b.order
  );

export function isManualReviewOnboardingStep(
  value: string | null | undefined
): value is ManualReviewOnboardingStepId {
  return Boolean(value) && value! in MANUAL_REVIEW_ONBOARDING_STEPS;
}

/**
 * The canonical seven visible stages of the manual report journey, used to
 * drive one consistent "Step X of 7" progress readout across both the
 * pre-Incident-Report stages (Language/Community/Incident Report, rendered
 * by `report-submission-details-page.tsx`'s own `steps` array) and the
 * post-Incident-Report onboarding stages above. `detailsStepId` is the
 * query value used by the pre-report `steps` array; `onboardingStepId` is
 * the query value used by `MANUAL_REVIEW_ONBOARDING_STEPS`.
 */
export const MANUAL_REPORT_FLOW_STAGES = [
  { label: "Language", detailsStepId: "language" as const },
  { label: "Community", detailsStepId: "community" as const },
  { label: "Incident Report", detailsStepId: "report" as const },
  { label: "Review", onboardingStepId: "review" as const },
  { label: "Destination", onboardingStepId: "destination" as const },
  { label: "Consent", onboardingStepId: "consent" as const },
  { label: "Complete", onboardingStepId: "complete" as const },
] as const;

/**
 * Old pre-report onboarding step ids being removed from the manual flow
 * (Know/Privacy/Hub/Services) map to the Incident Report stage rather than
 * restarting the flow, so a bookmarked/old link never loses progress or
 * crashes. Centralised here — no other component should redirect these ids
 * itself.
 */
export const LEGACY_MANUAL_DETAILS_STEP_MAP: Record<string, "report"> = {
  know: "report",
  information: "report",
  privacy: "report",
  hub: "report",
  services: "report",
};

/**
 * The manual flow has no "next"/"preview" sub-stages (those remain
 * Triage-only). A manual-entry user who lands directly on one of those
 * query values is normalised to the manual Review stage, keeping their
 * draft intact rather than erroring or rendering a Triage-only page.
 */
export function normalizeManualOnboardingStep(
  value: string
): ManualReviewOnboardingStepId | null {
  if (isManualReviewOnboardingStep(value)) {
    return value;
  }

  if (value === "next" || value === "preview") {
    return "review";
  }

  return null;
}

/** Australian jurisdiction options for the Destination stage's jurisdiction selector. */
export const AU_JURISDICTIONS: Array<{ code: string; label: string }> = [
  { code: "auto", label: "Auto (use my current location)" },
  { code: "NSW", label: "New South Wales" },
  { code: "VIC", label: "Victoria" },
  { code: "QLD", label: "Queensland" },
  { code: "WA", label: "Western Australia" },
  { code: "SA", label: "South Australia" },
  { code: "TAS", label: "Tasmania" },
  { code: "ACT", label: "Australian Capital Territory" },
  { code: "NT", label: "Northern Territory" },
];

export type DestinationCapabilities = {
  information: boolean;
  reportPreparation: boolean;
  externalContact: boolean;
  secureSharing: boolean;
};

export type DestinationOption = {
  id: string;
  name: string;
  description: string;
  reason?: string;
  jurisdiction?: string;
  capabilities: DestinationCapabilities;
  source: "backend" | "manual";
  phoneDial?: string;
  phoneDisplay?: string;
  href?: string;
};

/**
 * Builds the manual/local-demo destination directory from the same
 * triage-derived services already shown on the editable report step
 * (Police Assistance Line, Victims Services, Healthdirect, Triple Zero,
 * etc.), so the Destination stage has a safe fallback that needs no
 * backend report id.
 *
 * Phase 8 — when there's no Triage-matched `overview` (a purely manual
 * entry that never touched Triage, or a Triage session with no recognised
 * concern type), this falls back to the same `buildDemoSupportOptions()`
 * catalogue `buildReportBuilderOverview` itself uses — not a new
 * destination list. Without this fallback the Destination stage would show
 * zero options and permanently block a manual-only user, since it's the
 * only place destinations are sourced from when there's no backend report
 * id.
 */
export function buildManualDestinationOptions(
  overview: ReportBuilderOverview | null
): DestinationOption[] {
  const services = overview?.services ?? buildDemoSupportOptions();

  return services.map((service) => ({
    id: `manual-${service.id}`,
    name: service.name,
    description: service.description,
    reason: service.reason,
    jurisdiction: service.jurisdiction,
    source: "manual" as const,
    phoneDial: service.phoneDial,
    phoneDisplay: service.phoneDisplay,
    href: service.url,
    capabilities: {
      information: true,
      reportPreparation: true,
      externalContact: Boolean(service.phoneDial || service.url),
      secureSharing: false,
    },
  }));
}

export function mapBackendDestinationPreview(
  preview: ReportDestinationPreview
): DestinationOption {
  const canAutoSend = Boolean(preview.deliveryReadiness?.canAutoSend);

  return {
    id: preview.destinationId,
    name: preview.destinationName,
    description: preview.reason,
    reason: preview.reason,
    jurisdiction: preview.jurisdiction,
    source: "backend",
    phoneDisplay: preview.contactPhone,
    href: preview.endpoint,
    capabilities: {
      information: true,
      reportPreparation: true,
      externalContact: Boolean(preview.contactPhone || preview.contactEmail),
      secureSharing: canAutoSend,
    },
  };
}
