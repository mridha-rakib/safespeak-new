"use client";

import { useEffect, useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  HeartHandshake,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConsentRequiredCard } from "@/components/consent/consent-required-card";
import { useConsentGate } from "@/hooks/use-consent-gate";
import { consentRequirements } from "@/lib/consent";
import { resolveSelectedReportDestination } from "@/lib/mock/report-destination-resolver";
import { REPORT_DESTINATION_TRISTATE_LABEL } from "@/lib/mock/report-destination-view-model";
import type { ReportBuilderOverview } from "@/lib/report-builder-view-model";
import { formatTimestamp, toTitleCase } from "@/lib/report-draft-text";
import {
  getResolvedReportFlowDraft,
  mergeReportFlowDraft,
  updateSelectedReportDestination,
} from "@/lib/report-flow";
import {
  AU_JURISDICTIONS,
  REPORT_REVIEW_ONBOARDING_STEP_ORDER,
  REPORT_REVIEW_ONBOARDING_STEPS,
  buildManualDestinationOptions,
  mapBackendDestinationPreview,
  type DestinationOption,
  type ReportReviewOnboardingStepId,
} from "@/lib/report-review-onboarding";
import { getReportDestinations } from "@/lib/reports-client";
import { buildStandardTriageResourceGroups } from "@/lib/triage-view-model";
import { cn } from "@/lib/utils";

import {
  IncidentReviewSummary,
  SummaryRow,
  readField,
  safetyStatusLabel,
} from "./report-submission-incident-review-page";

type RouterProps = {
  step: ReportReviewOnboardingStepId;
  overview: ReportBuilderOverview | null;
  onGoToStep: (step: ReportReviewOnboardingStepId) => void;
  onEditDetails: () => void;
};

/** Shared six-step progress indicator, visually consistent with the details page's own ProgressIndicator. */
function ReportReviewOnboardingProgress({
  currentStepId,
}: {
  currentStepId: ReportReviewOnboardingStepId;
}) {
  const currentIndex = REPORT_REVIEW_ONBOARDING_STEP_ORDER.findIndex(
    (step) => step.id === currentStepId
  );
  const progress =
    ((currentIndex + 1) / REPORT_REVIEW_ONBOARDING_STEP_ORDER.length) * 100;
  const currentLabel = REPORT_REVIEW_ONBOARDING_STEP_ORDER[currentIndex]?.label;

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-[#0f5d9f]">
            Step {currentIndex + 1} of {REPORT_REVIEW_ONBOARDING_STEP_ORDER.length}
          </p>
          <p className="mt-1 text-xs text-[#60718a]">
            {currentLabel} in the guided report review
          </p>
        </div>
        <ol
          className="flex flex-wrap gap-1.5"
          aria-label="Guided report review progress"
        >
          {REPORT_REVIEW_ONBOARDING_STEP_ORDER.map((step, index) => (
            <li key={step.id}>
              <span
                aria-current={step.id === currentStepId ? "step" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  index === currentIndex
                    ? "bg-[#0f5d9f] text-white"
                    : index < currentIndex
                      ? "bg-[#e7f1fb] text-[#0f5d9f]"
                      : "bg-[#f1f5f9] text-[#64748b]"
                )}
              >
                {step.label}
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

function OnboardingStepHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="max-w-3xl">
      <h1
        id="report-flow-heading"
        className="text-3xl font-extrabold tracking-normal text-[#1f2a3a] sm:text-4xl"
      >
        {title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#60718a] sm:text-base">
        {description}
      </p>
    </header>
  );
}

function StageActions({
  onBack,
  backLabel = "Back",
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
}: {
  onBack?: () => void;
  backLabel?: string;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#e3ebf5] pt-5 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <Button variant="outline" onClick={onBack} className="min-h-11 rounded-full">
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button
        onClick={onContinue}
        disabled={continueDisabled}
        className="min-h-11 rounded-full bg-[#0f5d9f] hover:bg-[#0b528d] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {continueLabel}
        <ArrowRight className="ml-2 size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Stage 1 - Review your incident */
function ReviewStage({
  onEditDetails,
  onContinue,
}: {
  onEditDetails: () => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <OnboardingStepHeader
        title="Review your incident"
        description="SafeSpeak has organised the information you provided. Review it below before deciding what happens next."
      />
      <IncidentReviewSummary
        onEditDetails={onEditDetails}
        onContinue={onContinue}
        continueLabel="Continue"
      />
    </div>
  );
}

/** Stage 2 - Choose your next step */
function NextStepStage({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const resourceGroups = buildStandardTriageResourceGroups();

  return (
    <div>
      <OnboardingStepHeader
        title="Choose your next step"
        description="You decide what happens with your information. Nothing is shared without your explicit consent."
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {resourceGroups.map((group) => (
          <Card key={group.id} className="rounded-[14px] p-4">
            <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
              {group.id === "get-support" ? (
                <HeartHandshake className="size-4 text-[#0f5d9f]" aria-hidden="true" />
              ) : (
                <BookOpen className="size-4 text-[#0f5d9f]" aria-hidden="true" />
              )}
              {group.heading}
            </h2>
            <div className="mt-3 grid gap-3">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[12px] border border-[#e3e8ef] bg-[#f8fafc] p-3"
                  data-testid={`next-step-resource-${item.id}`}
                >
                  <p className="text-sm font-bold text-[#1f2a3a]">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#60718a]">
                    {item.description}
                  </p>
                  {item.phoneDial ? (
                    <a
                      href={`tel:${item.phoneDial}`}
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0f5d9f] px-3 text-[11px] font-bold text-white transition hover:bg-[#0b528d]"
                    >
                      Call {item.phoneDisplay ?? item.phoneDial}
                    </a>
                  ) : item.href ? (
                    <a
                      href={item.href}
                      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#dbe5f0] bg-white px-3 text-[11px] font-bold text-[#0f5d9f] transition hover:bg-[#f8fbff]"
                    >
                      {item.actionLabel}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-5 rounded-[14px] border border-[#dce5f1] bg-[#f8fbff] p-4 text-sm leading-6 text-[#60718a]">
        Opening a service or calling a number is your choice. SafeSpeak does
        not contact anyone automatically.
      </p>

      <StageActions onBack={onBack} onContinue={onContinue} />
    </div>
  );
}

/** Stage 3 - Report preview */
function ReportPreviewStage({
  overview,
  onEditDetails,
  onBack,
  onContinue,
}: {
  overview: ReportBuilderOverview | null;
  onEditDetails: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const resolvedDraft = getResolvedReportFlowDraft();
  const structuredFields = resolvedDraft?.structuredFields;
  const whatHappened = readField(structuredFields, "what");
  const injuryInfo = readField(structuredFields, "injuries");
  const locationInfo = readField(structuredFields, "where");
  const whenInfo = readField(structuredFields, "when");
  const personInvolved = readField(structuredFields, "who");
  const witnessOrEvidence = readField(structuredFields, "witnesses");
  const matchedCategory = resolvedDraft?.incidentType
    ? toTitleCase(resolvedDraft.incidentType)
    : null;
  const safetyStatus = safetyStatusLabel(resolvedDraft?.safetyStatus);

  function buildPreviewText(): string {
    const lines = [
      `SafeSpeak report preview (${formatTimestamp(resolvedDraft?.updatedAt ?? null)})`,
      "This is a prepared preview only. Nothing has been sent.",
      "",
      `Category: ${matchedCategory ?? "Not classified"}`,
      `Safety status: ${safetyStatus ?? "Not provided"}`,
      `What happened: ${whatHappened ?? "Not provided"}`,
      `Injury: ${injuryInfo ?? "Not provided"}`,
      `Location: ${locationInfo ?? "Not provided"}`,
      `Date/time: ${whenInfo ?? "Not provided"}`,
      `Person involved: ${personInvolved ?? "Not provided"}`,
      `Witnesses / evidence: ${witnessOrEvidence ?? "Not provided"}`,
    ];

    if (overview) {
      lines.push("", `Triage indicator: ${overview.incident.disclaimer}`);
    }

    return lines.join("\n");
  }

  function handleDownload(): void {
    try {
      const blob = new Blob([buildPreviewText()], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "safespeak-report-preview.txt";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setFeedback("Downloaded safespeak-report-preview.txt");
    } catch {
      setFeedback("Could not generate the download. Try again.");
    }
  }

  return (
    <div>
      <OnboardingStepHeader
        title="Report preview"
        description="SafeSpeak has prepared a structured report. Nothing has been sent. You can edit it before choosing a destination."
      />

      <Card className="mt-6 rounded-[14px] p-4" data-testid="report-preview-summary">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7c8da3]">
          Created {formatTimestamp(resolvedDraft?.updatedAt ?? null)}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SummaryRow label="Category" value={matchedCategory ?? "Not classified"} />
          <SummaryRow label="Safety status" value={safetyStatus ?? "Not provided"} />
          <SummaryRow label="What happened" value={whatHappened ?? "Not provided"} />
          {injuryInfo ? <SummaryRow label="Injury" value={injuryInfo} /> : null}
          {locationInfo ? (
            <SummaryRow label="Location" value={locationInfo} />
          ) : null}
          {whenInfo ? <SummaryRow label="Date / time" value={whenInfo} /> : null}
          {personInvolved ? (
            <SummaryRow label="Person involved" value={personInvolved} />
          ) : null}
          {witnessOrEvidence ? (
            <SummaryRow label="Witnesses / evidence" value={witnessOrEvidence} />
          ) : null}
        </div>
      </Card>

      {overview ? (
        <Card className="mt-4 rounded-[14px] p-4">
          <h2 className="font-bold text-[#1f2a3a]">Triage indicator</h2>
          <p className="mt-2 text-sm leading-6 text-[#60718a]">
            {overview.incident.disclaimer}
          </p>
        </Card>
      ) : null}

      <div className="mt-4 rounded-[14px] border border-[#f2d8b0] bg-[#fffaf2] p-4 text-xs leading-5 text-[#9a5b12]">
        SafeSpeak provides information, not legal advice. Nothing is
        submitted automatically.
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="outline" onClick={onEditDetails} className="min-h-10 rounded-full">
          <FileText className="mr-2 size-4" aria-hidden="true" />
          Edit in Incident Builder
        </Button>
        <Button variant="outline" onClick={handleDownload} className="min-h-10 rounded-full">
          <Download className="mr-2 size-4" aria-hidden="true" />
          Download
        </Button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs font-semibold text-[#0f5d9f]">
        {feedback ?? ""}
      </p>

      <StageActions
        onBack={onBack}
        onContinue={onContinue}
        continueLabel="Choose a destination"
      />
    </div>
  );
}

/** Stage 4 - Destination */
function DestinationStage({
  overview,
  onBack,
  onContinue,
}: {
  overview: ReportBuilderOverview | null;
  onBack: () => void;
  onContinue: () => void;
}) {
  const resolvedDraft = getResolvedReportFlowDraft();
  // The governed mock destination Triage's "Use this reporting option"
  // selected (if any) — shown as its own section below, never merged into
  // `destinations` (the backend/manual list), so the two catalogues are
  // never mixed in one list.
  const triageResolution = resolveSelectedReportDestination(resolvedDraft);
  const triageSelectionIsStaleMock =
    resolvedDraft?.selectedDestinationSource === "mock_bundle" && triageResolution.status !== "found";
  const [jurisdiction, setJurisdiction] = useState(
    resolvedDraft?.jurisdiction ?? "auto"
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    triageSelectionIsStaleMock ? null : (resolvedDraft?.selectedDestinationId ?? null)
  );
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [source, setSource] = useState<"backend" | "manual">("manual");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const draft = getResolvedReportFlowDraft();

      if (draft?.reportId) {
        try {
          const previews = await getReportDestinations(draft.reportId, {
            jurisdiction: jurisdiction === "auto" ? undefined : jurisdiction,
          });
          if (cancelled) return;
          setDestinations(previews.map(mapBackendDestinationPreview));
          setSource("backend");
          setLoading(false);
          return;
        } catch {
          if (cancelled) return;
          setError(
            "We couldn't load personalised destination recommendations right now."
          );
        }
      }

      if (cancelled) return;
      setDestinations(buildManualDestinationOptions(overview));
      setSource("manual");
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [jurisdiction, overview, retryToken]);

  function handleSelect(option: DestinationOption): void {
    setSelectedId(option.id);
    updateSelectedReportDestination({ id: option.id, name: option.name, source: option.source });
    mergeReportFlowDraft({ jurisdiction });
  }

  function handleSelectTriageDestination(): void {
    if (triageResolution.status !== "found") return;
    setSelectedId(triageResolution.destination.id);
    updateSelectedReportDestination({
      id: triageResolution.destination.id,
      name: triageResolution.destination.name,
      source: "mock_bundle",
    });
  }

  function handleJurisdictionChange(code: string): void {
    setJurisdiction(code);
    mergeReportFlowDraft({ jurisdiction: code });
  }

  return (
    <div>
      <OnboardingStepHeader
        title="Where would you like to use this report?"
        description="Each destination explains what it can do with the information. Nothing is sent until you confirm."
      />

      {triageResolution.status === "found" ? (
        <div
          className={cn(
            "mt-6 rounded-[14px] border p-4",
            selectedId === triageResolution.destination.id
              ? "border-[#0f5d9f] bg-[#f2f8fd] ring-2 ring-[#0f5d9f]/20"
              : "border-[#dbe5f0] bg-white"
          )}
          data-testid="triage-selected-destination"
        >
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#0f5d9f]">
            Selected from Triage
          </p>
          <div className="mt-1 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-[#1f2a3a]">{triageResolution.destination.name}</p>
              <p className="mt-1 text-xs leading-5 text-[#60718a]">{triageResolution.destination.description}</p>
            </div>
            {selectedId === triageResolution.destination.id ? (
              <span
                role="status"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0f5d9f] text-white"
              >
                <Check size={14} aria-hidden="true" />
              </span>
            ) : (
              <Button
                variant="outline"
                onClick={handleSelectTriageDestination}
                className="min-h-9 shrink-0 rounded-full text-xs"
              >
                Use this destination
              </Button>
            )}
          </div>
        </div>
      ) : triageSelectionIsStaleMock ? (
        <div className="mt-6 rounded-[14px] border border-[#f2d8b0] bg-[#fffaf2] p-4 text-sm text-[#9a5b12]" role="status">
          The reporting option you previously selected from Triage is no longer available. Choose another option
          below.
        </div>
      ) : null}

      <label htmlFor="destination-jurisdiction" className="mt-6 block max-w-sm">
        <span className="flex items-center gap-1.5 text-sm font-bold text-[#1f2a3a]">
          <MapPin size={14} aria-hidden="true" />
          Jurisdiction
        </span>
        <select
          id="destination-jurisdiction"
          value={jurisdiction}
          onChange={(event) => handleJurisdictionChange(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-full border border-[#dbe5f0] bg-white px-4 text-sm text-[#1f2a3a] focus:outline-none focus:ring-2 focus:ring-[#0f5d9f]"
        >
          {AU_JURISDICTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-6" data-testid="destination-options">
        {loading ? (
          <div className="flex items-center gap-2 rounded-[14px] border border-[#dbe5f0] bg-white p-4 text-sm text-[#60718a]">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading destination recommendations...
          </div>
        ) : error ? (
          <div className="rounded-[14px] border border-[#f2d8b0] bg-[#fffaf2] p-4">
            <p className="text-sm font-bold text-[#9a5b12]">
              Personalised recommendations aren&apos;t available right now
            </p>
            <p className="mt-1 text-xs leading-5 text-[#9a5b12]">{error}</p>
            <p className="mt-1 text-xs leading-5 text-[#9a5b12]">
              You can still choose from the list below.
            </p>
            <Button
              variant="outline"
              onClick={() => setRetryToken((token) => token + 1)}
              className="mt-3 min-h-9 rounded-full"
            >
              <RefreshCw className="mr-2 size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : destinations.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-[#cbd8e6] bg-[#f8fbff] p-4 text-sm text-[#60718a]">
            No destinations are available for this jurisdiction yet.
          </p>
        ) : null}

        {!loading && destinations.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {destinations.map((option) => {
              const selected = option.id === selectedId;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleSelect(option)}
                  className={cn(
                    "rounded-[14px] border p-4 text-left transition hover:bg-[#f8fbff]",
                    selected
                      ? "border-[#0f5d9f] bg-[#f2f8fd] ring-2 ring-[#0f5d9f]/20"
                      : "border-[#dbe5f0] bg-white"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-[#1f2a3a]">{option.name}</p>
                    {selected ? (
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#0f5d9f] text-white">
                        <Check size={14} aria-hidden="true" />
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#60718a]">
                    {option.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {option.capabilities.information ? (
                      <Badge className="text-[10px]">Information</Badge>
                    ) : null}
                    {option.capabilities.reportPreparation ? (
                      <Badge className="text-[10px]">Report preparation</Badge>
                    ) : null}
                    {option.capabilities.externalContact ? (
                      <Badge className="text-[10px]">External contact</Badge>
                    ) : null}
                    {option.capabilities.secureSharing ? (
                      <Badge className="text-[10px]">Secure sharing</Badge>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        <p className="mt-3 text-xs leading-5 text-[#94a3b8]">
          {source === "backend"
            ? "Personalised recommendations based on your report."
            : "Showing SafeSpeak's standard service directory. SafeSpeak has not contacted any of these destinations."}
        </p>
      </div>

      <StageActions
        onBack={onBack}
        onContinue={onContinue}
        continueDisabled={!selectedId}
      />
    </div>
  );
}

/** Stage 5 - Consent */
function ConsentStage({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const resolvedDraft = getResolvedReportFlowDraft();
  const resolution = resolveSelectedReportDestination(resolvedDraft);
  const selectedMockDestinationUnavailable =
    resolvedDraft?.selectedDestinationSource === "mock_bundle" && resolution.status !== "found";
  const {
    pendingConsentRequirement,
    isGrantingConsent,
    requireConsent,
    grantPendingConsent,
    clearPendingConsent,
  } = useConsentGate();
  const [checking, setChecking] = useState(true);
  const [consented, setConsented] = useState(Boolean(resolvedDraft?.consentGranted));
  const [gateError, setGateError] = useState<string | null>(null);
  const [localOnlyAck, setLocalOnlyAck] = useState(false);

  useEffect(() => {
    if (!resolvedDraft?.selectedDestinationId) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    async function check() {
      setChecking(true);
      try {
        const granted = await requireConsent(
          consentRequirements.reportDestinationSubmit
        );
        if (cancelled) return;
        if (granted) {
          setConsented(true);
          mergeReportFlowDraft({
            consentGranted: true,
            consentGrantedAt: new Date().toISOString(),
            consentMode: "backend",
          });
        }
      } catch {
        if (!cancelled) {
          setGateError("Could not check your consent status right now.");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAllow(): Promise<void> {
    await grantPendingConsent();
    setConsented(true);
    mergeReportFlowDraft({
      consentGranted: true,
      consentGrantedAt: new Date().toISOString(),
      consentMode: "backend",
    });
  }

  function handleDecline(): void {
    clearPendingConsent();
  }

  function handleLocalOnlyAck(): void {
    const next = !localOnlyAck;
    setLocalOnlyAck(next);
    setConsented(next);
    mergeReportFlowDraft({
      consentGranted: next,
      consentGrantedAt: next ? new Date().toISOString() : undefined,
      consentMode: "local_only",
    });
  }

  if (!resolvedDraft?.selectedDestinationId) {
    return (
      <div>
        <OnboardingStepHeader
          title="Consent"
          description="At least one destination must be selected before you can continue."
        />
        <div className="mt-6 rounded-[14px] border border-[#f2d8b0] bg-[#fffaf2] p-4 text-sm text-[#9a5b12]">
          Choose a destination first so SafeSpeak can show you exactly what
          consent is needed.
        </div>
        <StageActions
          onBack={onBack}
          onContinue={onBack}
          continueLabel="Back to destinations"
        />
      </div>
    );
  }

  if (selectedMockDestinationUnavailable) {
    return (
      <div>
        <OnboardingStepHeader
          title="Consent"
          description="Your previously selected reporting option is no longer available."
        />
        <div className="mt-6 rounded-[14px] border border-[#f2d8b0] bg-[#fffaf2] p-4 text-sm text-[#9a5b12]" role="status">
          The reporting option you selected is no longer available. Your report draft has been kept — choose another
          reporting option to continue.
        </div>
        <StageActions
          onBack={onBack}
          onContinue={onBack}
          continueLabel="Choose another reporting option"
        />
      </div>
    );
  }

  return (
    <div>
      <OnboardingStepHeader
        title="Consent"
        description="Review and approve what happens next. Nothing is shared until you explicitly consent."
      />

      <Card className="mt-6 rounded-[14px] p-4">
        <h2 className="flex items-center gap-2 font-bold text-[#1f2a3a]">
          <ShieldCheck className="size-4 text-[#0f5d9f]" aria-hidden="true" />
          Selected destination
        </h2>
        <p className="mt-2 text-sm font-semibold text-[#1f2a3a]">
          {resolution.status === "found" ? resolution.destination.name : (resolvedDraft.selectedDestinationName ?? "Selected destination")}
        </p>
        {resolution.status === "found" ? (
          <div className="mt-2 space-y-1 text-xs leading-5 text-[#60718a]">
            <p>{resolution.destination.destinationType}</p>
            {resolution.destination.jurisdictions.length > 0 ? (
              <p>{resolution.destination.jurisdictions.join(", ")}</p>
            ) : null}
            <p>
              <span className="font-semibold text-[#1f2a3a]">Anonymous reporting: </span>
              {REPORT_DESTINATION_TRISTATE_LABEL[resolution.destination.anonymousReporting]}
            </p>
            <p>
              <span className="font-semibold text-[#1f2a3a]">Emergency suitability: </span>
              {REPORT_DESTINATION_TRISTATE_LABEL[resolution.destination.emergencySuitability]}
            </p>
          </div>
        ) : null}
        <p className="mt-2 text-xs leading-5 text-[#60718a]">
          Your prepared report (category, what happened, safety status, and
          any optional details you added) will be used to prepare
          information for this destination. Information stays on this
          device and in your SafeSpeak account until you take a further
          sharing action.
        </p>
        {resolution.status === "found" && resolution.destination.publicDisclaimer ? (
          <p className="mt-2 text-xs leading-5 text-[#94a3b8]">{resolution.destination.publicDisclaimer}</p>
        ) : null}
      </Card>

      <div className="mt-4">
        {checking ? (
          <div className="flex items-center gap-2 rounded-[14px] border border-[#dbe5f0] bg-white p-4 text-sm text-[#60718a]">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Checking your consent status...
          </div>
        ) : gateError ? (
          <div className="rounded-[14px] border border-[#f2d8b0] bg-[#fffaf2] p-4">
            <p className="text-sm font-bold text-[#9a5b12]">{gateError}</p>
            <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#9a5b12]">
              <input
                type="checkbox"
                checked={localOnlyAck}
                onChange={handleLocalOnlyAck}
                className="mt-0.5"
              />
              I understand SafeSpeak could not verify cloud consent right
              now. Keep my report prepared locally only - nothing will be
              shared.
            </label>
          </div>
        ) : pendingConsentRequirement ? (
          <ConsentRequiredCard
            requirement={pendingConsentRequirement}
            isSubmitting={isGrantingConsent}
            onAllow={() => void handleAllow()}
            onDecline={handleDecline}
          />
        ) : (
          <div className="rounded-[14px] border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#15803d]">
            You have already granted the consent needed to prepare sharing
            with this destination. Nothing has been sent yet.
          </div>
        )}
      </div>

      <p className="mt-4 text-xs leading-5 text-[#94a3b8]">
        You can withdraw or change this consent at any time from Settings.
        Going back does not clear your report draft.
      </p>

      <StageActions onBack={onBack} onContinue={onContinue} continueDisabled={!consented} />
    </div>
  );
}

/** Stage 6 - Complete */
function CompleteStage({ onBack }: { onBack: () => void }) {
  const resolvedDraft = getResolvedReportFlowDraft();
  const resolution = resolveSelectedReportDestination(resolvedDraft);
  const selectedMockDestinationUnavailable =
    resolvedDraft?.selectedDestinationSource === "mock_bundle" && resolution.status !== "found";
  const [feedback, setFeedback] = useState<string | null>(null);

  const destinationSummaryValue = selectedMockDestinationUnavailable
    ? `${resolvedDraft?.selectedDestinationName ?? "Selected destination"} (no longer available)`
    : resolution.status === "found"
      ? `${resolution.destination.name} (${resolution.destination.destinationType})`
      : (resolvedDraft?.selectedDestinationName ?? "Not selected");

  function buildSummaryText(): string {
    return [
      "SafeSpeak report - prepared, not sent",
      `Category: ${resolvedDraft?.incidentType ? toTitleCase(resolvedDraft.incidentType) : "Not classified"}`,
      `Prepared: ${formatTimestamp(resolvedDraft?.updatedAt ?? null)}`,
      `Destination: ${destinationSummaryValue}`,
      "Status: Draft ready - saved locally. Nothing has been sent.",
    ].join("\n");
  }

  function handleCopy(): void {
    void navigator.clipboard
      .writeText(buildSummaryText())
      .then(() => setFeedback("Copied report summary to your clipboard."))
      .catch(() =>
        setFeedback("Could not copy automatically. Select and copy manually.")
      );
  }

  function handleDownload(): void {
    const blob = new Blob([buildSummaryText()], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "safespeak-report-ready.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setFeedback("Downloaded safespeak-report-ready.txt");
  }

  return (
    <div>
      <OnboardingStepHeader
        title="Your report is ready"
        description="Your report has been prepared and saved locally. Nothing has been sent."
      />

      <Card className="mt-6 rounded-[14px] p-4" data-testid="report-complete-summary">
        <Badge className="border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]">
          Draft ready - saved locally
        </Badge>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SummaryRow
            label="Category"
            value={
              resolvedDraft?.incidentType
                ? toTitleCase(resolvedDraft.incidentType)
                : "Not classified"
            }
          />
          <SummaryRow
            label="Prepared"
            value={formatTimestamp(resolvedDraft?.updatedAt ?? null)}
          />
          <SummaryRow label="Destination" value={destinationSummaryValue} />
          <SummaryRow label="Status" value="Ready for review - nothing sent" />
        </div>
      </Card>

      <div className="mt-4 rounded-[14px] border border-[#dce5f1] bg-[#f8fbff] p-4 text-xs leading-5 text-[#60718a]">
        SafeSpeak has not shared, submitted, or sent this report to any
        destination. It is saved in this browser session and ready for you
        to review whenever you choose to take a further sharing step.
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="outline" onClick={handleCopy} className="min-h-10 rounded-full">
          <Copy className="mr-2 size-4" aria-hidden="true" />
          Copy report
        </Button>
        <Button variant="outline" onClick={handleDownload} className="min-h-10 rounded-full">
          <Download className="mr-2 size-4" aria-hidden="true" />
          Download report
        </Button>
        <a
          href="/dashboard?view=reportshistory"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dbe5f0] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
        >
          <Save className="size-4" aria-hidden="true" />
          View report history
        </a>
        <a
          href="/dashboard"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0f5d9f] px-4 text-sm font-semibold text-white transition hover:bg-[#0b528d]"
        >
          Return to dashboard
        </a>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs font-semibold text-[#0f5d9f]">
        {feedback ?? ""}
      </p>

      <div className="mt-8 border-t border-[#e3ebf5] pt-5">
        <Button variant="outline" onClick={onBack} className="min-h-11 rounded-full">
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          Back to consent
        </Button>
      </div>
    </div>
  );
}

function ReportReviewOnboardingRouter({
  step,
  overview,
  onGoToStep,
  onEditDetails,
}: RouterProps) {
  const config = REPORT_REVIEW_ONBOARDING_STEPS[step];

  if (step === "review") {
    return (
      <ReviewStage
        onEditDetails={onEditDetails}
        onContinue={() => onGoToStep("next")}
      />
    );
  }

  if (step === "next") {
    return (
      <NextStepStage
        onBack={() => onGoToStep("review")}
        onContinue={() => onGoToStep("preview")}
      />
    );
  }

  if (step === "preview") {
    return (
      <ReportPreviewStage
        overview={overview}
        onEditDetails={onEditDetails}
        onBack={() => onGoToStep("next")}
        onContinue={() => onGoToStep("destination")}
      />
    );
  }

  if (step === "destination") {
    return (
      <DestinationStage
        overview={overview}
        onBack={() => onGoToStep("preview")}
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

  return <CompleteStage onBack={() => onGoToStep(config.previous ?? "consent")} />;
}

export {
  ReportReviewOnboardingProgress,
  ReportReviewOnboardingRouter,
  DestinationStage,
  ConsentStage,
  CompleteStage,
  OnboardingStepHeader,
  StageActions,
};
