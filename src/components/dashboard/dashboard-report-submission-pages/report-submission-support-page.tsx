"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  IconAlertCircleFilled,
  IconArrowRight,
  IconBook2,
  IconChevronLeft,
  IconClock,
  IconExternalLink,
  IconFirstAidKit,
  IconGavel,
  IconHeadphones,
  IconHeartbeat,
  IconInfoCircle,
  IconLogout,
  IconPhoneCall,
  IconPhoneFilled,
  IconShieldCheckFilled,
  IconShieldFilled,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { ConsentRequiredCard } from "@/components/consent/consent-required-card";
import { ReportSubmissionFrame } from "./report-submission-frame";
import {
  RecommendationDetailModal,
  type RecommendationDetailSelection,
} from "./recommendation-detail-modal";
import { useConsentGate } from "@/hooks/use-consent-gate";
import {
  getAssistantTriageSource,
  saveAssistantTriageSource,
} from "@/lib/assistant-triage";
import {
  type ConversationFlowSupportAction,
  type ConversationFlowSupportBundle,
  type ConversationFlowTriage,
  fetchConversationFlowSupport,
  fetchConversationFlowTriage,
} from "@/lib/conversation-flow";
import {
  type MicroEducationItem,
  listPublishedMicroEducation,
} from "@/lib/microeducation";
import {
  parseRecommendationDetailFromSearchParams,
  withRecommendationDetail,
  withoutRecommendationDetail,
} from "@/lib/mock/recommendation-detail-url";
import { REPORT_START_FROM_TRIAGE_HREF } from "@/lib/mock/safe-actions";
import {
  type TriageRecommendationResult,
  MockTriageRecommendationService,
} from "@/lib/mock/triage-recommendation-service";
import { EMERGENCY_NUMBER } from "@/lib/safety";
import {
  type TriageOverview,
  type TriagePrimaryAction,
  type TriageResourceItem,
  type TriageSupportOption,
  buildDemoSupportOptions,
  buildDemoTriageOverview,
} from "@/lib/triage-view-model";
import {
  TriageAdvocateCardView,
  TriageReportingDestinationCardView,
} from "./triage-mock-cards";

// Phase 6 — one shared mock-content-backed recommendation service instance
// for the no-live-backend-session (demo) Triage branch only.
const mockTriageRecommendationService = new MockTriageRecommendationService();

const EMPTY_SUPPORT_BUNDLE: ConversationFlowSupportBundle = {
  suggestedMicroCardIds: [],
  recommendedActions: [],
  additionalResources: [],
  matchedSupportServices: [],
  fallbackUsed: false,
};

type TriagePresentation = {
  title: string;
  body: string;
  assessmentNote: string;
  primaryStepTitle: string;
  primaryStepBody: string;
  immediateDangerBody: string;
  secondTitle: string;
  secondBody: string;
  secondActionLabel: string;
  secondActionHref: string;
  thirdTitle: string;
  thirdBody: string;
  thirdActionLabel: string;
  thirdActionHref: string;
  stepReasons?: string[];
  microCardSummary?: string;
};

function toLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getConversationSessionIdFromUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (
    new URLSearchParams(window.location.search).get("conversationSessionId") ??
    undefined
  );
}

function shouldShowTriageDebug() {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return (
    params.get("triageDebug") === "1" ||
    window.localStorage.getItem("safespeak_triage_debug") === "1"
  );
}

function withConversationSessionId(
  href: string,
  conversationSessionId?: string | null
): Route {
  if (!conversationSessionId || isExternalHref(href)) {
    return href as Route;
  }

  const [pathname, hash = ""] = href.split("#", 2);
  const [basePath, queryString = ""] = pathname.split("?", 2);
  const params = new URLSearchParams(queryString);

  params.set("conversationSessionId", conversationSessionId);

  const nextHref = `${basePath}?${params.toString()}`;
  return (hash ? `${nextHref}#${hash}` : nextHref) as Route;
}

function buildTriagePresentation(
  triage: ConversationFlowTriage | null,
  isLoading: boolean,
  demoTriage?: TriageOverview | null
): TriagePresentation {
  if (!isLoading && triage?.presentation) {
    return {
      ...triage.presentation,
      secondActionHref: String(triage.presentation.secondActionHref),
      thirdActionHref: String(triage.presentation.thirdActionHref),
    };
  }

  if (isLoading) {
    return {
      title: "Reviewing your situation",
      body: "Reviewing your inputs and preparing support options.",
      assessmentNote: "This is not a formal finding. You choose what to do next.",
      primaryStepTitle: "Review your options",
      primaryStepBody:
        "You can choose support, reporting, safety planning, or evidence steps.",
      immediateDangerBody:
        "If you or someone else is in immediate danger, call 000 now.",
      secondTitle: "Support options",
      secondBody:
        "You can explore services that may fit what you shared, at your pace.",
      secondActionLabel: "Review options",
      secondActionHref: "/dashboard?view=reportsubmissionrecommendations",
      thirdTitle: "Evidence and safety",
      thirdBody:
        "You can review evidence, account safety, and practical next steps without sharing anything automatically.",
      thirdActionLabel: "Safety steps",
      thirdActionHref: "/dashboard?view=reportsubmissionevidence",
      stepReasons: [],
      microCardSummary: "",
    };
  }

  const label =
    triage?.likelyCategoryLabel ||
    (demoTriage ? toLabel(demoTriage.incident.concernType) : "Review Your Options");
  const canProceed = triage?.canProceedToRecommendations ?? false;

  return {
    title: label,
    body:
      triage?.reasoningSummary ||
      (demoTriage
        ? `SafeSpeak is treating this as a possible ${toLabel(demoTriage.incident.concernType).toLowerCase()} concern. Review the options below to decide what happens next.`
        : "SafeSpeak is showing broad support, evidence, and safety options while keeping control with you."),
    assessmentNote: "This is not a formal finding. You choose what to do next.",
    primaryStepTitle: "Review your options",
    primaryStepBody: canProceed
      ? "You can review support, reporting, evidence, and safety steps."
      : "You can review support, evidence, and safety steps without forcing a category.",
    immediateDangerBody:
      "If you or someone else is in immediate danger, call 000 now. You can stop using SafeSpeak at any time.",
    secondTitle: "Support and reporting",
    secondBody:
      "You can review possible support or reporting pathways and decide what feels safest.",
    secondActionLabel: canProceed ? "Review options" : "See details",
    secondActionHref: canProceed
      ? "/dashboard?view=reportsubmissionrecommendations"
      : "/dashboard?view=reportsubmissiondetailedexplanations",
    thirdTitle: "Evidence and safety",
    thirdBody:
      "You can review evidence, privacy, and account-safety steps at your own pace.",
    thirdActionLabel: "Safety steps",
    thirdActionHref: "/dashboard?view=reportsubmissionevidence",
    stepReasons: [],
    microCardSummary: "",
  };
}

function isExternalHref(href: string) {
  return /^(https?:|tel:|mailto:)/i.test(href);
}

// Exported (minimal one-line change) so the new mock-triage card components
// in `triage-mock-cards.tsx` can reuse the exact same tel:/mailto:/external
// link behaviour instead of duplicating it.
export function ActionLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (isExternalHref(href)) {
    const shouldOpenNewTab = /^https?:/i.test(href);

    return (
      <a
        href={href}
        className={className}
        target={shouldOpenNewTab ? "_blank" : undefined}
        rel={shouldOpenNewTab ? "noreferrer" : undefined}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href as Route} className={className}>
      {children}
    </Link>
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h3 className="text-lg font-extrabold leading-7 text-[#111827] sm:text-2xl sm:leading-8">
        {children}
      </h3>
      {action}
    </div>
  );
}

function RecommendationRow({
  icon,
  iconClassName,
  title,
  description,
  detail,
  action,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description: string;
  detail?: string;
  action: ReactNode;
}) {
  return (
    <article className="flex min-h-[104px] flex-col gap-5 rounded-[18px] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.06)] sm:min-h-[110px] sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6 lg:px-8">
      <div className="flex min-w-0 items-start gap-5">
        <span
          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconClassName}`}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold leading-5 text-[#111827] sm:text-base">
            {title}
          </span>
          <span className="mt-2 block max-w-[520px] text-xs leading-5 text-[#6B7280] sm:text-sm">
            {description}
          </span>
          {detail ? (
            <span className="mt-2 block max-w-[520px] text-[11px] leading-5 text-[#94A3B8]">
              {detail}
            </span>
          ) : null}
        </span>
      </div>
      <div className="shrink-0 sm:ml-auto">{action}</div>
    </article>
  );
}

function ResourceCard({
  action,
  onOpenDetails,
}: {
  action: ConversationFlowSupportAction;
  /** Present only for governed mock-bundle recommendations — opens the shared recommendation detail modal instead of navigating directly. */
  onOpenDetails?: () => void;
}) {
  const usesCall = action.actionKind === "call";

  return (
    <article className="relative overflow-hidden rounded-[26px] bg-[linear-gradient(100.94deg,#004E92_0%,#003A6D_100%)] p-5 text-white shadow-[0_16px_32px_rgba(15,93,159,0.14)] sm:rounded-[36px] sm:p-6 lg:rounded-[48px]">
      <span className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative z-10">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-[2px]">
            {usesCall ? <IconPhoneCall size={20} /> : <IconShieldCheckFilled size={20} />}
          </span>
          <div className="min-w-0">
            <h4 className="text-lg font-extrabold leading-7">{action.title}</h4>
            <p className="mt-1 text-sm leading-5 text-[#DBEAFE]">
              {action.description}
            </p>
            <p className="mt-3 text-[11px] leading-5 text-[#BFDBFE]">
              {action.whySuggested}
            </p>
            <p className="mt-2 text-[11px] leading-5 text-[#BFDBFE]">
              {action.consentNote}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {onOpenDetails ? (
            <button
              type="button"
              onClick={onOpenDetails}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-xs font-extrabold text-[#0F172A] transition hover:bg-[#E2E8F0]"
            >
              View details
              <IconArrowRight size={14} />
            </button>
          ) : (
            <ActionLink
              href={action.href}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-xs font-extrabold text-[#0F172A] transition hover:bg-[#E2E8F0]"
            >
              {action.ctaLabel}
              {usesCall ? <IconPhoneFilled size={14} /> : <IconExternalLink size={14} />}
            </ActionLink>
          )}
          {action.phone ? (
            <span className="text-[11px] font-semibold text-[#DBEAFE]">
              {action.phone}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SuggestedMicroCard({
  card,
  riskLevel,
  onOpen,
}: {
  card: MicroEducationItem;
  riskLevel: ConversationFlowTriage["safetyRiskLevel"];
  onOpen: () => void;
}) {
  const toneStyles: Record<
    MicroEducationItem["tone"],
    { card: string; label: string; icon: string; action: string }
  > = {
    blue: {
      card: "bg-[#01579B] text-white",
      label: "text-[#E1F5FE]",
      icon: "bg-white/20 text-white",
      action: "bg-white text-[#111827]",
    },
    orange: {
      card: "bg-[#FFB300] text-[#111827]",
      label: "text-[#1F2937]",
      icon: "bg-white/35 text-[#111827]",
      action: "bg-white text-[#111827]",
    },
    green: {
      card: "bg-[#0D9488] text-white",
      label: "text-white/85",
      icon: "bg-white/20 text-white",
      action: "bg-white text-[#111827]",
    },
    amber: {
      card: "bg-[#FFB300] text-[#111827]",
      label: "text-[#1F2937]",
      icon: "bg-white/35 text-[#111827]",
      action: "bg-white text-[#111827]",
    },
    violet: {
      card: "bg-[#01579B] text-white",
      label: "text-[#E1F5FE]",
      icon: "bg-white/20 text-white",
      action: "bg-white text-[#111827]",
    },
    teal: {
      card: "bg-[#0D9488] text-white",
      label: "text-white/85",
      icon: "bg-white/20 text-white",
      action: "bg-white text-[#111827]",
    },
  };
  const currentTone = toneStyles[card.tone];
  const primaryChip = card.chips[0] ? toLabel(card.chips[0]) : "Guidance";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${card.title}`}
      className={`group relative flex min-h-[220px] overflow-hidden rounded-[28px] p-5 shadow-[0_18px_34px_rgba(15,93,159,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_40px_rgba(15,93,159,0.2)] ${currentTone.card}`}
    >
      <span className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/10 blur-[10px]" />
      <span className="absolute -right-8 top-8 h-28 w-28 rounded-full bg-white/10" />
      <span className="relative z-10 flex h-full min-w-0 flex-col">
        <span className="flex items-start justify-between gap-3">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] backdrop-blur-sm ${currentTone.icon}`}
          >
            <IconBook2 size={21} />
          </span>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${currentTone.action}`}
          >
            {riskLevel}
          </span>
        </span>
        <span
          className={`mt-6 block text-[10px] font-extrabold uppercase tracking-[0.1em] ${currentTone.label}`}
        >
          {card.tag || primaryChip}
        </span>
        <span className="mt-2 block text-xl font-extrabold leading-6">
          {card.title}
        </span>
        <span
          className={`mt-3 line-clamp-3 block text-sm leading-5 ${currentTone.label}`}
        >
          {card.summary}
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 pt-6">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${currentTone.label}`}
          >
            <IconClock size={13} />
            {card.readTimeLabel || "4 min read"}
          </span>
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition group-hover:translate-x-0.5 ${currentTone.action}`}
            aria-hidden="true"
          >
            <IconArrowRight size={16} />
          </span>
        </span>
      </span>
    </button>
  );
}

function MicroCardDetailOverlay({
  card,
  riskLevel,
  onClose,
  onPrevious,
  onNext,
  showNavigation,
}: {
  card: MicroEducationItem;
  riskLevel: ConversationFlowTriage["safetyRiskLevel"];
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  showNavigation: boolean;
}) {
  const toneStyles: Record<
    MicroEducationItem["tone"],
    { panel: string; text: string; muted: string; icon: string }
  > = {
    blue: {
      panel: "bg-[#01579B]",
      text: "text-white",
      muted: "text-[#E1F5FE]",
      icon: "bg-white/20 text-white",
    },
    orange: {
      panel: "bg-[#FFB300]",
      text: "text-[#111827]",
      muted: "text-[#1F2937]",
      icon: "bg-white/35 text-[#111827]",
    },
    green: {
      panel: "bg-[#0D9488]",
      text: "text-white",
      muted: "text-white/85",
      icon: "bg-white/20 text-white",
    },
    amber: {
      panel: "bg-[#FFB300]",
      text: "text-[#111827]",
      muted: "text-[#1F2937]",
      icon: "bg-white/35 text-[#111827]",
    },
    violet: {
      panel: "bg-[#01579B]",
      text: "text-white",
      muted: "text-[#E1F5FE]",
      icon: "bg-white/20 text-white",
    },
    teal: {
      panel: "bg-[#0D9488]",
      text: "text-white",
      muted: "text-white/85",
      icon: "bg-white/20 text-white",
    },
  };
  const currentTone = toneStyles[card.tone];
  const summary = card.detailSummary || card.summary;
  const body = card.detailBody || card.summary;
  const takeaway = card.detailTakeaway || card.summary;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#EEF4FB]/95 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-full w-full max-w-[1184px] flex-col">
        <header className="flex items-center justify-between border-b border-[#d9e2ee] px-1 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 text-xs font-bold text-[#1f2937]"
          >
            <IconChevronLeft size={15} />
            Suggested guides
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-[#64748B] transition hover:text-[#334155]"
          >
            Close
          </button>
        </header>

        <main className="flex flex-1 items-center py-6 sm:py-8">
          <article className="grid w-full gap-5 rounded-[32px] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.14)] lg:grid-cols-[360px_minmax(0,1fr)] lg:p-7">
            <aside
              className={`relative min-h-[360px] overflow-hidden rounded-[28px] p-6 ${currentTone.panel} ${currentTone.text}`}
            >
              <span className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10 blur-[10px]" />
              <span className="absolute -right-10 top-10 h-36 w-36 rounded-full bg-white/10" />
              <div className="relative z-10 flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex h-12 w-12 items-center justify-center rounded-[18px] ${currentTone.icon}`}
                  >
                    <IconBook2 size={22} />
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#111827]">
                    {riskLevel}
                  </span>
                </div>
                <p
                  className={`mt-8 text-[10px] font-extrabold uppercase tracking-[0.1em] ${currentTone.muted}`}
                >
                  {card.tag || toLabel(card.chips[0] ?? "Guidance")}
                </p>
                <h2 className="mt-3 text-3xl font-extrabold leading-[1.02]">
                  {card.title}
                </h2>
                <p className={`mt-4 text-sm leading-6 ${currentTone.muted}`}>
                  {card.summary}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-8">
                  <IconClock size={14} className={currentTone.muted} />
                  <span className={`text-xs font-bold ${currentTone.muted}`}>
                    {card.readTimeLabel || "4 min read"}
                  </span>
                </div>
              </div>
            </aside>

            <section className="flex min-w-0 flex-col p-1 sm:p-3">
              <div className="flex flex-wrap gap-2">
                {card.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-[#EEF4FB] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#0F5D9F]"
                  >
                    {toLabel(chip)}
                  </span>
                ))}
              </div>
              <h3 className="mt-5 max-w-[760px] text-3xl font-extrabold leading-[1.05] text-[#0F172A] sm:text-4xl">
                {card.detailHeading || card.title}
              </h3>
              <p className="mt-4 max-w-[760px] text-base leading-7 text-[#475569]">
                {summary}
              </p>

              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <section className="rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                    What this covers
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#334155]">
                    {body}
                  </p>
                </section>
                <section className="rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                    Key takeaway
                  </p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#0F172A]">
                    {takeaway}
                  </p>
                </section>
              </div>

              {showNavigation ? (
                <div className="mt-auto flex flex-col gap-3 pt-7 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={onPrevious}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-sm font-bold text-[#334155] transition hover:bg-[#F8FAFC]"
                  >
                    <IconChevronLeft size={16} />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={onNext}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-sm font-bold text-white transition hover:bg-[#004E92]"
                  >
                    Next
                    <IconArrowRight size={16} />
                  </button>
                </div>
              ) : null}
            </section>
          </article>
        </main>
      </div>
    </div>
  );
}

function buildFallbackAction(
  slot: ConversationFlowSupportAction["slot"],
  title: string,
  description: string,
  ctaLabel: string,
  href: string
): ConversationFlowSupportAction {
  return {
    slot,
    title,
    description,
    whySuggested: "Suggested from your current triage pathway.",
    ctaLabel,
    href,
    actionKind: isExternalHref(href) ? "external_link" : "external_link",
    consentNote:
      "SafeSpeak does not call, email, report, or share anything unless you choose the next step yourself.",
  };
}

function buildImmediateDangerAction(
  action: ConversationFlowSupportAction | undefined,
  fallbackBody: string
): ConversationFlowSupportAction {
  if (action) {
    return action;
  }

  return {
    slot: "immediateDanger",
    title: "Immediate danger",
    description: fallbackBody,
    whySuggested:
      "This stays visible so urgent safety options are always easy to reach.",
    ctaLabel: "Call 000",
    href: `tel:${EMERGENCY_NUMBER}`,
    phone: EMERGENCY_NUMBER,
    actionKind: "call",
    consentNote: "SafeSpeak does not call emergency services for you.",
  };
}

function buildDisplayedActionRows(input: {
  triagePresentation: TriagePresentation;
  support: ConversationFlowSupportBundle;
  conversationSessionId?: string | null;
}) {
  const immediateAction = buildImmediateDangerAction(
    input.support.recommendedActions.find(
      (item) => item.slot === "immediateDanger"
    ),
    input.triagePresentation.immediateDangerBody
  );
  const backendFollowUps = input.support.recommendedActions.filter(
    (item) => item.slot !== "immediateDanger"
  );
  const fallbackActions = [
    buildFallbackAction(
      "primarySupport",
      input.triagePresentation.secondTitle,
      input.triagePresentation.secondBody,
      input.triagePresentation.secondActionLabel,
      withConversationSessionId(
        input.triagePresentation.secondActionHref,
        input.conversationSessionId
      )
    ),
    buildFallbackAction(
      "secondarySupport",
      input.triagePresentation.thirdTitle,
      input.triagePresentation.thirdBody,
      input.triagePresentation.thirdActionLabel,
      withConversationSessionId(
        input.triagePresentation.thirdActionHref,
        input.conversationSessionId
      )
    ),
  ];
  const combined = [immediateAction, ...backendFollowUps];

  for (const fallback of fallbackActions) {
    if (combined.some((item) => item.title === fallback.title)) {
      continue;
    }

    combined.push(fallback);
  }

  return combined.slice(0, 3);
}

const PRIMARY_ACTION_ICONS: Record<
  TriagePrimaryAction["kind"],
  { icon: ReactNode; iconClassName: string }
> = {
  build_report: {
    icon: <IconFirstAidKit size={18} />,
    iconClassName: "bg-[#FEF2F2] text-[#EF4444]",
  },
  learn_more: {
    icon: <IconGavel size={20} />,
    iconClassName: "bg-[#EEF2FF] text-[#4F63F6]",
  },
  find_support: {
    icon: <IconHeadphones size={20} />,
    iconClassName: "bg-[#E6FFFA] text-[#14B8A6]",
  },
  save_privately: {
    icon: <IconShieldCheckFilled size={20} />,
    iconClassName: "bg-[#F0FDF4] text-[#16A34A]",
  },
  finish_for_now: {
    icon: <IconLogout size={20} />,
    iconClassName: "bg-[#F8FAFC] text-[#64748B]",
  },
};

function TriagePrimaryActionRow({
  action,
  savedPrivatelyAt,
  onSavePrivately,
}: {
  action: TriagePrimaryAction;
  savedPrivatelyAt: string | null;
  onSavePrivately: () => void;
}) {
  const { icon, iconClassName } = PRIMARY_ACTION_ICONS[action.kind];
  const isPrimaryAction = action.kind === "build_report";
  const buttonClassName = isPrimaryAction
    ? "inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#0F5D9F] px-6 text-xs font-extrabold text-white shadow-[0_12px_22px_rgba(15,93,159,0.28)] transition hover:bg-[#004E92] sm:w-auto"
    : "inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#F3F4F6] px-6 text-xs font-extrabold text-[#374151] transition hover:bg-[#E5E7EB] sm:w-auto";
  const arrowClassName = isPrimaryAction ? "text-white" : "text-[#9CA3AF]";

  const actionElement =
    action.kind === "save_privately" ? (
      <div className="flex flex-col items-end gap-2">
        <button type="button" onClick={onSavePrivately} className={buttonClassName}>
          {action.ctaLabel}
          <IconArrowRight size={16} className={arrowClassName} />
        </button>
        {savedPrivatelyAt ? (
          <span className="text-[11px] font-semibold text-[#16A34A]">
            Saved to this browser session
          </span>
        ) : null}
      </div>
    ) : (
      <ActionLink href={action.href ?? "/dashboard"} className={buttonClassName}>
        {action.ctaLabel}
        <IconArrowRight size={16} className={arrowClassName} />
      </ActionLink>
    );

  return (
    <RecommendationRow
      icon={icon}
      iconClassName={iconClassName}
      title={action.label}
      description={action.description}
      action={actionElement}
    />
  );
}

function resourceItemToSupportAction(
  item: TriageResourceItem
): ConversationFlowSupportAction {
  const href = item.phoneDial
    ? `tel:${item.phoneDial}`
    : item.href ?? "/dashboard?view=resources";

  return {
    slot: "additional",
    title: item.title,
    description: item.description,
    whySuggested: item.category,
    ctaLabel: item.actionLabel,
    phone: item.phoneDisplay,
    href,
    actionKind: item.phoneDial ? "call" : "external_link",
    consentNote:
      "SafeSpeak does not contact this service for you. Opening this option is your choice.",
  };
}

const RECOMMENDATION_PRIORITY_BADGE_CLASS: Record<
  TriageSupportOption["recommendationPriority"],
  string
> = {
  recommended: "bg-[#DCFCE7] text-[#15803D]",
  also_available: "bg-[#EEF2FF] text-[#4338CA]",
  emergency_only: "bg-[#FEE2E2] text-[#B91C1C]",
};

function TriageSupportOptionCard({
  option,
  onOpenDetails,
}: {
  option: TriageSupportOption;
  onOpenDetails?: () => void;
}) {
  const badgeClass =
    RECOMMENDATION_PRIORITY_BADGE_CLASS[option.recommendationPriority];

  return (
    <article
      className="rounded-[24px] border border-[#D8E3F0] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)] sm:rounded-[30px] sm:p-6"
      data-testid={`triage-support-option-${option.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#111827]">{option.name}</p>
          <p className="mt-1 text-xs font-semibold text-[#6B7280]">
            {option.category}
          </p>
        </div>
        {option.recommendationLabel ? (
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${badgeClass}`}
          >
            {option.recommendationLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-[#475569]">
        {option.description}
      </p>
      {option.emergencyOnly ? (
        <p className="mt-2 text-xs font-semibold text-[#B91C1C]">
          Call only if you are in immediate danger.
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
        {option.phoneDial ? (
          <a
            href={`tel:${option.phoneDial}`}
            className={
              onOpenDetails
                ? "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] transition hover:bg-[#F8FAFC]"
                : "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0F5D9F] px-5 text-xs font-extrabold text-white transition hover:bg-[#004E92]"
            }
          >
            <IconPhoneFilled size={14} />
            Call {option.phoneDisplay ?? option.phoneDial}
          </a>
        ) : null}
        {option.url ? (
          <ActionLink
            href={option.url}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#D8E3F0] bg-white px-5 text-xs font-extrabold text-[#334155] transition hover:bg-[#F8FAFC]"
          >
            Visit
            <IconExternalLink size={14} />
          </ActionLink>
        ) : null}
      </div>
      {option.jurisdiction || option.availability ? (
        <p className="mt-3 text-[11px] leading-5 text-[#94A3B8]">
          {[option.jurisdiction, option.availability].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </article>
  );
}

function ReportSubmissionSupportPage() {
  const { t } = useTranslation();
  const [triage, setTriage] = useState<ConversationFlowTriage | null>(null);
  const [support, setSupport] =
    useState<ConversationFlowSupportBundle>(EMPTY_SUPPORT_BUNDLE);
  const [demoTriage, setDemoTriage] = useState<TriageOverview | null>(null);
  const [mockTriage, setMockTriage] = useState<TriageRecommendationResult | null>(
    null
  );
  const [resolvedConversationSessionId, setResolvedConversationSessionId] =
    useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [supportLoadNotice, setSupportLoadNotice] = useState<string | null>(
    null
  );
  const [savedPrivatelyAt, setSavedPrivatelyAt] = useState<string | null>(
    null
  );
  const [microCards, setMicroCards] = useState<MicroEducationItem[]>([]);
  const [isLoadingMicroCards, setIsLoadingMicroCards] = useState(true);
  const [microCardsError, setMicroCardsError] = useState<string | null>(null);
  const [activeMicroCardId, setActiveMicroCardId] = useState<string | null>(
    null
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  // Phase 7.1 — the URL (recommendationType/recommendationId) is the single
  // source of truth for which detail is open, so Back/Forward/refresh/direct
  // links all resolve correctly for free. Match reasons are never put in the
  // URL, so this is a purely opportunistic in-memory cache: populated when a
  // card is clicked (the reasons are already in hand at that point), ignored
  // the moment the URL no longer matches it (nested navigation, Back,
  // Forward, or a direct/refreshed load never had reasons to begin with).
  const [openedWithMatchReasons, setOpenedWithMatchReasons] = useState<{
    entityId: string;
    matchReasons: string[];
  } | null>(null);
  // How many detail->detail pushes deep the current detail is, so the
  // in-modal "Back" affordance only appears when there is somewhere within
  // this detail flow to go back to (not on a direct/refreshed top-level load).
  const [detailStackDepth, setDetailStackDepth] = useState(0);
  const detailQueryState = parseRecommendationDetailFromSearchParams(searchParams);
  const detailSelection: RecommendationDetailSelection | null = detailQueryState
    ? {
        entityType: detailQueryState.entityType,
        entityId: detailQueryState.entityId,
        matchReasons:
          openedWithMatchReasons?.entityId === detailQueryState.entityId
            ? openedWithMatchReasons.matchReasons
            : undefined,
      }
    : null;

  useEffect(() => {
    if (!detailQueryState) {
      setDetailStackDepth(0);
    }
  }, [detailQueryState]);

  const {
    pendingConsentRequirement,
    isGrantingConsent,
    captureConsentError,
    clearPendingConsent,
    grantPendingConsent,
  } = useConsentGate();

  const loadTriage = useCallback(async () => {
    const conversationSessionId =
      getConversationSessionIdFromUrl() ??
      getAssistantTriageSource()?.conversationSessionId;

    setResolvedConversationSessionId(conversationSessionId ?? null);

    if (!conversationSessionId) {
      setTriage(null);
      setSupport(EMPTY_SUPPORT_BUNDLE);

      const source = getAssistantTriageSource();
      const overview = source ? buildDemoTriageOverview(source.timeline) : null;
      setDemoTriage(overview);
      setSupportLoadNotice(
        overview
          ? "This triage preview uses the information you shared in your SafeSpeak conversation. It is not linked to a live backend triage session."
          : "Live triage support is not available yet because this report is not linked to an active SafeSpeak triage session."
      );

      const mockResult = await mockTriageRecommendationService.getRecommendations({
        topic: source?.incidentCategory,
        timeline: source?.timeline,
      });
      setMockTriage(mockResult);

      setLoading(false);
      return;
    }

    // Mock recommendations never apply to a live backend session — an
    // important safety boundary, not just tidiness.
    setMockTriage(null);
    setDemoTriage(null);
    setLoading(true);
    setSupportLoadNotice(null);

    try {
      const response = await fetchConversationFlowSupport(
        conversationSessionId
      );

      setTriage(response.triage);
      setSupport(response.support);
    } catch (supportFetchError) {
      if (captureConsentError(supportFetchError)) {
        setTriage(null);
        return;
      }

      try {
        const response = await fetchConversationFlowTriage(
          conversationSessionId
        );

        setTriage(response.triage);
        setSupport(EMPTY_SUPPORT_BUNDLE);
        setSupportLoadNotice(
          "Support options could not be loaded, but the live triage summary is available."
        );
      } catch (fetchError) {
        if (captureConsentError(fetchError)) {
          setTriage(null);
          return;
        }

        setTriage(null);
        setSupport(EMPTY_SUPPORT_BUNDLE);
        setSupportLoadNotice(
          fetchError instanceof Error
            ? fetchError.message
            : "SafeSpeak could not load triage support from the backend."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [captureConsentError]);

  useEffect(() => {
    void loadTriage();
  }, [loadTriage]);

  useEffect(() => {
    let isMounted = true;

    const loadMicroCards = async () => {
      setIsLoadingMicroCards(true);
      setMicroCardsError(null);

      try {
        const items = await listPublishedMicroEducation();

        if (isMounted) {
          setMicroCards(items);
        }
      } catch (error) {
        if (isMounted) {
          setMicroCards([]);
          setMicroCardsError(
            error instanceof Error
              ? error.message
              : "Micro-cards could not be loaded."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingMicroCards(false);
        }
      }
    };

    void loadMicroCards();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAllowPendingConsent = async () => {
    try {
      await grantPendingConsent();
      await loadTriage();
    } catch {
      setTriage(null);
      setSupport(EMPTY_SUPPORT_BUNDLE);
      setSupportLoadNotice(
        "Live triage support could not be loaded after consent was granted."
      );
      setLoading(false);
    }
  };

  const handleDeclinePendingConsent = () => {
    clearPendingConsent();
    setTriage(null);
    setSupport(EMPTY_SUPPORT_BUNDLE);
    setSupportLoadNotice(
      "Grant AI consent to load live SafeSpeak triage support for this report."
    );
    setLoading(false);
  };

  const openRecommendationDetail = (
    entityType: string,
    entityId: string,
    matchReasons?: string[]
  ) => {
    setOpenedWithMatchReasons(matchReasons ? { entityId, matchReasons } : null);
    setDetailStackDepth(0);
    router.push(withRecommendationDetail(searchParams, entityType, entityId), {
      scroll: false,
    });
  };

  const closeRecommendationDetail = () => {
    setDetailStackDepth(0);
    router.push(withoutRecommendationDetail(searchParams), { scroll: false });
  };

  const navigateRecommendationDetail = (
    selection: RecommendationDetailSelection
  ) => {
    setOpenedWithMatchReasons(null);
    setDetailStackDepth((depth) => depth + 1);
    router.push(
      withRecommendationDetail(searchParams, selection.entityType, selection.entityId),
      { scroll: false }
    );
  };

  const backRecommendationDetail = () => {
    setDetailStackDepth((depth) => Math.max(0, depth - 1));
    router.back();
  };

  const handleSavePrivately = () => {
    const source = getAssistantTriageSource();

    if (!source) {
      return;
    }

    saveAssistantTriageSource({
      conversationSessionId: source.conversationSessionId,
      conversation: source.conversation,
      timeline: source.timeline,
      incidentCategory: source.incidentCategory,
    });
    setSavedPrivatelyAt(new Date().toISOString());
  };

  const canProceedToRecommendations = useMemo(() => {
    return triage?.canProceedToRecommendations ?? false;
  }, [triage]);

  const triagePresentation = useMemo(
    () => buildTriagePresentation(triage, loading, demoTriage),
    [loading, triage, demoTriage]
  );
  const shouldShowSupportOptions =
    !loading && !pendingConsentRequirement && Boolean(triage);
  // The shared gate for the whole no-live-backend path — both the legacy
  // `demoTriage` intro/options block and the single governed mock
  // recommendation source key off this, and it is mutually exclusive with
  // `shouldShowSupportOptions` by construction (`!triage` vs `Boolean(triage)`),
  // so the mock and live-session branches can never render together.
  const shouldShowNoSessionTriage = !loading && !pendingConsentRequirement && !triage;
  const shouldShowDemoTriage = shouldShowNoSessionTriage && Boolean(demoTriage);
  const shouldShowMockTriage = shouldShowNoSessionTriage && mockTriage?.status === "success";
  // Independent of both `demoTriage` and the governed mock match result —
  // emergency guidance must never depend on whether a matching rule fired.
  const emergencyOptions = useMemo(
    () => buildDemoSupportOptions().filter((option) => option.emergencyOnly),
    []
  );
  const suggestedMicroCards = useMemo(() => {
    if (support.suggestedMicroCardIds.length === 0 || microCards.length === 0) {
      return [];
    }

    const cardsById = new Map(microCards.map((card) => [card.id, card]));

    return support.suggestedMicroCardIds
      .map((id) => cardsById.get(id))
      .filter((card): card is MicroEducationItem => Boolean(card))
      .slice(0, 6);
  }, [microCards, support.suggestedMicroCardIds]);
  const displayedActionRows = useMemo(
    () =>
      buildDisplayedActionRows({
        triagePresentation,
        support,
        conversationSessionId: resolvedConversationSessionId,
      }),
    [resolvedConversationSessionId, support, triagePresentation]
  );
  const activeMicroCard = useMemo(
    () =>
      suggestedMicroCards.find((card) => card.id === activeMicroCardId) ?? null,
    [activeMicroCardId, suggestedMicroCards]
  );
  const primaryStepHref = useMemo(
    () =>
      withConversationSessionId(
        canProceedToRecommendations
          ? "/dashboard?view=reportsubmissionrecommendations"
          : "/dashboard?view=reportsubmissiondetailedexplanations",
        resolvedConversationSessionId
      ),
    [canProceedToRecommendations, resolvedConversationSessionId]
  );
  const safetyOverride = triage?.safetyOverride;
  const possiblePathways = support.possiblePathways ?? triage?.possiblePathways ?? [];
  const intakePlan = support.intakePlan ?? triage?.intakePlan ?? null;
  const consentGovernance =
    support.consentGovernance ?? triage?.consentGovernance ?? null;
  const reportPreparation = support.reportPreparation;

  useEffect(() => {
    if (!activeMicroCardId) {
      return;
    }

    if (!suggestedMicroCards.some((card) => card.id === activeMicroCardId)) {
      setActiveMicroCardId(null);
    }
  }, [activeMicroCardId, suggestedMicroCards]);

  useEffect(() => {
    if (!activeMicroCard) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMicroCardId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeMicroCard]);

  const openAdjacentMicroCard = (direction: -1 | 1) => {
    if (!activeMicroCard || suggestedMicroCards.length === 0) {
      return;
    }

    const currentIndex = suggestedMicroCards.findIndex(
      (card) => card.id === activeMicroCard.id
    );
    const nextIndex =
      ((currentIndex >= 0 ? currentIndex : 0) +
        direction +
        suggestedMicroCards.length) %
      suggestedMicroCards.length;

    setActiveMicroCardId(suggestedMicroCards[nextIndex].id);
  };

  return (
    <>
      <ReportSubmissionFrame
      title={t("dashboard.assistant.triage.title")}
      subtitle={t("dashboard.assistant.triage.subtitle")}
      step="support"
      backHref={resolvedConversationSessionId ? (`/dashboard?view=assistantconversation&conversationSessionId=${resolvedConversationSessionId}` as Route) : "/dashboard?view=assistantconversation"}
      backLabel={t("dashboard.assistant.triage.aiConversation")}
    >
      <div className="mx-auto flex w-full max-w-[1136px] flex-col gap-8 pt-3 sm:gap-9">

          {!pendingConsentRequirement && supportLoadNotice ? (
            <div
              data-testid="triage-status-notice"
              className="rounded-[14px] border border-[#dce5f1] bg-[#f8fbff] px-4 py-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#0f5d9f]">
                    <IconInfoCircle size={12} />
                    SafeSpeak status
                  </p>
                  <p className="mt-1 text-[11px] leading-[1.55] text-[#60728a]">
                    {supportLoadNotice}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <Link
                    href="/dashboard?view=assistantconversation"
                    className="inline-flex h-9 items-center justify-center rounded-full bg-[#0f5d9f] px-4 text-[11px] font-bold text-white"
                  >
                    Return to AI conversation
                  </Link>
                  <Link
                    href="/dashboard?view=reportsubmissionhistory"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-[#d7e1ee] px-4 text-[11px] font-semibold text-[#334155]"
                  >
                    View report history
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          <section>
            <article className="relative overflow-hidden rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] sm:rounded-[38px] sm:px-8 sm:py-10 lg:rounded-[48px] lg:px-12 lg:py-12">
              <div className="absolute left-1/2 top-0 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#EFF6FF]" />
              <div className="relative z-10 mx-auto flex max-w-[672px] flex-col items-center">
                <span
                  aria-label={t("dashboard.assistant.triage.specialtyTag")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF] text-[#004E92]"
                >
                  <IconHeartbeat size={22} stroke={2.2} />
                </span>
                <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.1em] text-[#9CA3AF]">
                  {t("dashboard.assistant.triage.incidentClassification")}
                </p>
                <h2 className="mt-3 max-w-[420px] text-[34px] font-extrabold leading-[0.98] text-[#004E92] sm:text-5xl sm:leading-none">
                  {triagePresentation.title}
                </h2>
                <span className="mt-8 h-1 w-16 rounded-full bg-[#F3F4F6]" />
                <p className="mt-8 max-w-[640px] text-sm leading-6 text-[#4B5563] sm:text-lg sm:leading-[1.6]">
                  {triagePresentation.body}
                </p>
                <p className="mt-4 text-xs italic leading-5 text-[#9CA3AF] sm:text-sm">
                  {triagePresentation.assessmentNote}
                </p>
              </div>
            </article>

            <p className="mx-auto mt-4 max-w-[672px] px-3 text-center text-xs leading-5 text-[#9CA3AF] sm:text-sm">
              {t("dashboard.assistant.triage.legalInfo")}
            </p>
          </section>

          {pendingConsentRequirement ? (
            <div className="max-w-[680px]">
              <ConsentRequiredCard
                requirement={pendingConsentRequirement}
                isSubmitting={isGrantingConsent || loading}
                onAllow={() => {
                  void handleAllowPendingConsent();
                }}
                onDecline={handleDeclinePendingConsent}
              />
            </div>
          ) : null}

          {shouldShowDemoTriage && demoTriage ? (
            <>
              <section className="rounded-[24px] border border-[#D8E3F0] bg-[#F8FAFC] p-5 sm:rounded-[30px] sm:p-6">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#0F5D9F]">
                  {demoTriage.introEyebrow}
                </p>
                <h3 className="mt-3 text-lg font-extrabold leading-7 text-[#111827] sm:text-2xl sm:leading-8">
                  {demoTriage.introHeading}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#334155]">
                  {demoTriage.introBody}
                </p>
                <p className="mt-3 text-sm leading-6 text-[#334155]">
                  {demoTriage.controlNote}
                </p>
              </section>

              <section>
                <SectionTitle>Your options</SectionTitle>
                <div className="mt-5 grid gap-4" data-testid="triage-primary-actions">
                  {demoTriage.primaryActions.map((action) => (
                    <TriagePrimaryActionRow
                      key={action.id}
                      action={action}
                      savedPrivatelyAt={savedPrivatelyAt}
                      onSavePrivately={handleSavePrivately}
                    />
                  ))}
                </div>
              </section>

              <footer className="border-t border-[#F3F4F6] pt-8">
                <div className="mx-auto flex max-w-[760px] flex-col gap-2 text-center text-xs leading-5 text-[#9CA3AF]">
                  <p>
                    SafeSpeak provides information, not legal advice. You decide
                    what happens next, and nothing is submitted merely by viewing
                    this page. Emergency services are for immediate danger only.
                  </p>
                  <p>{t("dashboard.assistant.triage.footerNote")}</p>
                </div>
              </footer>
            </>
          ) : null}

          {/*
            Independently required emergency guidance — deliberately gated on
            `shouldShowNoSessionTriage` alone, never on `demoTriage` or
            `mockTriage`/a governed match. This must remain visible whether or
            not any matching rule fired for the current topic/context.
          */}
          {shouldShowNoSessionTriage && emergencyOptions.length > 0 ? (
            <section>
              <SectionTitle>Emergency</SectionTitle>
              <p className="mt-2 text-sm leading-5 text-[#64748B]">
                Call 000 only if you are in immediate danger.
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2" data-testid="triage-emergency-options">
                {emergencyOptions.map((option) => (
                  <TriageSupportOptionCard key={option.id} option={option} />
                ))}
              </div>
            </section>
          ) : null}

          {/*
            Single governed mock recommendation source for the no-live-backend
            path — the canonical generated mock bundle -> MockContentRepository
            -> deterministic matcher -> Triage adapters pipeline. Gated on the
            same `shouldShowNoSessionTriage` boundary as `demoTriage` above
            (independent of whether `demoTriage` itself is non-null, since
            e.g. General Assistant has no `concernType` yet `demoTriage` can be
            null while matched mock content should still render). Each
            category is omitted entirely when empty — never backfilled with
            the old hardcoded catalogue or shown as a disruptive empty-state
            box. The old static "Get Support"/"Know Your Rights"/"Support
            options tailored to you" recommendation arrays
            (buildStandardTriageResourceGroups / buildDemoSupportOptions'
            non-emergency entries) are no longer rendered here — only this
            governed result and the always-present Emergency card below are.
          */}
          {shouldShowMockTriage && mockTriage?.status === "success" ? (
            <>
              {mockTriage.resourceGroups.map((group) => (
                <section key={group.id}>
                  <SectionTitle>{`You may also find useful — ${group.heading}`}</SectionTitle>
                  {group.id === "matched-rights-information" &&
                  mockTriage.rightsContentDisclaimer ? (
                    <p className="mt-2 text-xs leading-5 text-[#94A3B8]">
                      {mockTriage.rightsContentDisclaimer}
                    </p>
                  ) : null}
                  <div
                    className="mt-5 grid gap-4 sm:grid-cols-2 lg:gap-6"
                    data-testid={`triage-resource-group-${group.id}`}
                  >
                    {group.items.map((item) => (
                      <ResourceCard
                        key={item.id}
                        action={resourceItemToSupportAction(item)}
                        onOpenDetails={() =>
                          openRecommendationDetail(
                            group.id === "matched-suggested-guides"
                              ? "microcard"
                              : "rights_content",
                            item.id,
                            item.matchReasons
                          )
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}

              {mockTriage.supportOptions.length > 0 ? (
                <section>
                  <SectionTitle>Support options tailored to you</SectionTitle>
                  <p className="mt-2 text-sm leading-5 text-[#64748B]">
                    Based on what you shared, these are governed, deterministic
                    matches — not a live availability check.
                  </p>
                  <div
                    className="mt-5 grid gap-4 lg:grid-cols-2"
                    data-testid="triage-mock-support-options"
                  >
                    {mockTriage.supportOptions.map((option) => (
                      <TriageSupportOptionCard
                        key={option.id}
                        option={option}
                        onOpenDetails={() =>
                          openRecommendationDetail(
                            "support_organisation",
                            option.id,
                            option.matchReasons
                          )
                        }
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {mockTriage.advocates.length > 0 ? (
                <section>
                  <SectionTitle>Advocates & Counsellors</SectionTitle>
                  <div
                    className="mt-5 grid gap-4 sm:grid-cols-2 lg:gap-6"
                    data-testid="triage-advocates-section"
                  >
                    {mockTriage.advocates.map((advocate) => (
                      <TriageAdvocateCardView
                        key={advocate.id}
                        advocate={advocate}
                        onOpenDetails={() =>
                          openRecommendationDetail(
                            "support_professional",
                            advocate.id,
                            advocate.reasons
                          )
                        }
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {mockTriage.reportingDestinations.length > 0 ? (
                <section>
                  <SectionTitle>Reporting Destinations</SectionTitle>
                  <div
                    className="mt-5 grid gap-4 sm:grid-cols-2 lg:gap-6"
                    data-testid="triage-reporting-destinations-section"
                  >
                    {mockTriage.reportingDestinations.map((destination) => (
                      <TriageReportingDestinationCardView
                        key={destination.id}
                        destination={destination}
                        onOpenDetails={() =>
                          openRecommendationDetail(
                            "reporting_destination",
                            destination.id,
                            destination.reasons
                          )
                        }
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {shouldShowSupportOptions ? (
            <>
              <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
                <article className="rounded-[24px] border border-[#D8E3F0] bg-[#F8FAFC] p-5 sm:rounded-[30px] sm:p-6">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#0F5D9F]">
                    Your control
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#334155]">
                    SafeSpeak does not call, email, report, or share anything
                    automatically. Opening a service, calling a number, or
                    sharing information only happens if you choose that next
                    step.
                  </p>
                  {support.fallbackUsed ? (
                    <p className="mt-3 text-xs leading-5 text-[#64748B]">
                      Some options below are official fallback resources because
                      no closer in-app support service match was available for
                      this triage.
                    </p>
                  ) : null}
                </article>

                <article className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)] sm:rounded-[30px] sm:p-6">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                    Why this path
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#475569]">
                    {triage?.reasoningSummary || triagePresentation.body}
                  </p>
                </article>
              </section>

              {safetyOverride?.safetyOverride ? (
                <section className="rounded-[24px] border border-[#FECACA] bg-[#FFF7ED] p-5 shadow-[0_10px_24px_rgba(248,113,113,0.08)] sm:rounded-[30px] sm:p-6">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#C2410C]">
                    Safety first
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#7C2D12]">
                    A higher-risk safety concern may be present, so SafeSpeak is
                    keeping this step simple and safety-focused.
                  </p>
                  {safetyOverride.recommendedImmediateActions.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {safetyOverride.recommendedImmediateActions.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#9A3412]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="grid gap-4 lg:grid-cols-2">
                <article className="rounded-[24px] border border-[#D8E3F0] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)] sm:rounded-[30px] sm:p-6">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                    Possible pathways
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#475569]">
                    {triage?.pathwayExplanation ||
                      "These are possible support or reporting pathways only. SafeSpeak is not sending anything automatically."}
                  </p>
                  <div className="mt-4 grid gap-3">
                    {possiblePathways.slice(0, 4).map((pathway) => (
                      <div
                        key={pathway.pathwayId}
                        className="rounded-[18px] bg-[#F8FAFC] px-4 py-3"
                      >
                        <p className="text-sm font-extrabold text-[#0F172A]">
                          {pathway.userFacingLabel}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#64748B]">
                          {pathway.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-[24px] border border-[#D8E3F0] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)] sm:rounded-[30px] sm:p-6">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                    Prepare for this pathway
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#475569]">
                    {intakePlan?.userFriendlyExplanation ||
                      "SafeSpeak can show what may be asked next without forcing a full form upfront."}
                  </p>
                  {intakePlan ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#94A3B8]">
                          What we may ask next
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {intakePlan.requiredFields.map((field) => (
                            <span
                              key={field.key}
                              className="rounded-full bg-[#EEF4FB] px-3 py-1.5 text-xs font-semibold text-[#0F5D9F]"
                            >
                              {field.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      {intakePlan.optionalFields.length > 0 ? (
                        <div>
                          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#94A3B8]">
                            Helpful if available
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {intakePlan.optionalFields.map((field) => (
                              <span
                                key={field.key}
                                className="rounded-full bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#475569]"
                              >
                                {field.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </section>

              {reportPreparation ? (
                <section className="rounded-[24px] border border-[#D8E3F0] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)] sm:rounded-[30px] sm:p-6">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                    Report draft status
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#475569]">
                    {reportPreparation.informationOnlyDisclaimer}
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[18px] bg-[#F8FAFC] p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#94A3B8]">
                        Status
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[#0F172A]">
                        {reportPreparation.status.replace(/_/g, " ")}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[#64748B]">
                        {reportPreparation.userNarrativeSummary}
                      </p>
                    </div>
                    <div className="rounded-[18px] bg-[#F8FAFC] p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#94A3B8]">
                        Still missing
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[#64748B]">
                        {reportPreparation.missingFields.length > 0
                          ? reportPreparation.missingFields
                              .slice(0, 4)
                              .join(", ")
                              .replace(/_/g, " ")
                          : "No key field gaps were highlighted in this draft."}
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              <section>
                <SectionTitle
                  action={
                    <Link
                      href="/dashboard?view=reportsubmissionhistory"
                      className="shrink-0 text-xs font-semibold leading-5 text-[#9CA3AF] transition hover:text-[#64748B]"
                    >
                      View history
                    </Link>
                  }
                >
                  {t("dashboard.assistant.triage.recommendedSteps")}
                </SectionTitle>

                <Link
                  href={primaryStepHref as Route}
                  data-testid="triage-primary-step-link"
                  className="mt-5 flex items-center justify-between gap-5 rounded-[24px] bg-white p-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 sm:rounded-[32px] sm:p-6"
                >
                  <span className="flex min-w-0 items-center gap-4 sm:gap-6">
                    <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#FFEDD5] text-[#F97316] sm:h-16 sm:w-16">
                      <IconFirstAidKit size={24} stroke={2.3} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-extrabold leading-7 text-[#111827] sm:text-xl">
                        {triagePresentation.primaryStepTitle}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-[#6B7280] sm:text-base sm:leading-6">
                        {triagePresentation.primaryStepBody}
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F9FAFB] text-[#9CA3AF]">
                    <IconArrowRight size={18} />
                  </span>
                </Link>

                <div className="mt-5 grid gap-4">
                  {displayedActionRows.map((action, index) => {
                    const rowConfig =
                      index === 0
                        ? {
                            icon: <IconShieldFilled size={18} />,
                            iconClassName: "bg-[#FEF2F2] text-[#EF4444]",
                            buttonClassName:
                              "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FF8A00] px-6 text-xs font-extrabold text-white shadow-[0_12px_22px_rgba(255,138,0,0.28)] transition hover:bg-[#F47C00] sm:w-auto",
                          }
                        : index === 1
                          ? {
                              icon: <IconGavel size={20} />,
                              iconClassName: "bg-[#EEF2FF] text-[#4F63F6]",
                              buttonClassName:
                                "inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#F3F4F6] px-6 text-xs font-extrabold text-[#374151] transition hover:bg-[#E5E7EB] sm:w-auto",
                            }
                          : {
                              icon: <IconHeadphones size={20} />,
                              iconClassName: "bg-[#E6FFFA] text-[#14B8A6]",
                              buttonClassName:
                                "inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#F3F4F6] px-6 text-xs font-extrabold text-[#374151] transition hover:bg-[#E5E7EB] sm:w-auto",
                            };

                    return (
                      <RecommendationRow
                        key={`${action.slot}-${action.title}-${index}`}
                        icon={rowConfig.icon}
                        iconClassName={rowConfig.iconClassName}
                        title={action.title}
                        description={action.description}
                        detail={`${action.whySuggested} ${action.consentNote}`}
                        action={
                          <ActionLink
                            href={action.href}
                            className={rowConfig.buttonClassName}
                          >
                            {action.ctaLabel}
                            {action.actionKind === "call" ? (
                              <IconPhoneFilled size={14} />
                            ) : (
                              <IconArrowRight
                                size={16}
                                className="text-[#9CA3AF]"
                              />
                            )}
                          </ActionLink>
                        }
                      />
                    );
                  })}
                  <RecommendationRow
                    icon={<IconAlertCircleFilled size={20} />}
                    iconClassName="bg-[#EFF6FF] text-[#0F5D9F]"
                    title="Report Incident"
                    description="Safely submit details about what happened. You can choose to remain anonymous."
                    detail="SafeSpeak does not submit anything automatically. You have full control."
                    action={
                      <ActionLink
                        href={withConversationSessionId(
                          REPORT_START_FROM_TRIAGE_HREF,
                          resolvedConversationSessionId
                        )}
                        className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#0F5D9F] px-6 text-xs font-extrabold text-white shadow-[0_12px_22px_rgba(15,93,159,0.28)] transition hover:bg-[#004E92] sm:w-auto"
                      >
                        Start Report
                        <IconArrowRight size={16} className="text-white" />
                      </ActionLink>
                    }
                  />
                </div>
              </section>

              <section>
                <SectionTitle
                  action={
                    suggestedMicroCards.length > 0 ? (
                      <Link
                        href="/dashboard?view=microcards"
                        className="inline-flex h-9 items-center gap-2 self-start rounded-full border border-[#D8E3F0] bg-white px-4 text-xs font-bold text-[#334155] transition hover:bg-[#F8FAFC] sm:self-auto"
                      >
                        View all
                        <IconArrowRight size={14} />
                      </Link>
                    ) : null
                  }
                >
                  Suggested guides
                </SectionTitle>

                <p className="mt-2 text-sm leading-5 text-[#64748B]">
                  {triagePresentation.microCardSummary ||
                    "These guides were selected from the triage support response, so the page is not re-classifying your situation in the browser."}
                </p>

                <div className="mt-5">
                  {isLoadingMicroCards ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={index}
                          className="min-h-[220px] animate-pulse rounded-[28px] bg-white/80 shadow-[0_18px_34px_rgba(15,93,159,0.08)]"
                        />
                      ))}
                    </div>
                  ) : suggestedMicroCards.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {suggestedMicroCards.map((card) => (
                        <SuggestedMicroCard
                          key={card.id}
                          card={card}
                          riskLevel={triage?.safetyRiskLevel ?? "low"}
                          onOpen={() => setActiveMicroCardId(card.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <article className="rounded-[24px] border border-dashed border-[#D8E3F0] bg-white p-6 text-sm leading-6 text-[#64748B]">
                      {microCardsError ||
                        "No specific guide cards were suggested for this triage yet. You can still review the steps and resources below."}
                    </article>
                  )}
                </div>
              </section>

              <section>
                <SectionTitle>
                  {t("dashboard.assistant.triage.additionalResources")}
                </SectionTitle>
                <div className="mt-5">
                  {support.additionalResources.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
                      {support.additionalResources.map((action) => (
                        <ResourceCard
                          key={`${action.slot}-${action.title}`}
                          action={action}
                        />
                      ))}
                    </div>
                  ) : (
                    <article className="rounded-[24px] border border-dashed border-[#D8E3F0] bg-white p-6 text-sm leading-6 text-[#64748B]">
                      No extra resources were matched yet. You can still review
                      the detailed explanation page or browse general support in
                      the explorer.
                    </article>
                  )}
                </div>
              </section>

              {shouldShowTriageDebug() && triage ? (
                <section>
                  <details className="rounded-[20px] border border-dashed border-[#D8E3F0] bg-[#F8FAFC] p-5">
                    <summary className="cursor-pointer text-sm font-extrabold text-[#0F172A]">
                      Triage debug
                    </summary>
                    <div className="mt-4 grid gap-4 text-sm leading-6 text-[#475569] md:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                          Session
                        </p>
                        <p className="mt-1">
                          {resolvedConversationSessionId || "not available"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                          Selected category
                        </p>
                        <p className="mt-1">
                          {triage.likelyCategoryLabel || triage.likelyCategory}
                        </p>
                        <p className="text-xs text-[#94A3B8]">
                          Related issue types:{" "}
                          {(triage.relatedIssueTypes ?? []).join(", ") || "none"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                          Matched facts
                        </p>
                        <p className="mt-1">
                          {(triage.structuredFacts?.matchedFacts ?? []).join(
                            "; "
                          ) || "none"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                          Recommended actions
                        </p>
                        <p className="mt-1">
                          {support.recommendedActions
                            .map((item) => item.title)
                            .join(", ") || "none"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                          Additional resources
                        </p>
                        <p className="mt-1">
                          {support.additionalResources
                            .map((item) => item.title)
                            .join(", ") || "none"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#64748B]">
                          Suggested guides
                        </p>
                        <p className="mt-1">
                          {suggestedMicroCards
                            .map((card) => card.title)
                            .join(", ") || "none"}
                        </p>
                      </div>
                    </div>
                  </details>
                </section>
              ) : null}

              <div className="mt-8 flex justify-center border-t border-[#e2e8f0] pt-6">
                <Link
                  href={withConversationSessionId(
                    "/dashboard?view=reportsubmissiondetails&fromTriage=1",
                    resolvedConversationSessionId
                  )}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#ff8f00] px-8 text-xs font-bold text-white shadow-[0_8px_20px_rgba(255,143,0,0.3)] transition hover:bg-[#ec8200]"
                >
                  Continue to Incident Details
                  <IconArrowRight size={14} className="text-white" />
                </Link>
              </div>

              <footer className="border-t border-[#F3F4F6] pt-8">
                <div className="mx-auto flex max-w-[760px] flex-col gap-2 text-center text-xs leading-5 text-[#9CA3AF]">
                  {(consentGovernance?.messages ?? []).map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                  <p>{t("dashboard.assistant.triage.footerNote")}</p>
                </div>
              </footer>
            </>
          ) : null}
        </div>
      </ReportSubmissionFrame>

      {activeMicroCard ? (
        <MicroCardDetailOverlay
          card={activeMicroCard}
          riskLevel={triage?.safetyRiskLevel ?? "low"}
          onClose={() => setActiveMicroCardId(null)}
          onPrevious={() => openAdjacentMicroCard(-1)}
          onNext={() => openAdjacentMicroCard(1)}
          showNavigation={suggestedMicroCards.length > 1}
        />
      ) : null}

      <RecommendationDetailModal
        selection={shouldShowNoSessionTriage ? detailSelection : null}
        onClose={closeRecommendationDetail}
        onNavigate={navigateRecommendationDetail}
        onBack={detailStackDepth > 0 ? backRecommendationDetail : undefined}
      />
    </>
  );
}

export { ReportSubmissionSupportPage };
