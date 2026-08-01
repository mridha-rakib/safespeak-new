"use client";

import {
  IconExternalLink,
  IconMail,
  IconPhoneFilled,
  IconShieldCheckFilled,
} from "@tabler/icons-react";

import { humanizeKey } from "@/lib/mock/triage-adapters";
import type {
  TriageAdvocateCard,
  TriageReportingDestinationCard,
} from "@/lib/mock/triage-mock-types";

import { ActionLink } from "./report-submission-support-page";

/**
 * Phase 6 — presentational components for the two new mock-matched Triage
 * entity kinds (Advocates/Counsellors and Reporting Destinations). Styled to
 * match the sibling `TriageSupportOptionCard` in
 * `report-submission-support-page.tsx` (same card shell, same `ActionLink`
 * tel:/mailto:/external-link behaviour). No colour-only status indicators,
 * real `<button>`/`<a>` elements for actions, visible text alongside every
 * icon.
 */

const CARD_SHELL_CLASS =
  "rounded-[24px] border border-[#D8E3F0] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)] sm:rounded-[30px] sm:p-6";

const VERIFICATION_BADGE_CLASS: Record<string, string> = {
  verified: "bg-[#DCFCE7] text-[#15803D]",
  not_verified: "bg-[#FEF3C7] text-[#92400E]",
  verification_pending: "bg-[#EEF2FF] text-[#4338CA]",
  verification_expired: "bg-[#FEE2E2] text-[#B91C1C]",
  verification_rejected: "bg-[#FEE2E2] text-[#B91C1C]",
};

function verificationBadgeClass(status: string): string {
  return VERIFICATION_BADGE_CLASS[status] ?? "bg-[#F3F4F6] text-[#374151]";
}

function TristateLine({ label, value }: { label: string; value: "yes" | "no" | "unknown" }) {
  const display = value === "yes" ? "Yes" : value === "no" ? "No" : "Unknown";
  return (
    <p className="mt-1 text-xs leading-5 text-[#475569]">
      <span className="font-semibold text-[#334155]">{label}:</span> {display}
    </p>
  );
}

export function TriageAdvocateCardView({
  advocate,
  onOpenDetails,
}: {
  advocate: TriageAdvocateCard;
  onOpenDetails?: () => void;
}) {
  const badgeLabel = humanizeKey(advocate.verificationStatus);
  const badgeClass = verificationBadgeClass(advocate.verificationStatus);

  return (
    <article
      className={CARD_SHELL_CLASS}
      data-testid={`triage-advocate-card-${advocate.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#111827]">{advocate.displayName}</p>
          <p className="mt-1 text-xs font-semibold text-[#6B7280]">
            {[advocate.professionalType, advocate.roleTitle].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${badgeClass}`}
        >
          {badgeLabel}
        </span>
      </div>

      {advocate.summary ? (
        <p className="mt-3 text-sm leading-6 text-[#475569]">{advocate.summary}</p>
      ) : null}

      {advocate.languages.length > 0 ? (
        <p className="mt-3 text-[11px] leading-5 text-[#94A3B8]">
          Languages: {advocate.languages.join(", ")}
        </p>
      ) : null}

      {advocate.costType ? (
        <p className="mt-1 text-[11px] leading-5 text-[#94A3B8]">
          Cost: {humanizeKey(advocate.costType)}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {onOpenDetails ? (
          <button
            type="button"
            onClick={onOpenDetails}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
          >
            View details
          </button>
        ) : null}
        {advocate.phoneDial ? (
          <a
            href={`tel:${advocate.phoneDial}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] transition hover:bg-[#F8FAFC]"
          >
            <IconPhoneFilled size={14} />
            Call {advocate.phoneDisplay ?? advocate.phoneDial}
          </a>
        ) : null}
        {advocate.email ? (
          <a
            href={`mailto:${advocate.email}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] transition hover:bg-[#F8FAFC]"
          >
            <IconMail size={14} />
            Email
          </a>
        ) : null}
        {advocate.bookingUrl ? (
          <ActionLink
            href={advocate.bookingUrl}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] transition hover:bg-[#F8FAFC]"
          >
            Book
            <IconExternalLink size={14} />
          </ActionLink>
        ) : null}
      </div>

      {advocate.reasons.length > 0 ? (
        <p className="mt-3 text-[11px] leading-5 text-[#94A3B8]">{advocate.reasons.join(" ")}</p>
      ) : null}
    </article>
  );
}

export function TriageReportingDestinationCardView({
  destination,
  onOpenDetails,
}: {
  destination: TriageReportingDestinationCard;
  onOpenDetails?: () => void;
}) {
  const canShowOnlineReporting =
    Boolean(destination.onlineReportingUrl) && destination.onlineReportingUrl!.startsWith("https://");

  return (
    <article
      className={CARD_SHELL_CLASS}
      data-testid={`triage-reporting-destination-card-${destination.id}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-[#111827]">{destination.name}</p>
        <p className="mt-1 text-xs font-semibold text-[#6B7280]">{destination.destinationType}</p>
      </div>

      {destination.description ? (
        <p className="mt-3 text-sm leading-6 text-[#475569]">{destination.description}</p>
      ) : null}

      <div className="mt-3">
        <TristateLine label="Anonymous reporting" value={destination.anonymousReporting} />
        <TristateLine label="Emergency suitability" value={destination.emergencySuitability} />
      </div>

      {destination.reportingMethods.length > 0 ? (
        <p className="mt-3 text-[11px] leading-5 text-[#94A3B8]">
          Reporting methods: {destination.reportingMethods.join(", ")}
        </p>
      ) : null}

      {destination.reportingInstructions ? (
        <p className="mt-3 text-xs leading-5 text-[#64748B]">{destination.reportingInstructions}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {onOpenDetails ? (
          <button
            type="button"
            onClick={onOpenDetails}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
          >
            View details
          </button>
        ) : null}
        {destination.phoneDial ? (
          <a
            href={`tel:${destination.phoneDial}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] transition hover:bg-[#F8FAFC]"
          >
            <IconPhoneFilled size={14} />
            Call {destination.phoneDisplay ?? destination.phoneDial}
          </a>
        ) : null}
        {canShowOnlineReporting ? (
          <ActionLink
            href={destination.onlineReportingUrl as string}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] transition hover:bg-[#F8FAFC]"
          >
            Report online
            <IconExternalLink size={14} />
          </ActionLink>
        ) : null}
      </div>

      {destination.publicDisclaimer ? (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-[#94A3B8]">
          <IconShieldCheckFilled size={12} className="mt-0.5 shrink-0" />
          {destination.publicDisclaimer}
        </p>
      ) : null}

      {destination.reasons.length > 0 ? (
        <p className="mt-3 text-[11px] leading-5 text-[#94A3B8]">{destination.reasons.join(" ")}</p>
      ) : null}
    </article>
  );
}
