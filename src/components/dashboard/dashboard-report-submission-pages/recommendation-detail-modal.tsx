"use client";

import { IconChevronLeft, IconExternalLink, IconPhoneFilled, IconX } from "@tabler/icons-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type {
  ContractTristateValue,
  ContractVerificationStatus,
} from "@/lib/contract/published-content-contract";
import { resolveRecommendation } from "@/lib/mock/recommendation-resolver";
import {
  RECOMMENDATION_ENTITY_TYPE_LABEL,
  recommendationTitle,
  type MockRecommendation,
  type RecommendationEntityType,
} from "@/lib/mock/recommendation-types";
import { REPORT_DESTINATION_TRISTATE_LABEL } from "@/lib/mock/report-destination-view-model";
import {
  buildContactActions,
  REPORT_START_FROM_TRIAGE_HREF,
  safeHttpsUrl,
  safeInternalRoute,
  safePublicImageSrc,
} from "@/lib/mock/safe-actions";
import {
  formatContractJurisdiction,
  formatContractJurisdictionList,
  humanizeKey,
} from "@/lib/mock/triage-adapters";
import { getResolvedReportFlowDraft, updateSelectedReportDestination } from "@/lib/report-flow";

/**
 * Phase 7 — the one shared recommendation detail shell, reused by every
 * entity type. Never a second parallel Triage page: this renders as an
 * overlay above the existing Triage content, the same established pattern
 * `MicroCardDetailOverlay` already uses elsewhere on this page for
 * live-session Microcards.
 */

export interface RecommendationDetailSelection {
  entityType: string;
  entityId: string;
  matchReasons?: string[];
}

export interface RecommendationDetailModalProps {
  selection: RecommendationDetailSelection | null;
  onClose: () => void;
  onNavigate: (selection: RecommendationDetailSelection) => void;
  /** Present only when a nested navigation (e.g. Microcard -> Rights Content) has somewhere to go back to. */
  onBack?: () => void;
}

const VERIFICATION_LABEL: Record<ContractVerificationStatus, string> = {
  not_verified: "Not verified",
  verification_pending: "Verification pending",
  verified: "Verified",
  verification_expired: "Verification expired",
  verification_rejected: "Verification not confirmed",
};

function DisclaimerBlock({ children }: { children: string }) {
  return (
    <p className="mt-3 rounded-xl border border-[#eadfb0] bg-[#fffaf0] p-3 text-xs leading-5 text-[#7a5b12]">{children}</p>
  );
}

function MatchReasons({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-[#d8e3f0] bg-[#f8fafc] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#64748B]">Why this was suggested</p>
      <ul className="mt-1.5 space-y-1">
        {reasons.map((reason, index) => (
          <li key={index} className="text-xs leading-5 text-[#334155]">
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function VerificationLine({ status }: { status: ContractVerificationStatus }) {
  const isVerified = status === "verified";
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
      <span
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isVerified ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEF3C7] text-[#92400E]"}`}
      >
        {VERIFICATION_LABEL[status]}
      </span>
      <span className="text-[#64748B]">Publication does not imply independent verification.</span>
    </p>
  );
}

function TristateLine({ label, value }: { label: string; value: ContractTristateValue }) {
  return (
    <p className="text-sm text-[#334155]">
      <span className="font-semibold text-[#111827]">{label}: </span>
      {REPORT_DESTINATION_TRISTATE_LABEL[value]}
    </p>
  );
}

function ActionButton({ href, label, external }: { href: string; label: string; external?: boolean }) {
  const isHttp = /^https?:/i.test(href);
  const shouldOpenNewTab = external ?? isHttp;
  if (shouldOpenNewTab) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
      >
        {label}
        <IconExternalLink size={14} aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <a
      href={href}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
    >
      {/^tel:/i.test(href) ? <IconPhoneFilled size={14} aria-hidden="true" /> : null}
      {label}
    </a>
  );
}

function LinkButton({ href, label }: { href: Route; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] transition hover:bg-[#F8FAFC]"
    >
      {label}
    </Link>
  );
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#64748B]">{label}</p>
      <p className="mt-0.5 text-sm leading-6 text-[#334155]">{value}</p>
    </div>
  );
}

function MicrocardDetailBody({
  recommendation,
  onNavigate,
}: {
  recommendation: Extract<MockRecommendation, { entityType: "microcard" }>;
  onNavigate: (selection: RecommendationDetailSelection) => void;
}) {
  const record = recommendation.record;
  const cta = record.cta;

  let ctaButton: React.ReactNode = null;
  if (cta.type === "start_report") {
    ctaButton = <ActionButton href={REPORT_START_FROM_TRIAGE_HREF} label="Continue to report" />;
  } else if (cta.type === "open_safe_external_link") {
    const url = safeHttpsUrl(cta.target);
    if (url) ctaButton = <ActionButton href={url} label={cta.label ?? "Open link"} external />;
  } else if (cta.type === "open_internal_route") {
    const route = safeInternalRoute(cta.target);
    if (route) ctaButton = <LinkButton href={route} label={cta.label ?? "Open"} />;
  } else if (cta.type === "view_rights_information" && cta.target) {
    const target = cta.target;
    ctaButton = (
      <button
        type="button"
        onClick={() => onNavigate({ entityType: "rights_content", entityId: target })}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
      >
        {cta.label ?? "View rights information"}
      </button>
    );
  } else if (cta.type === "view_legislation_source" && cta.target) {
    const target = cta.target;
    ctaButton = (
      <button
        type="button"
        onClick={() => onNavigate({ entityType: "legislation_source", entityId: target })}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
      >
        {cta.label ?? "View source"}
      </button>
    );
  } else if (cta.type === "view_support_service" && cta.target) {
    const target = cta.target;
    ctaButton = (
      <button
        type="button"
        onClick={() => onNavigate({ entityType: "support_organisation", entityId: target })}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
      >
        {cta.label ?? "View support service"}
      </button>
    );
  }
  // `none`, or a `view_*` CTA whose target is missing/unresolved: no button — never invented.

  return (
    <>
      <p className="mt-3 text-sm leading-6 text-[#334155]">{record.summary}</p>
      {record.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#334155]">{record.body}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailField label="Card type" value={record.cardType ? humanizeKey(record.cardType) : undefined} />
        <DetailField label="Jurisdiction" value={formatContractJurisdiction(record.jurisdiction)} />
      </div>
      {record.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {record.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {ctaButton ? <div className="mt-5">{ctaButton}</div> : null}
      <MatchReasons reasons={recommendation.matchReasons} />
    </>
  );
}

function RightsContentDetailBody({
  recommendation,
  onNavigate,
}: {
  recommendation: Extract<MockRecommendation, { entityType: "rights_content" }>;
  onNavigate: (selection: RecommendationDetailSelection) => void;
}) {
  const record = recommendation.record;
  return (
    <>
      <p className="mt-3 text-sm leading-6 text-[#334155]">{record.summary}</p>
      {record.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#334155]">{record.body}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailField label="Content type" value={record.contentType ? humanizeKey(record.contentType) : undefined} />
        <DetailField label="Jurisdiction" value={formatContractJurisdiction(record.jurisdiction)} />
      </div>
      {record.relatedLegislationIds.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {record.relatedLegislationIds.map((legislationId) => (
            <button
              key={legislationId}
              type="button"
              onClick={() => onNavigate({ entityType: "legislation_source", entityId: legislationId })}
              className="rounded-full border border-[#D8E3F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F5D9F] hover:bg-[#F8FAFC]"
            >
              View related legislation source
            </button>
          ))}
        </div>
      ) : null}
      <DisclaimerBlock>
        {record.publicDisclaimer ??
          "General information only. Rights may vary by jurisdiction. Consider professional legal advice for your specific situation."}
      </DisclaimerBlock>
      <MatchReasons reasons={recommendation.matchReasons} />
    </>
  );
}

function LegislationSourceDetailBody({
  recommendation,
}: {
  recommendation: Extract<MockRecommendation, { entityType: "legislation_source" }>;
}) {
  const record = recommendation.record;
  const sourceUrl = safeHttpsUrl(record.sourceUrl);
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <DetailField label="Source type" value={humanizeKey(record.sourceType)} />
        <DetailField label="Authority / publisher" value={record.authorityOrPublisher} />
        <DetailField label="Jurisdiction" value={formatContractJurisdiction(record.jurisdiction)} />
        <DetailField label="Effective date" value={record.effectiveDate} />
        <DetailField label="Last updated" value={record.lastUpdatedDate} />
      </div>
      <DisclaimerBlock>
        This is a source reference only, not the complete text of the law and not personalised legal advice.
      </DisclaimerBlock>
      {sourceUrl ? (
        <div className="mt-4">
          <ActionButton href={sourceUrl} label="Open source" external />
        </div>
      ) : null}
      <MatchReasons reasons={recommendation.matchReasons} />
    </>
  );
}

function SupportOrganisationDetailBody({
  recommendation,
}: {
  recommendation: Extract<MockRecommendation, { entityType: "support_organisation" }>;
}) {
  const record = recommendation.record;
  const actions = buildContactActions({
    phone: record.phone,
    email: record.email,
    website: record.website,
    bookingUrl: record.bookingUrl,
    referralUrl: record.referralUrl,
  });
  return (
    <>
      <VerificationLine status={record.verificationStatus} />
      <p className="mt-3 text-sm leading-6 text-[#334155]">{record.fullDescription ?? record.shortDescription}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailField label="Organisation type" value={record.organisationType ? humanizeKey(record.organisationType) : undefined} />
        <DetailField label="Jurisdictions" value={record.jurisdictions.length > 0 ? formatContractJurisdictionList(record.jurisdictions) : record.australiaWide ? "Australia-wide" : undefined} />
        <DetailField label="Languages" value={record.languages.length > 0 ? record.languages.join(", ") : undefined} />
        <DetailField label="Service delivery" value={record.serviceDeliveryModes.length > 0 ? record.serviceDeliveryModes.map(humanizeKey).join(", ") : undefined} />
        <DetailField label="Eligibility" value={record.eligibilityInformation} />
        <DetailField label="Cost" value={record.costInformation} />
        <DetailField label="Opening hours" value={record.openingHours} />
        <DetailField label="Accessibility" value={record.accessibilityInformation} />
      </div>
      {actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <ActionButton key={action.kind} href={action.href} label={action.label} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[#94A3B8]">No public contact details are available for this organisation.</p>
      )}
      <MatchReasons reasons={recommendation.matchReasons} />
    </>
  );
}

/**
 * The public contract's `profilePhoto` field (`PublishedSupportProfessional.
 * profilePhoto`) currently only carries file metadata (`fileName`,
 * `fileSizeBytes`, `fileType`) — never a resolvable public path or URL, so
 * there is nothing safe to render an `<img>` from today for any professional
 * in the committed mock bundle. `imageSrc` is accepted here (and validated
 * through `safePublicImageSrc`, which rejects blob:/file:/local-path/unsafe
 * values) so this component is ready the moment a real public asset path is
 * added to the contract, without a second avatar implementation being
 * written later — but for the current fixture data every professional
 * renders through the initials fallback.
 */
function ProfessionalAvatar({
  imageSrc,
  initials,
}: {
  imageSrc?: string;
  initials: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const safeSrc = imageFailed ? undefined : safePublicImageSrc(imageSrc);

  if (safeSrc) {
    return (
      <Image
        src={safeSrc}
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 shrink-0 rounded-full object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0F5D9F]/10 text-sm font-extrabold text-[#0F5D9F]"
    >
      {initials || "?"}
    </span>
  );
}

function SupportProfessionalDetailBody({
  recommendation,
}: {
  recommendation: Extract<MockRecommendation, { entityType: "support_professional" }>;
}) {
  const record = recommendation.record;
  const displayName = record.displayName ?? record.fullName;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  const actions = buildContactActions({
    phone: record.phone,
    email: record.email,
    bookingUrl: record.bookingUrl,
  });
  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <ProfessionalAvatar initials={initials} />
        <div>
          <p className="text-xs font-semibold text-[#64748B]">{humanizeKey(record.professionalType)}</p>
          {record.jobTitle ? <p className="text-xs text-[#94A3B8]">{record.jobTitle}</p> : null}
        </div>
      </div>
      <VerificationLine status={record.verificationStatus} />
      <p className="mt-3 text-sm leading-6 text-[#334155]">{record.fullBiography ?? record.shortIntroduction}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailField label="Specialisations" value={record.specialisations.length > 0 ? record.specialisations.join(", ") : undefined} />
        <DetailField label="Jurisdictions" value={record.jurisdictions.length > 0 ? formatContractJurisdictionList(record.jurisdictions) : record.australiaWide ? "Australia-wide" : undefined} />
        <DetailField label="Languages" value={record.languages.length > 0 ? record.languages.join(", ") : undefined} />
        <DetailField label="Support modes" value={record.supportModes.length > 0 ? record.supportModes.map(humanizeKey).join(", ") : undefined} />
        <DetailField label="Cost" value={record.feeInformation ?? humanizeKey(record.costType)} />
        <DetailField label="Availability" value={record.availability} />
      </div>
      <p className="mt-3 text-xs text-[#94A3B8]">
        This preview does not show live availability, and does not guarantee a response or that this professional can take on a new case.
      </p>
      {actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <ActionButton key={action.kind} href={action.href} label={action.label} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[#94A3B8]">No public contact details are available for this profile.</p>
      )}
      <MatchReasons reasons={recommendation.matchReasons} />
    </>
  );
}

function ReportingDestinationDetailBody({
  recommendation,
}: {
  recommendation: Extract<MockRecommendation, { entityType: "reporting_destination" }>;
}) {
  const record = recommendation.record;
  // "Report online" (contact action, opens the destination's own external
  // reporting URL) is a deliberately separate action from "Use this
  // reporting option" (selects this destination's stable id into the
  // SafeSpeak report draft) — see buildContactActions call below, which
  // never includes a "select for my report" entry.
  const actions = buildContactActions({
    phone: record.phone,
    onlineReportingUrl: record.onlineReportingUrl,
  });
  const [draftSelection, setDraftSelection] = useState(() => {
    const draft = getResolvedReportFlowDraft();
    return { id: draft?.selectedDestinationId, source: draft?.selectedDestinationSource };
  });
  // Source is checked too, not just id equality — a governed-bundle id
  // must never read as "selected" merely because a backend/manual
  // selection happens to carry the same string.
  const isSelected = draftSelection.id === record.id && draftSelection.source === "mock_bundle";
  const canSelect = Boolean(record.id) && record.status === "published";

  function handleUseThisReportingOption(): void {
    updateSelectedReportDestination({ id: record.id, name: record.name, source: "mock_bundle" });
    setDraftSelection({ id: record.id, source: "mock_bundle" });
  }

  return (
    <>
      <p className="mt-3 text-sm leading-6 text-[#334155]">{record.fullDescription ?? record.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailField label="Destination type" value={humanizeKey(record.destinationType)} />
        <DetailField
          label="Jurisdictions"
          value={record.jurisdictions.length > 0 ? formatContractJurisdictionList(record.jurisdictions) : record.australiaWide ? "Australia-wide" : undefined}
        />
        <DetailField label="Reporting methods" value={record.reportingMethods.length > 0 ? record.reportingMethods.map(humanizeKey).join(", ") : undefined} />
        <DetailField label="Eligibility" value={record.eligibilityInformation} />
        <DetailField label="Cost" value={record.costInformation} />
      </div>
      <div className="mt-3 space-y-1">
        <TristateLine label="Anonymous reporting" value={record.anonymousReporting} />
        <TristateLine label="Emergency suitability" value={record.emergencySuitability} />
      </div>
      {record.reportingInstructions ? (
        <div className="mt-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#64748B]">How to report</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-[#334155]">{record.reportingInstructions}</p>
        </div>
      ) : null}
      {record.evidenceGuidance ? (
        <div className="mt-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#64748B]">Evidence guidance</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-[#334155]">{record.evidenceGuidance}</p>
        </div>
      ) : null}
      {record.responseExpectations ? <DetailField label="What to expect" value={record.responseExpectations} /> : null}
      <DisclaimerBlock>
        {record.publicDisclaimer ??
          "Viewing this information does not submit a report. Anonymity, confidentiality, response, and acceptance are never guaranteed."}
      </DisclaimerBlock>

      {isSelected ? (
        <p
          role="status"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1.5 text-xs font-extrabold text-[#15803D]"
        >
          Selected for this report
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Once selected, the action itself is withdrawn (not shown disabled with
            the same label as the status pill above) — one clear selected state,
            never a duplicate selection control. */}
        {canSelect && !isSelected ? (
          <button
            type="button"
            onClick={handleUseThisReportingOption}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
          >
            Use this reporting option
          </button>
        ) : null}
        {actions.map((action) => (
          <ActionButton key={action.kind} href={action.href} label={action.kind === "online_report" ? "Report online" : action.label} />
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#94A3B8]">
        Selecting a reporting option does not contact this destination or submit anything — you still choose to continue, confirm consent, and submit later in the report flow.
      </p>
      <MatchReasons reasons={recommendation.matchReasons} />
    </>
  );
}

function DetailBody({
  recommendation,
  onNavigate,
}: {
  recommendation: MockRecommendation;
  onNavigate: (selection: RecommendationDetailSelection) => void;
}) {
  // Keyed by entityId so React remounts the body (re-running its own
  // useState initialisers, e.g. the Reporting Destination's selected-state
  // read from the report draft) whenever the addressed record changes, even
  // between two records of the same entity type.
  switch (recommendation.entityType) {
    case "microcard":
      return <MicrocardDetailBody key={recommendation.entityId} recommendation={recommendation} onNavigate={onNavigate} />;
    case "rights_content":
      return <RightsContentDetailBody key={recommendation.entityId} recommendation={recommendation} onNavigate={onNavigate} />;
    case "legislation_source":
      return <LegislationSourceDetailBody key={recommendation.entityId} recommendation={recommendation} />;
    case "support_organisation":
      return <SupportOrganisationDetailBody key={recommendation.entityId} recommendation={recommendation} />;
    case "support_professional":
      return <SupportProfessionalDetailBody key={recommendation.entityId} recommendation={recommendation} />;
    case "reporting_destination":
      return <ReportingDestinationDetailBody key={recommendation.entityId} recommendation={recommendation} />;
  }
}

export function RecommendationDetailModal({ selection, onClose, onNavigate, onBack }: RecommendationDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // `selection` is a fresh object on every parent render (it's derived from
  // the URL each time) — depending on it directly would re-run these effects
  // (and re-steal focus / re-lock scroll) on every unrelated parent
  // re-render. Depend on this stable primitive key instead, which only
  // changes when the actually-open entity changes.
  const selectionKey = selection ? `${selection.entityType}:${selection.entityId}` : null;
  const wasOpenRef = useRef(false);

  // Opening (null -> a detail): capture the trigger element to restore focus
  // to on close, and move focus into the dialog. Changing entity while the
  // modal stays open (nested navigation, Back/Forward while open): move
  // focus back to the dialog (whose accessible name is the updated heading
  // via aria-labelledby) so screen readers announce the new entity, but
  // never re-capture `previouslyFocusedRef` — it must still point at the
  // original Triage card when the modal eventually closes.
  useEffect(() => {
    if (!selectionKey) {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    }
    wasOpenRef.current = true;
    dialogRef.current?.focus();
  }, [selectionKey]);

  // Body scroll lock spans the whole time any detail is open (not
  // per-entity), and focus is only restored to the trigger once the modal
  // fully closes.
  const hasSelection = Boolean(selection);
  useEffect(() => {
    if (!hasSelection) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [hasSelection]);

  useEffect(() => {
    if (!hasSelection) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasSelection, onClose]);

  if (!selection) return null;

  const resolution = resolveRecommendation(selection.entityType, selection.entityId, selection.matchReasons ?? []);
  const entityTypeLabel = isKnownEntityType(selection.entityType)
    ? RECOMMENDATION_ENTITY_TYPE_LABEL[selection.entityType]
    : "Details";
  const title = resolution.status === "found" ? recommendationTitle(resolution.recommendation) : "Not currently available";

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto bg-[#0b1725]/70 p-4 backdrop-blur-[2px] motion-safe:transition-opacity motion-safe:duration-150 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recommendation-detail-title"
        tabIndex={-1}
        className="my-8 w-full max-w-xl rounded-[24px] border border-[#d8e3f0] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)] motion-safe:transition-transform motion-safe:duration-150 sm:rounded-[30px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-[#0F5D9F]"
              >
                <IconChevronLeft size={14} aria-hidden="true" />
                Back
              </button>
            ) : null}
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#0F5D9F]">{entityTypeLabel}</p>
            <h2 id="recommendation-detail-title" className="mt-1 text-xl font-extrabold leading-7 text-[#111827] sm:text-2xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D8E3F0] bg-white text-[#334155] transition hover:bg-[#F8FAFC]"
          >
            <IconX size={18} aria-hidden="true" />
          </button>
        </div>

        {resolution.status === "found" ? (
          <DetailBody recommendation={resolution.recommendation} onNavigate={onNavigate} />
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-[#D8E3F0] p-5 text-center" role="status">
            <p className="text-sm font-semibold text-[#334155]">
              {resolution.status === "unsupported_entity_type"
                ? "This item can't be shown here."
                : "This item is no longer available."}
            </p>
            <p className="mt-1 text-xs text-[#94A3B8]">Nothing was invented to fill the gap — please choose another option.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] hover:bg-[#F8FAFC]"
            >
              Back to Triage
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function isKnownEntityType(value: string): value is RecommendationEntityType {
  return value in RECOMMENDATION_ENTITY_TYPE_LABEL;
}
