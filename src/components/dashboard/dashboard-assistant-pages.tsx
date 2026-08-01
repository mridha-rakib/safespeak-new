"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  IconAlertCircle,
  IconArrowRight,
  IconCheck,
  IconFileText,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPaperclip,
  IconPhoto,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import sendIcon from "@/assets/sendIcon.svg?url";
import { AssistantMessageRenderer } from "@/components/chat/assistant-message-renderer";
import { ConsentRequiredCard } from "@/components/consent/consent-required-card";
import { AssistantInteraction } from "@/components/dashboard/assistant-interaction";
import { AssistantVoiceFirstInput } from "@/components/dashboard/assistant-voice-first-input";
import {
  VoiceAvatarAnimation,
  type VoiceAvatarState,
} from "@/components/dashboard/voice-avatar-animation";
import { useConsentGate } from "@/hooks/use-consent-gate";
import { ApiRequestError } from "@/lib/api";
import type { AssistantIncidentCategory } from "@/lib/assistant-categories";
import {
  type AssistantConversationMessage,
  type AssistantTimeline,
  type LegalAwareness,
  sendTimelineAssistantMessage,
  shouldCallTimelineAssistant,
} from "@/lib/assistant-conversation";
import {
  clearAssistantConversationDraft,
  getAssistantConversationDraft,
  saveAssistantConversationDraft,
} from "@/lib/assistant-draft";
import {
  clearAssistantTriageSource,
  saveAssistantTriageSource,
} from "@/lib/assistant-triage";
import { consumeAssistantVoiceHandoff } from "@/lib/assistant-voice-handoff";
import { consentRequirements, ensureConsent } from "@/lib/consent";
import {
  type ConversationFlowTriage,
  appendConversationFlowMessage,
  createConversationFlowSession,
} from "@/lib/conversation-flow";
import {
  type DashboardCardFlowId,
  getDashboardActionHref,
  getDashboardAssistantTopicChips,
  getDashboardCardFlow,
} from "@/lib/dashboard-card-flows";
import { LAST_NON_CONVERSATION_DASHBOARD_URL_STORAGE_KEY } from "@/lib/dashboard-navigation";
import {
  CONTINUE_TO_TRIAGE_SUGGESTION_ID,
  DEMO_ASSISTANT_STORAGE_KEY,
  HIJAB_CONFIRM_TRIAGE_SUGGESTION_ID,
  type DemoAttachment,
  type DemoConversationMessage,
  type DemoConversationState,
  type DemoEmergencyAlert,
  type DemoExplanation,
  type DemoMessageBlock,
  type DemoNextStepGroup,
  type DemoServiceOption,
  type DemoSuggestion,
  createDemoMessage,
  getDemoAssistantResponse,
  resetDemoConversation,
  simulateDemoAttachmentProcessing,
  simulateDemoDictation,
  simulateDemoTranscription,
} from "@/lib/demo-assistant-conversation";
import { triggerQuickExit } from "@/lib/safety";
import {
  buildConversationRequestBody,
  hasBrokenTextEncoding,
} from "@/lib/text-encoding";
import {
  createAssistantVoiceAudioUrl,
  synthesizeAssistantVoice,
  transcribeAssistantVoice,
} from "@/lib/voice-transcription";

import { interFont } from "./dashboard-shared";

const emptyTimeline: AssistantTimeline = {};

function normalizeAssistantSpeechLanguage(
  language?: string
): string | undefined {
  const normalized = language?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  const aliases: Record<string, string> = {
    "ar-sa": "ar",
    "bn-bd": "bn",
    "el-gr": "el",
    "en-au": "en",
    "en-us": "en",
    "es-419": "es",
    "es-es": "es",
    "es-mx": "es",
    "hi-in": "hi",
    "ne-np": "ne",
    "pa-in": "pa",
    "vi-vn": "vi",
    yue: "zh-Hant",
    "yue-hk": "zh-Hant",
    zh: "zh-Hans",
    "zh-cn": "zh-Hans",
    "zh-hans": "zh-Hans",
    "zh-hant": "zh-Hant",
    "zh-hk": "zh-Hant",
    "zh-sg": "zh-Hans",
    "zh-tw": "zh-Hant",
  };

  return aliases[normalized] ?? language?.trim();
}

function detectAssistantSpeechLanguage(text: string): string {
  if (/[\u0600-\u06ff]/u.test(text)) return "ar";
  if (/[\u0980-\u09ff]/u.test(text)) return "bn";
  if (/[\u0370-\u03ff]/u.test(text)) return "el";
  if (/[\u0a00-\u0a7f]/u.test(text)) return "pa";
  if (/[\u0900-\u097f]/u.test(text)) return "hi";
  if (/\p{Script=Han}/u.test(text)) return "zh-Hans";
  if (
    /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(
      text
    )
  ) {
    return "vi";
  }
  if (/[¿¡ñáéíóúü]/iu.test(text)) return "es";
  return "en";
}

const harmfulActivityPatterns = [
  /\b(violence|violent|abuse|assault|attacked|attack|hit|slap|punched|kick|kicked|choke|threat|threatened)\b/i,
  /\b(harass|harassment|bullied|bullying|stalk|stalking|unsafe|scared|fear)\b/i,
  /\b(racist|racism|discrimination|hate|hate crime|racial)\b/i,
  /\b(scam|fraud|phishing|blackmail|extortion|stole|stolen|robbed|theft)\b/i,
  /\b(grabbed|grab|pulled|pull)\b.{0,24}\b(hijab|hijub|headscarf)\b/i,
  /\b(hijab|hijub|headscarf)\b.{0,24}\b(grabbed|grab|pulled|pull)\b/i,
];

type ConversationCitation = {
  sourceId?: string;
  title: string;
  legislationName?: string;
  publisher?: string;
  url?: string;
  jurisdiction?: string;
  sourceCategory?: string;
  sourceType?: string;
  topic?: string;
  sectionRef?: string;
  sectionTitle?: string;
  page?: number;
  pageStart?: number;
  pageEnd?: number;
  versionDate?: string;
  commencementDate?: string;
  amendmentStatus?: "in_force" | "amended" | "repealed";
  lastUpdated?: string;
};

function AvatarVoiceControlGlyph() {
  return (
    <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
      <span className="h-[4px] w-[4px] rounded-full bg-current opacity-95" />
      <span className="h-[10px] w-[2.5px] rounded-full bg-current" />
      <span className="h-[14px] w-[2.5px] rounded-full bg-current" />
      <span className="h-[10px] w-[2.5px] rounded-full bg-current" />
      <span className="h-[4px] w-[4px] rounded-full bg-current opacity-95" />
    </span>
  );
}

function buildAssistantBubbleContent(
  assistantMessage: string,
  nextQuestion: string
): string {
  const trimmedAssistantMessage = assistantMessage.trim();
  const trimmedNextQuestion = nextQuestion.trim();

  if (!trimmedAssistantMessage) {
    return trimmedNextQuestion;
  }

  if (!trimmedNextQuestion) {
    return trimmedAssistantMessage;
  }

  if (
    trimmedAssistantMessage.toLowerCase() === trimmedNextQuestion.toLowerCase()
  ) {
    return trimmedAssistantMessage;
  }

  return `${trimmedAssistantMessage} ${trimmedNextQuestion}`;
}

function detectHarmfulActivity(input: {
  incidentCategory?: AssistantIncidentCategory;
  timeline: AssistantTimeline;
  conversation: AssistantConversationMessage[];
}): boolean {
  if (
    input.incidentCategory === "domestic_violence" ||
    input.incidentCategory === "racial_abuse" ||
    input.incidentCategory === "cyber_scam"
  ) {
    return true;
  }

  const combinedText = [
    ...input.conversation.map((message) => message.content),
    ...Object.values(input.timeline),
  ]
    .join(" ")
    .trim();

  if (!combinedText) {
    return false;
  }

  return harmfulActivityPatterns.some((pattern) => pattern.test(combinedText));
}

function isActionableConversationTriage(response: {
  transition: { offerTriage: boolean };
  triage?: ConversationFlowTriage | null;
  responseMeta?: {
    triageReady?: boolean;
    nextAction?: string;
  };
}): boolean {
  if (
    response.responseMeta?.triageReady ||
    response.responseMeta?.nextAction === "show_triage_button"
  ) {
    return true;
  }

  const triage = response.triage;

  return Boolean(
    response.transition.offerTriage &&
    triage &&
    triage.likelyCategory !== "general_support" &&
    triage.confidenceScore >= 0.45 &&
    triage.canProceedToRecommendations
  );
}

function getAssistantDisplayContent(message: AssistantConversationMessage) {
  if (message.role !== "assistant") {
    return message.content;
  }

  const cleanedContent = [
    /\s*This information is for general awareness(?: only)? and does not constitute legal advice\.?/gi,
    /\s*This information is for general awareness only\.?/gi,
    /\s*This is information only,?\s*not legal advice\.?/gi,
    /\s*This is informational,?\s*not legal advice\.?/gi,
    /\s*It does not constitute legal advice\.?/gi,
  ]
    .reduce((content, pattern) => content.replace(pattern, ""), message.content)
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\s+([?.!,])/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n\n");

  return cleanedContent || "I'm here with you.";
}

function formatConversationSectionRef(sectionRef?: string) {
  if (!sectionRef) {
    return "";
  }

  return sectionRef.replace(/^Section\s+/i, "section ");
}

function buildConversationCitationSummary(citation: ConversationCitation) {
  const sectionRef = formatConversationSectionRef(citation.sectionRef);
  const page = citation.pageStart ?? citation.page;
  const pageLabel = page
    ? `p. ${citation.pageEnd && citation.pageEnd !== page ? `${page}-${citation.pageEnd}` : page}`
    : "";
  const versionLabel = citation.versionDate
    ? `version ${formatConversationCitationDate(citation.versionDate)}`
    : citation.lastUpdated
      ? `updated ${formatConversationCitationDate(citation.lastUpdated)}`
      : "";
  const sectionTitle = citation.sectionTitle
    ? `- ${citation.sectionTitle}`
    : "";
  const amendmentLabel =
    citation.amendmentStatus && citation.amendmentStatus !== "in_force"
      ? citation.amendmentStatus.replace("_", " ")
      : "";

  return [
    citation.title,
    citation.publisher,
    sectionRef,
    sectionTitle,
    pageLabel,
    versionLabel,
    amendmentLabel,
  ]
    .filter(Boolean)
    .join(", ");
}

function formatConversationCitationDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildConversationCitationIdentity(citation: ConversationCitation) {
  return buildConversationCitationSummary(citation);
}

function dedupeConversationCitations(citations: ConversationCitation[]) {
  const seen = new Set<string>();

  return citations.filter((citation) => {
    const key = buildConversationCitationIdentity(citation);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildLegalCitationSummary(citation: ConversationCitation) {
  const sectionValue = formatConversationSectionRef(citation.sectionRef);
  const pageValue = citation.pageStart
    ? citation.pageEnd && citation.pageEnd !== citation.pageStart
      ? `${citation.pageStart}-${citation.pageEnd}`
      : `${citation.pageStart}`
    : citation.page
      ? `${citation.page}`
      : "";
  const versionValue = citation.versionDate
    ? formatConversationCitationDate(citation.versionDate)
    : citation.commencementDate
      ? formatConversationCitationDate(citation.commencementDate)
      : "";

  return [
    { label: "Law", value: citation.legislationName || citation.title },
    { label: "Section / number", value: sectionValue || "Not specified" },
    {
      label: "Section title",
      value: citation.sectionTitle || "Not specified",
    },
    { label: "Page", value: pageValue ? `p. ${pageValue}` : "Not specified" },
    {
      label: "Version",
      value: versionValue || "Not specified",
    },
    {
      label: "Status",
      value:
        citation.amendmentStatus && citation.amendmentStatus !== "in_force"
          ? citation.amendmentStatus.replace("_", " ")
          : "in force",
    },
  ];
}

function AssistantLegalCitationDetails({
  citations,
  groundedLegalSource,
  showDetails,
}: {
  citations: ConversationCitation[];
  groundedLegalSource?: {
    sourceId: string;
    title?: string;
    legislationName?: string;
    citationUrl?: string;
  };
  showDetails: boolean;
}) {
  if (!showDetails) {
    return null;
  }

  const legalCitations = dedupeConversationCitations(citations).filter(
    (citation) =>
      citation.sourceCategory === "official_legal_source" ||
      /^(act|regulation|decision)$/i.test(citation.sourceType ?? "")
  );

  if (!legalCitations.length) {
    const fallbackLaw =
      groundedLegalSource?.legislationName ||
      groundedLegalSource?.title ||
      "AIHW";
    const fallbackUrl =
      groundedLegalSource?.citationUrl ||
      "https://www.aihw.gov.au/family-domestic-and-sexual-violence/responses-and-outcomes/legal-systems";

    return (
      <div className="mt-2 rounded-[14px] border border-[#dce6f2] bg-[#f7fbff] px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#72839b]">
          Law details
        </p>
        <div className="mt-2 rounded-[12px] border border-[#e3edf7] bg-white px-3 py-2">
          <p className="text-[11px] font-semibold text-[#1f2a3a]">
            {fallbackLaw}
          </p>
          <div className="mt-1 space-y-0.5 text-[11px] leading-[1.45] text-[#4b5d73]">
            <p>
              <span className="font-semibold text-[#334255]">Law:</span>{" "}
              {fallbackLaw}
            </p>
            <p>
              <span className="font-semibold text-[#334255]">
                Section / number:
              </span>{" "}
              Not specified in RAG
            </p>
            <p>
              <span className="font-semibold text-[#334255]">
                Section title:
              </span>{" "}
              Not specified in RAG
            </p>
            <p>
              <span className="font-semibold text-[#334255]">Page:</span> Not
              specified in RAG
            </p>
            <p>
              <span className="font-semibold text-[#334255]">Version:</span> Not
              specified in RAG
            </p>
            <p>
              <span className="font-semibold text-[#334255]">Law URL:</span>{" "}
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#2f6fca] underline-offset-2 hover:underline"
              >
                Open source
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-[14px] border border-[#dce6f2] bg-[#f7fbff] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#72839b]">
        Law details
      </p>
      <div className="mt-2 space-y-2">
        {legalCitations.map((citation) => {
          const summaryRows = buildLegalCitationSummary(citation);
          const citationKey =
            citation.sourceId ??
            `${citation.title}-${citation.url ?? ""}-${citation.sectionRef ?? ""}-${citation.pageStart ?? citation.page ?? ""}`;

          return (
            <div
              key={citationKey}
              className="rounded-[12px] border border-[#e3edf7] bg-white px-3 py-2"
            >
              <p className="text-[11px] font-semibold text-[#1f2a3a]">
                {citation.legislationName || citation.title}
              </p>
              <div className="mt-1 space-y-0.5 text-[11px] leading-[1.45] text-[#4b5d73]">
                {summaryRows.map((row) => (
                  <p key={row.label}>
                    <span className="font-semibold text-[#334255]">
                      {row.label}:
                    </span>{" "}
                    {row.value}
                  </p>
                ))}
                {citation.url ? (
                  <p>
                    <span className="font-semibold text-[#334255]">
                      Law URL:
                    </span>{" "}
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#2f6fca] underline-offset-2 hover:underline"
                    >
                      Open source
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildAssistantLawPrefix(message: {
  role: string;
  responseMeta?: {
    citations?: ConversationCitation[];
    groundedLegalSource?: {
      sourceId: string;
      title?: string;
      legislationName?: string;
      citationUrl?: string;
    };
  };
}): string {
  const groundedSource = message.responseMeta?.groundedLegalSource;
  const legalCitation = (message.responseMeta?.citations ?? []).find(
    (citation) =>
      citation.sourceCategory === "official_legal_source" ||
      /^(act|regulation|decision)$/i.test(citation.sourceType ?? "")
  );

  const lawName =
    legalCitation?.legislationName ||
    legalCitation?.title ||
    groundedSource?.legislationName ||
    groundedSource?.title;

  if (!lawName) {
    return "";
  }

  const section = legalCitation?.sectionRef
    ? `, ${formatConversationSectionRef(legalCitation.sectionRef)}`
    : "";

  return `Law: ${lawName}${section}`;
}

function AssistantResponseCitations({
  citations,
  showSources,
  answerText,
}: {
  citations: ConversationCitation[];
  showSources: boolean;
  answerText: string;
}) {
  if (!showSources || !citations.length) {
    return null;
  }

  const dedupedCitations = dedupeConversationCitations(citations);
  const normalizedAnswer = answerText.toLowerCase();
  const directReferenceCount = dedupedCitations.filter((citation) => {
    const sectionRef = formatConversationSectionRef(citation.sectionRef)
      .trim()
      .toLowerCase();

    if (sectionRef) {
      return normalizedAnswer.includes(sectionRef);
    }

    return citation.title.trim().length
      ? normalizedAnswer.includes(citation.title.trim().toLowerCase())
      : false;
  }).length;
  const compactCitations = dedupedCitations.slice(
    0,
    directReferenceCount > 1 ? 2 : 1
  );

  return (
    <div className="mt-2">
      <p className="text-[11px] leading-[1.55] text-[#7d8ea5]">
        <span className="font-semibold text-[#6a7a92]">
          {compactCitations.length > 1 ? "Sources:" : "Source:"}
        </span>{" "}
        {compactCitations.map((citation, index) => {
          const citationKey = buildConversationCitationIdentity(citation);
          const summary = buildConversationCitationSummary(citation);

          return (
            <span key={citationKey}>
              {index > 0 ? "; " : null}
              {citation.url ? (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-[#c6d4e6] underline-offset-2 hover:text-[#52657d]"
                >
                  {summary}
                </a>
              ) : (
                <span>{summary}</span>
              )}
            </span>
          );
        })}
      </p>
    </div>
  );
}

type RecordingErrorCode =
  | "audio-capture"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed";

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const VOICE_RECORDING_TIMEOUT_MS = 8000;
type VoiceCaptureTarget = "conversation" | "transcription";

function getRecordingErrorMessage(
  errorCode: RecordingErrorCode,
  t: (key: string) => string
): string {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return t("dashboard.assistant.speechErrors.permissionDenied");
    case "audio-capture":
      return t("dashboard.assistant.speechErrors.noMicrophone");
    case "no-speech":
      return t("dashboard.assistant.speechErrors.noSpeech");
    case "network":
      return t("dashboard.assistant.speechErrors.network");
    default:
      return t("dashboard.assistant.speechErrors.startFailed");
  }
}

function getPreferredRecordingMimeType(): string | undefined {
  const supportedTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

  if (typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }

  return supportedTypes.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType)
  );
}

function isNoSpeechTranscriptionError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    error.status === 422 ||
    message.includes("no speech") ||
    message.includes("empty") ||
    message.includes("too short")
  );
}

function getContinueReportSubmissionHref(
  incidentCategory?: AssistantIncidentCategory,
  conversationSessionId?: string
) {
  return {
    pathname: "/dashboard",
    query: {
      view: "reportsubmissionsupport",
      category: incidentCategory,
      conversationSessionId,
    },
  } as const;
}

function getContinueReportSubmissionPath(
  incidentCategory?: AssistantIncidentCategory,
  conversationSessionId?: string
) {
  return getDashboardHrefString(
    getContinueReportSubmissionHref(incidentCategory, conversationSessionId)
  );
}

function getAssistantEntryHref(
  initialTopic?: DashboardCardFlowId,
  initialCategory?: AssistantIncidentCategory
) {
  return {
    pathname: "/dashboard",
    query: {
      view: "assistant",
      topic: initialTopic,
      category: initialCategory,
    },
  } as const;
}

function getDashboardHrefString(input: {
  pathname: string;
  query?: Record<string, string | undefined>;
}) {
  const searchParams = new URLSearchParams();

  Object.entries(input.query ?? {}).forEach(([key, value]) => {
    if (typeof value === "string" && value.length > 0) {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${input.pathname}?${queryString}` : input.pathname;
}

function shouldUseNswLegalAwareness(
  topic?: DashboardCardFlowId,
  category?: AssistantIncidentCategory
) {
  return (
    topic === "racial_abuse" ||
    topic === "migrant_challenges" ||
    category === "racial_abuse" ||
    category === "migrant_challenges"
  );
}

const staticNswLegalAwareness: LegalAwareness = {
  jurisdiction: "NSW",
  topic: "racial_abuse",
  informationOnly: true,
  sourceStatus: "insufficient_approved_sources",
  keyPoints: [
    "Keep a dated record of what happened if it is safe.",
    "NSW and Commonwealth pathways can both be relevant for racial abuse or discrimination concerns.",
    "Online abuse may also involve platform reporting, eSafety information, and immediate safety planning.",
  ],
  pathwayCards: [
    {
      title: "NSW discrimination pathway",
      body: "SafeSpeak can help organize details for Anti-Discrimination NSW style complaint information once approved sources are available.",
      sourceRequirement:
        "Detailed legal explanations require approved NSW sources.",
    },
    {
      title: "Commonwealth pathway",
      body: "Some racial discrimination concerns may involve Australian Human Rights Commission information.",
      sourceRequirement:
        "Citations appear only from approved Commonwealth sources.",
    },
    {
      title: "Online abuse pathway",
      body: "For online incidents, evidence collection, platform reports, and eSafety information may be relevant.",
      sourceRequirement: "Use approved eSafety sources before public citation.",
    },
  ],
  citationPolicy:
    "No citations are shown until approved, current, legally reviewed sources are available.",
};

function NswLegalAwarenessPanel({
  legalAwareness,
  compact = false,
}: {
  legalAwareness: LegalAwareness;
  compact?: boolean;
}) {
  return (
    <section
      className={`rounded-[20px] border border-[#d6e2f0] bg-[#fbfdff] ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#3f7de0]">
            NSW legal awareness
          </p>
          <p className="mt-1 text-[12px] leading-[1.55] text-[#5f6f86]">
            Information only, not legal advice. SafeSpeak will cite only
            approved, current, legally reviewed sources.
          </p>
        </div>
        <span className="rounded-full border border-[#d6e2f0] bg-white px-3 py-1 text-[10px] font-semibold text-[#51657f]">
          {legalAwareness.sourceStatus === "approved_sources_used"
            ? "Approved sources available"
            : "Sources pending approval"}
        </span>
      </div>

      {legalAwareness.keyPoints.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-[10px] leading-[1.55] text-[#617289]">
          {legalAwareness.keyPoints.map((point) => (
            <li key={point} className="flex gap-2">
              <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-[#82aee8]" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {legalAwareness.pathwayCards.map((card) => (
          <article
            key={card.title}
            className="rounded-[16px] border border-[#e2e9f3] bg-white p-3"
          >
            <h4 className="text-[12px] font-bold text-[#1f2a3a]">
              {card.title}
            </h4>
            <p className="mt-1 text-[10px] leading-[1.55] text-[#697b92]">
              {card.body}
            </p>
            <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#9aa8ba]">
              {card.sourceRequirement}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function hasActiveAssistantDraftForScope(input: {
  topic?: DashboardCardFlowId;
  incidentCategory?: AssistantIncidentCategory;
}) {
  const draft = getAssistantConversationDraft({
    topic: input.topic,
    incidentCategory: input.incidentCategory,
  });

  if (!draft) {
    return false;
  }

  const hasUserMessage = draft.messages.some(
    (message) => message.role === "user"
  );
  const hasTimelineContent = Object.values(draft.timeline).some(
    (value) => value.trim().length > 0
  );

  return hasUserMessage || hasTimelineContent;
}

function SafeSpeakAssistantPage({
  startFresh = false,
  isRecording = false,
  initialCategory,
  initialTopic,
}: {
  startFresh?: boolean;
  isRecording?: boolean;
  initialCategory?: AssistantIncidentCategory;
  initialTopic?: DashboardCardFlowId;
}) {
  const router = useRouter();
  const [isCheckingDraft, setIsCheckingDraft] = useState(true);

  useEffect(() => {
    if (startFresh) {
      setIsCheckingDraft(false);
      return;
    }

    if (initialTopic || initialCategory) {
      if (
        hasActiveAssistantDraftForScope({
          topic: initialTopic,
          incidentCategory: initialCategory,
        })
      ) {
        const query = new URLSearchParams({
          view: "assistantconversation",
        });

        if (initialTopic) {
          query.set("topic", initialTopic);
        }

        if (initialCategory) {
          query.set("category", initialCategory);
        }

        router.replace(`/dashboard?${query.toString()}`);
        return;
      }

      setIsCheckingDraft(false);
      return;
    }

    if (!hasActiveAssistantDraftForScope({})) {
      setIsCheckingDraft(false);
      return;
    }

    router.replace("/dashboard?view=assistantconversation");
  }, [initialCategory, initialTopic, router, startFresh]);
  if (isCheckingDraft) {
    return null;
  }

  const assistantFlow = initialTopic
    ? getDashboardCardFlow(initialTopic)
    : null;
  const assistantTopicChips = getDashboardAssistantTopicChips();
  const startWithTopicHref = assistantFlow?.starterPrompt
    ? getDashboardActionHref(assistantFlow.id, "talk_with_assistant")
    : null;

  return (
    <div className="px-2 pb-28 pt-2 sm:px-4 sm:pb-32 sm:pt-4 lg:pb-24">
      <div className="mx-auto flex w-full max-w-[1184px] flex-col">
        <AssistantInteraction
          isRecording={isRecording}
          initialCategory={initialCategory}
          initialTopic={initialTopic}
          headlineClassName={`${interFont.className} mt-6 max-w-[460px] text-center text-[28px] font-semibold leading-[32px] tracking-[0] text-[#24364f] sm:text-[30px] sm:leading-[34px] xl:text-[32px] xl:leading-[36px]`}
        />

        {assistantFlow ? (
          <article className="bg-white/96 mx-auto -mt-[158px] w-full max-w-[1120px] rounded-[24px] border border-[#dce6f2] p-4 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-[760px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#3f7de0]">
                  {assistantFlow.title}
                </p>
                <p className="mt-2 text-sm leading-[1.65] text-[#5f6f86]">
                  {assistantFlow.starterPrompt ??
                    "Choose how you want to begin. Nothing is submitted until you decide to continue."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {assistantFlow.disclaimers.map((disclaimer) => (
                    <span
                      key={disclaimer}
                      className="rounded-full border border-[#d6e2f0] bg-[#f8fbff] px-3 py-1.5 text-[10px] font-semibold text-[#51657f]"
                    >
                      {disclaimer}
                    </span>
                  ))}
                </div>
              </div>

              {startWithTopicHref ? (
                <Link
                  href={startWithTopicHref}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#0f5d9f] px-5 text-[12px] font-bold text-white shadow-[0_10px_24px_rgba(15,93,159,0.25)] transition hover:bg-[#0b528d]"
                >
                  Start with this topic
                  <IconArrowRight size={14} className="ml-1.5" />
                </Link>
              ) : null}
            </div>

            {assistantFlow.nextActions.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {assistantFlow.nextActions.map((action) => {
                  if (action.id === "quick_exit") {
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => triggerQuickExit()}
                        className="rounded-[18px] border border-[#f1d6d6] bg-[#fff7f7] p-3 text-left transition hover:border-[#eabcbc] hover:bg-[#fff2f2]"
                      >
                        <p className="text-[12px] font-bold text-[#1f2a3a]">
                          {action.label}
                        </p>
                        <p className="mt-1 text-[10px] leading-[1.55] text-[#7688a0]">
                          {action.description}
                        </p>
                      </button>
                    );
                  }

                  const actionHref = getDashboardActionHref(
                    assistantFlow.id,
                    action.id
                  );

                  if (!actionHref) {
                    return null;
                  }

                  return (
                    <Link
                      key={action.id}
                      href={actionHref}
                      className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-3 text-left transition hover:border-[#c5d8ec] hover:bg-[#f7fbff]"
                    >
                      <p className="text-[12px] font-bold text-[#1f2a3a]">
                        {action.label}
                      </p>
                      <p className="mt-1 text-[10px] leading-[1.55] text-[#7688a0]">
                        {action.description}
                      </p>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {assistantFlow.id === "general_assistant" ? (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7d8ea5]">
                  Choose a topic
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {assistantTopicChips.map((topicChip) => {
                    const resolvedChipHref = topicChip.starterPrompt
                      ? getDashboardActionHref(
                          topicChip.id,
                          "talk_with_assistant"
                        )
                      : null;

                    if (!resolvedChipHref) {
                      return null;
                    }

                    return (
                      <Link
                        key={topicChip.id}
                        href={resolvedChipHref}
                        className="rounded-full border border-[#d6e2f0] bg-white px-3 py-2 text-[11px] font-semibold text-[#42566f] transition hover:border-[#bfd1e6] hover:bg-[#f8fbff]"
                      >
                        {topicChip.title}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {shouldUseNswLegalAwareness(initialTopic, initialCategory) ? (
              <div className="mt-4">
                <NswLegalAwarenessPanel
                  legalAwareness={{
                    ...staticNswLegalAwareness,
                    topic:
                      initialTopic === "migrant_challenges" ||
                      initialCategory === "migrant_challenges"
                        ? "migrant_challenges"
                        : "racial_abuse",
                  }}
                />
              </div>
            ) : null}
          </article>
        ) : null}
      </div>
    </div>
  );
}

type DemoVoiceStatus =
  | "idle"
  | "starting"
  | "listening"
  | "processing-user"
  | "assistant-speaking"
  | "finishing"
  | "paused"
  | "error";

type DemoDictationStatus = "ready" | "listening" | "transcribing" | "error";

type DemoVoiceTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  blocks?: DemoMessageBlock[];
  suggestions?: DemoSuggestion[];
};

function formatLocalFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDemoTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getVoiceStatusLabel(status: DemoVoiceStatus): string {
  switch (status) {
    case "starting":
      return "Starting voice conversation";
    case "listening":
      return "Listening";
    case "processing-user":
      return "SafeSpeak is processing";
    case "assistant-speaking":
      return "SafeSpeak is speaking";
    case "finishing":
      return "Finishing voice conversation";
    case "paused":
      return "Voice conversation paused";
    case "error":
      return "Voice demo unavailable";
    default:
      return "Voice conversation ready";
  }
}

function getVoiceStatusDescription(
  status: DemoVoiceStatus,
  recordingSeconds: number
): string {
  switch (status) {
    case "idle":
      return "Tap the circular mic to begin a demo voice turn.";
    case "starting":
      return "Preparing a local microphone session.";
    case "listening":
      return `Session duration ${formatDemoTimer(recordingSeconds)}`;
    case "processing-user":
      return "Creating a local demo transcript and response.";
    case "assistant-speaking":
      return "Playing a browser-only demo response.";
    case "finishing":
      return "Adding the voice turns to the conversation.";
    case "paused":
      return "Voice conversation is paused.";
    case "error":
      return "Voice demo could not continue. Try the circular mic again.";
  }
}

function getPrimaryVoiceActionLabel(status: DemoVoiceStatus): string {
  if (status === "error") {
    return "Restart voice conversation";
  }

  if (status !== "idle") {
    return "Voice conversation active";
  }

  return "Start voice conversation";
}

function getDictationActionLabel(status: DemoDictationStatus): string {
  if (status === "listening") {
    return "Stop message dictation";
  }

  if (status === "transcribing") {
    return "Message is being transcribed";
  }

  if (status === "error") {
    return "Restart message dictation";
  }

  return "Start message dictation";
}

function getDictationStatusText(status: DemoDictationStatus): string {
  switch (status) {
    case "listening":
      return "Listening for message dictation";
    case "transcribing":
      return "Transcribing message dictation";
    case "error":
      return "Dictation could not continue. Try again.";
    default:
      return "";
  }
}

function getDemoPhaseLabel(stage: DemoConversationState["stage"]): string {
  switch (stage) {
    case "opening":
      return "Listening";
    case "initial_clarification":
      return "Clarifying";
    case "more_detail":
      return "More detail";
    case "understanding_summary":
      return "Checking understanding";
    case "added_complexity":
      return "Added context";
    case "people_involved":
      return "People involved";
    case "updated_summary":
      return "Confirming summary";
    case "completion_transition":
      return "Options ready";
    case "final_result":
      return "Summary ready";
    case "hijab_clarification":
      return "Clarifying";
    case "hijab_result":
      return "Understanding";
    case "hijab_reclarify":
      return "Clarifying";
    case "hijab_confirmed":
      return "Next Steps";
  }
}

function loadDemoConversation(initialMessage?: string): DemoConversationState {
  if (typeof window === "undefined") {
    return resetDemoConversation(initialMessage);
  }

  const raw = window.sessionStorage.getItem(DEMO_ASSISTANT_STORAGE_KEY);

  if (!raw) {
    return resetDemoConversation(initialMessage);
  }

  try {
    const parsed = JSON.parse(raw) as DemoConversationState;

    if (!Array.isArray(parsed.messages) || !parsed.stage) {
      return resetDemoConversation(initialMessage);
    }

    return {
      ...parsed,
      collectedAnswers: parsed.collectedAnswers ?? {},
      attachments: Array.isArray(parsed.attachments)
        ? parsed.attachments.map((attachment) => ({
            ...attachment,
            previewUrl: undefined,
          }))
        : [],
    };
  } catch {
    window.sessionStorage.removeItem(DEMO_ASSISTANT_STORAGE_KEY);
    return resetDemoConversation(initialMessage);
  }
}

function persistDemoConversation(state: DemoConversationState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    DEMO_ASSISTANT_STORAGE_KEY,
    JSON.stringify({
      ...state,
      attachments: state.attachments.map((attachment) => ({
        ...attachment,
        previewUrl: undefined,
      })),
    })
  );
}

function DemoVoiceSessionWaveform({
  isActive,
  level,
}: {
  isActive: boolean;
  level: number;
}) {
  const normalizedLevel = Math.max(0.16, Math.min(1, level));

  return (
    <div
      className="flex h-12 w-full max-w-[240px] items-center justify-center gap-1 overflow-hidden rounded-full bg-[#eef6ff] px-4"
      aria-hidden="true"
      data-testid="ai-conversation-voice-waveform"
    >
      {Array.from({ length: 24 }).map((_, index) => {
        const baseHeight = 8 + ((index * 7) % 22);
        const height = Math.round(baseHeight * (0.78 + normalizedLevel));

        return (
          <span
            key={index}
            className={`w-1 rounded-full bg-[#7aa4d8] ${
              isActive ? "motion-safe:animate-pulse" : ""
            }`}
            style={{
              height: `${height}px`,
              animationDelay: `${index * 42}ms`,
              opacity: 0.38 + (index % 6) * 0.08,
            }}
          />
        );
      })}
    </div>
  );
}

function getVoiceSessionAvatarState(status: DemoVoiceStatus): VoiceAvatarState {
  if (status === "listening") return "userSpeaking";
  if (status === "assistant-speaking") return "aiSpeaking";
  if (
    status === "starting" ||
    status === "processing-user" ||
    status === "finishing"
  ) {
    return "processing";
  }

  return "idle";
}

function DemoVoiceSessionStage({
  status,
  durationSeconds,
  turns,
  audioLevel,
  onFinishTurn,
  onFinishSession,
  onCancelSession,
  stageRef,
}: {
  status: DemoVoiceStatus;
  durationSeconds: number;
  turns: DemoVoiceTurn[];
  audioLevel: number;
  onFinishTurn: () => void;
  onFinishSession: () => void;
  onCancelSession: () => void;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const isListening = status === "listening";
  const isMoving =
    status === "starting" ||
    status === "listening" ||
    status === "processing-user" ||
    status === "assistant-speaking";
  const latestTurns = turns.slice(-2);

  return (
    <div
      ref={stageRef}
      tabIndex={-1}
      className="flex min-h-[340px] flex-1 flex-col items-center justify-center rounded-[16px] bg-[#f8fbff] px-4 py-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#0f5d9f] sm:min-h-[420px] sm:px-6"
      role="status"
      aria-live="polite"
      data-testid="ai-conversation-voice-session-stage"
    >
      <div className="flex flex-col items-center">
        <div data-testid="ai-conversation-voice-session-mic">
          <VoiceAvatarAnimation
            state={getVoiceSessionAvatarState(status)}
            size="session"
            alt="SafeSpeak voice conversation"
            showAmbientEffects
          />
        </div>
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0f5d9f]">
            Voice conversation
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[0] text-[#1f2a3a] sm:text-[30px]">
            {getVoiceStatusLabel(status)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#60718a]">
            {getVoiceStatusDescription(status, durationSeconds)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex w-full justify-center">
        <DemoVoiceSessionWaveform
          isActive={isMoving}
          level={status === "assistant-speaking" ? 0.78 : audioLevel}
        />
      </div>

      <p className="mt-4 max-w-[520px] text-xs leading-6 text-[#51657f]">
        {isListening
          ? "Speak naturally. Finish the current turn when you are ready for SafeSpeak to respond."
          : "This demo keeps audio local and uses deterministic mock responses."}
      </p>

      {latestTurns.length ? (
        <div
          className="mt-5 grid w-full max-w-[620px] gap-2 text-left"
          data-testid="ai-conversation-voice-session-preview"
        >
          {latestTurns.map((turn) => (
            <div
              key={turn.id}
              className={`rounded-[14px] border px-3 py-2 text-xs leading-5 ${
                turn.role === "user"
                  ? "ml-auto max-w-[86%] border-[#bfd8f1] bg-[#eef6ff] text-[#1f2a3a]"
                  : "mr-auto max-w-[86%] border-[#dbe6f2] bg-white text-[#41566f]"
              }`}
            >
              <span className="font-bold">
                {turn.role === "user" ? "You" : "SafeSpeak"}:
              </span>{" "}
              {turn.content}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {isListening ? (
          <button
            type="button"
            onClick={onFinishTurn}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0f5d9f] px-4 text-sm font-bold text-white transition hover:bg-[#0c518a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f5d9f] focus-visible:ring-offset-2"
            data-testid="ai-conversation-voice-finish-turn"
          >
            Finish turn
          </button>
        ) : null}
        <button
          type="button"
          onClick={onFinishSession}
          disabled={status === "processing-user" || status === "finishing"}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bfd8f1] bg-white px-4 text-sm font-bold text-[#0f5d9f] transition hover:bg-[#eef6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f5d9f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="ai-conversation-voice-finish-session"
        >
          Finish
        </button>
        <button
          type="button"
          onClick={onCancelSession}
          disabled={status === "processing-user" || status === "finishing"}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#dbe6f2] bg-white px-4 text-sm font-bold text-[#60718a] transition hover:bg-[#f4f7fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f5d9f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="ai-conversation-voice-cancel-session"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function LocalAssistantConversationPage({
  initialMessage,
  initialCategory,
}: {
  initialMessage?: string;
  initialCategory?: AssistantIncidentCategory;
}) {
  const router = useRouter();
  const initialMessageRef = useRef(initialMessage?.trim() ?? "");
  const triageHandoffInFlightRef = useRef(false);
  // Hydration-safe initial state: the lazy initializer runs during the
  // client's first (hydrating) render too, not just on mount, so reading
  // `sessionStorage` here (via `loadDemoConversation`) would return
  // different messages/suggestions than the server rendered (which always
  // sees `typeof window === "undefined"` and falls back to
  // `resetDemoConversation`) — a classic React hydration mismatch. Using
  // the same deterministic `resetDemoConversation` result for the initial
  // render on both sides, then restoring any saved session in an effect
  // below (client-only, post-hydration), keeps server and client HTML
  // identical on the first pass.
  const [demoState, setDemoState] = useState<DemoConversationState>(() =>
    resetDemoConversation(initialMessageRef.current)
  );
  const [composerValue, setComposerValue] = useState("");
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<DemoVoiceStatus>("idle");
  const [voiceSessionTurns, setVoiceSessionTurns] = useState<DemoVoiceTurn[]>(
    []
  );
  const [voiceAudioLevel, setVoiceAudioLevel] = useState(0.28);
  const [dictationStatus, setDictationStatus] =
    useState<DemoDictationStatus>("ready");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const voiceStageRef = useRef<HTMLDivElement | null>(null);
  const requestSequenceRef = useRef(0);
  const voiceTurnSequenceRef = useRef(0);
  const dictationSequenceRef = useRef(0);
  const timerRefs = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const intervalRefs = useRef<Array<ReturnType<typeof setInterval>>>([]);
  const voiceLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceDraftRef = useRef({
    stage: demoState.stage,
    collectedAnswers: demoState.collectedAnswers,
    finalResult: demoState.finalResult,
    understanding: demoState.understanding,
    progress: demoState.progress,
    readiness: demoState.readiness,
  });
  const previewUrlRefs = useRef<string[]>([]);
  const shouldRestoreComposerFocusRef = useRef(false);
  const shouldRestoreInputFocusRef = useRef(false);

  // Runs once, after hydration completes, so restoring a previously saved
  // conversation from sessionStorage never diverges from the server-rendered
  // (always-reset) HTML. See the `resetDemoConversation` note above.
  useEffect(() => {
    const restored = loadDemoConversation(initialMessageRef.current);
    setDemoState((current) =>
      restored.stage === current.stage &&
      restored.messages.length === current.messages.length
        ? current
        : restored
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.classList.add("assistant-conversation-lock");
    document.documentElement.classList.add("assistant-conversation-lock");

    return () => {
      document.body.classList.remove("assistant-conversation-lock");
      document.documentElement.classList.remove("assistant-conversation-lock");
    };
  }, []);

  const isComposerBusy =
    isAssistantTyping ||
    voiceStatus !== "idle";
  const isDictationBusy =
    dictationStatus === "listening" || dictationStatus === "transcribing";
  const hasProcessingAttachment = demoState.attachments.some(
    (attachment) => attachment.status === "processing"
  );
  const hasTypedMessage = Boolean(composerValue.trim());
  const canSend = hasTypedMessage && !isComposerBusy;
  const isPrimaryVoiceDisabled =
    isAssistantTyping ||
    voiceStatus !== "idle" ||
    isDictationBusy;
  const isDictationDisabled =
    isAssistantTyping ||
    voiceStatus !== "idle";
  const isVoiceSessionActive = voiceStatus !== "idle";
  const scheduleDemoTimeout = useCallback(
    (callback: () => void, delay: number) => {
      const timer = setTimeout(() => {
        timerRefs.current = timerRefs.current.filter((item) => item !== timer);
        callback();
      }, delay);

      timerRefs.current.push(timer);
      return timer;
    },
    []
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }, [
    demoState.messages,
    demoState.attachments,
    isAssistantTyping,
    voiceStatus,
  ]);

  useEffect(() => {
    if (shouldRestoreComposerFocusRef.current && voiceStatus === "idle") {
      shouldRestoreComposerFocusRef.current = false;
      composerInputRef.current?.focus();
    }
  }, [voiceStatus]);

  useEffect(() => {
    voiceDraftRef.current = {
      stage: demoState.stage,
      collectedAnswers: demoState.collectedAnswers,
      finalResult: demoState.finalResult,
      understanding: demoState.understanding,
      progress: demoState.progress,
      readiness: demoState.readiness,
    };
  }, [
    demoState.stage,
    demoState.collectedAnswers,
    demoState.finalResult,
    demoState.understanding,
    demoState.progress,
    demoState.readiness,
  ]);

  useEffect(() => {
    if (voiceStatus !== "idle") {
      voiceStageRef.current?.focus();
    }
  }, [voiceStatus]);

  useEffect(() => {
    if (
      shouldRestoreInputFocusRef.current &&
      dictationStatus === "ready"
    ) {
      shouldRestoreInputFocusRef.current = false;
      composerInputRef.current?.focus();
    }
  }, [dictationStatus]);

  useEffect(() => {
    persistDemoConversation(demoState);
  }, [demoState]);

  useEffect(() => {
    return () => {
      timerRefs.current.forEach(clearTimeout);
      intervalRefs.current.forEach(clearInterval);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (voiceLevelIntervalRef.current) {
        clearInterval(voiceLevelIntervalRef.current);
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      previewUrlRefs.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const clearDemoTimers = useCallback(() => {
    timerRefs.current.forEach(clearTimeout);
    intervalRefs.current.forEach(clearInterval);
    timerRefs.current = [];
    intervalRefs.current = [];
  }, []);

  const stopLocalVoiceActivity = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (voiceLevelIntervalRef.current) {
      clearInterval(voiceLevelIntervalRef.current);
      voiceLevelIntervalRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setVoiceAudioLevel(0.28);
  }, []);

  const stopDemoSpeech = useCallback(() => {
    speechUtteranceRef.current = null;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const startSimulatedVoiceLevel = useCallback(() => {
    if (voiceLevelIntervalRef.current) {
      clearInterval(voiceLevelIntervalRef.current);
    }

    const interval = setInterval(() => {
      setVoiceAudioLevel(0.24 + Math.random() * 0.58);
    }, 180);

    voiceLevelIntervalRef.current = interval;
  }, []);

  const startLocalVoiceActivity = useCallback(async () => {
    stopLocalVoiceActivity();

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window === "undefined" ||
      !window.AudioContext
    ) {
      startSimulatedVoiceLevel();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const audioContext = new window.AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(data);
        const average =
          data.reduce((total, value) => total + value, 0) / data.length;
        setVoiceAudioLevel(Math.max(0.18, Math.min(1, average / 96)));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch {
      startSimulatedVoiceLevel();
    }
  }, [startSimulatedVoiceLevel, stopLocalVoiceActivity]);

  const playDemoAssistantSpeech = useCallback(
    (content: string) =>
      new Promise<void>((resolve) => {
        const fallbackDelay = Math.min(2800, Math.max(900, content.length * 22));
        let settled = false;

        const finish = () => {
          if (settled) {
            return;
          }

          settled = true;
          speechUtteranceRef.current = null;
          resolve();
        };

        const fallbackTimer = scheduleDemoTimeout(finish, fallbackDelay);

        if (
          typeof window === "undefined" ||
          !("speechSynthesis" in window) ||
          typeof window.SpeechSynthesisUtterance === "undefined"
        ) {
          return;
        }

        try {
          window.speechSynthesis.cancel();
          const utterance = new window.SpeechSynthesisUtterance(content);
          speechUtteranceRef.current = utterance;
          utterance.rate = 0.95;
          utterance.pitch = 1;
          utterance.onend = () => {
            clearTimeout(fallbackTimer);
            finish();
          };
          utterance.onerror = () => {
            clearTimeout(fallbackTimer);
            finish();
          };
          window.speechSynthesis.speak(utterance);
        } catch {
          clearTimeout(fallbackTimer);
          scheduleDemoTimeout(finish, fallbackDelay);
        }
      }),
    [scheduleDemoTimeout]
  );

  const submitDemoMessage = useCallback(
    async (
      content: string,
      options: {
        suggestionMessageId?: string;
        allowWhileBusy?: boolean;
      } = {}
    ) => {
      const trimmed = content.trim();

      if (!trimmed || (isComposerBusy && !options.allowWhileBusy)) {
        return;
      }

      const requestId = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestId;
      const userMessage = createDemoMessage("user", trimmed);
      const stageAtSend = demoState.stage;

      setDemoError(null);
      setComposerValue("");
      setIsAssistantTyping(true);
      setDemoState((current) => ({
        ...current,
        messages: [
          ...current.messages.map((message) =>
            message.id === options.suggestionMessageId
              ? { ...message, suggestions: undefined }
              : message
          ),
          userMessage,
        ],
      }));

      try {
        const turn = await getDemoAssistantResponse({
          content: trimmed,
          stage: stageAtSend,
          collectedAnswers: demoState.collectedAnswers,
          understanding: demoState.understanding,
        });

        if (requestId !== requestSequenceRef.current) {
          return;
        }

        setDemoState((current) => ({
          ...current,
          messages: [...current.messages, turn.message],
          stage: turn.stage,
          collectedAnswers: turn.collectedAnswers,
          finalResult: turn.finalResult ?? current.finalResult,
          understanding: turn.understanding,
          progress: turn.progress,
          readiness: turn.readiness,
        }));
      } catch {
        setDemoError("SafeSpeak could not create a demo response. Try again.");
      } finally {
        if (requestId === requestSequenceRef.current) {
          setIsAssistantTyping(false);
        }
      }
    },
    [
      demoState.stage,
      demoState.collectedAnswers,
      demoState.understanding,
      isComposerBusy,
    ]
  );

  const handleContinueToTriage = useCallback(() => {
    if (triageHandoffInFlightRef.current) {
      return;
    }

    const understanding = demoState.understanding;

    if (!understanding) {
      setDemoError(
        "SafeSpeak could not prepare Triage from this demo conversation. Try again."
      );
      return;
    }

    triageHandoffInFlightRef.current = true;
    setDemoError(null);

    try {
      const conversation: AssistantConversationMessage[] = demoState.messages
        .filter((message) => message.role === "assistant" || message.role === "user")
        .map((message) => ({
          role: message.role as "assistant" | "user",
          content: message.content,
        }));

      const timeline: AssistantTimeline = {
        ...(demoState.collectedAnswers.initialConcern
          ? { initialConcern: demoState.collectedAnswers.initialConcern }
          : {}),
        ...(demoState.collectedAnswers.timingOrLocation
          ? { timingOrLocation: demoState.collectedAnswers.timingOrLocation }
          : {}),
        ...(demoState.collectedAnswers.details
          ? { details: demoState.collectedAnswers.details }
          : {}),
        ...(demoState.collectedAnswers.people
          ? { people: demoState.collectedAnswers.people }
          : {}),
        concernType: understanding.concernType,
        urgencyLevel: understanding.urgencyLevel,
        safetyStatus: understanding.safetyStatus,
        ...(understanding.biasIndicators.length
          ? {
              possibleBiasIndicators: understanding.biasIndicators
                .map(
                  (indicator) =>
                    `${indicator.label} (possible indicator, not a confirmed finding)`
                )
                .join("; "),
            }
          : {}),
      };

      saveAssistantTriageSource({
        conversation,
        timeline,
        incidentCategory: initialCategory,
      });

      router.push(getContinueReportSubmissionPath(initialCategory) as Route);
    } catch {
      triageHandoffInFlightRef.current = false;
      setDemoError(
        "SafeSpeak could not prepare Triage from this demo conversation. Try again."
      );
    }
  }, [demoState, initialCategory, router]);

  const handleSuggestionClick = (
    suggestion: DemoSuggestion,
    messageId: string
  ) => {
    if (
      suggestion.id === HIJAB_CONFIRM_TRIAGE_SUGGESTION_ID ||
      suggestion.id === CONTINUE_TO_TRIAGE_SUGGESTION_ID
    ) {
      handleContinueToTriage();
      return;
    }

    void submitDemoMessage(suggestion.value, {
      suggestionMessageId: messageId,
    });
  };

  const handleSendTypedResponse = () => {
    void submitDemoMessage(composerValue);
  };

  const startVoiceDemo = () => {
    if (isAssistantTyping || voiceStatus !== "idle" || isDictationBusy) {
      return;
    }

    voiceTurnSequenceRef.current += 1;
    voiceDraftRef.current = {
      stage: demoState.stage,
      collectedAnswers: demoState.collectedAnswers,
      finalResult: demoState.finalResult,
      understanding: demoState.understanding,
      progress: demoState.progress,
      readiness: demoState.readiness,
    };
    setDemoError(null);
    setVoiceSessionTurns([]);
    setVoiceAudioLevel(0.28);
    setRecordingSeconds(0);
    setVoiceStatus("starting");

    intervalRefs.current.forEach(clearInterval);
    intervalRefs.current = [];
    const interval = setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    intervalRefs.current.push(interval);
    void startLocalVoiceActivity();
    scheduleDemoTimeout(() => {
      setVoiceStatus((current) =>
        current === "starting" ? "listening" : current
      );
    }, 360);
  };

  const handlePrimaryVoiceAction = () => {
    startVoiceDemo();
  };

  const finishVoiceTurn = async () => {
    if (voiceStatus !== "listening") {
      return;
    }

    const voiceRequestId = voiceTurnSequenceRef.current;
    stopLocalVoiceActivity();
    setVoiceStatus("processing-user");

    try {
      const transcript = await simulateDemoTranscription();
      if (voiceRequestId !== voiceTurnSequenceRef.current) {
        return;
      }

      const userTurn: DemoVoiceTurn = {
        id: `demo-voice-turn-user-${Date.now()}`,
        role: "user",
        content: transcript,
        createdAt: new Date().toISOString(),
      };
      setVoiceSessionTurns((current) => [...current, userTurn]);

      const response = await getDemoAssistantResponse({
        content: transcript,
        stage: voiceDraftRef.current.stage,
        collectedAnswers: voiceDraftRef.current.collectedAnswers,
        understanding: voiceDraftRef.current.understanding,
      });

      if (voiceRequestId !== voiceTurnSequenceRef.current) {
        return;
      }

      const assistantTurn: DemoVoiceTurn = {
        id: `demo-voice-turn-assistant-${Date.now()}`,
        role: "assistant",
        content: response.message.content,
        createdAt: response.message.createdAt,
        blocks: response.message.blocks,
        suggestions: response.message.suggestions,
      };

      voiceDraftRef.current = {
        stage: response.stage,
        collectedAnswers: response.collectedAnswers,
        finalResult: response.finalResult,
        understanding: response.understanding,
        progress: response.progress,
        readiness: response.readiness,
      };
      setVoiceSessionTurns((current) => [...current, assistantTurn]);
      setVoiceStatus("assistant-speaking");
      await playDemoAssistantSpeech(response.message.content);

      if (voiceRequestId !== voiceTurnSequenceRef.current) {
        return;
      }

      setVoiceStatus("listening");
      void startLocalVoiceActivity();
    } catch {
      stopLocalVoiceActivity();
      stopDemoSpeech();
      setDemoError("Demo voice conversation could not continue.");
      setVoiceStatus("error");
    }
  };

  const finishVoiceSession = () => {
    if (voiceStatus === "processing-user" || voiceStatus === "finishing") {
      return;
    }

    voiceTurnSequenceRef.current += 1;
    stopLocalVoiceActivity();
    stopDemoSpeech();
    intervalRefs.current.forEach(clearInterval);
    intervalRefs.current = [];
    setVoiceStatus("finishing");

    const completedTurns = voiceSessionTurns;

    if (completedTurns.length) {
      setDemoState((current) => ({
        ...current,
        messages: [
          ...current.messages,
          ...completedTurns.map((turn) =>
            createDemoMessage(turn.role, turn.content, {
              blocks: turn.blocks,
              suggestions: turn.suggestions,
            })
          ),
        ],
        stage: voiceDraftRef.current.stage,
        collectedAnswers: voiceDraftRef.current.collectedAnswers,
        finalResult: voiceDraftRef.current.finalResult,
        understanding: voiceDraftRef.current.understanding,
        progress: voiceDraftRef.current.progress,
        readiness: voiceDraftRef.current.readiness,
      }));
    }

    scheduleDemoTimeout(() => {
      setVoiceSessionTurns([]);
      setRecordingSeconds(0);
      setVoiceStatus("idle");
      shouldRestoreComposerFocusRef.current = true;
    }, 260);
  };

  const cancelVoiceSession = () => {
    voiceTurnSequenceRef.current += 1;
    stopLocalVoiceActivity();
    stopDemoSpeech();
    intervalRefs.current.forEach(clearInterval);
    intervalRefs.current = [];
    setVoiceSessionTurns([]);
    setRecordingSeconds(0);
    setVoiceStatus("idle");
    shouldRestoreComposerFocusRef.current = true;
  };

  const startMessageDictation = () => {
    if (isDictationDisabled || dictationStatus === "transcribing") {
      return;
    }

    dictationSequenceRef.current += 1;
    setDemoError(null);
    setDictationStatus("listening");
  };

  const stopMessageDictation = async () => {
    if (dictationStatus !== "listening") {
      return;
    }

    const dictationRequestId = dictationSequenceRef.current;
    setDictationStatus("transcribing");

    try {
      const transcript = await simulateDemoDictation();

      if (dictationRequestId !== dictationSequenceRef.current) {
        return;
      }

      setComposerValue((current) => {
        const trimmed = current.trim();
        return trimmed ? `${current.trimEnd()} ${transcript}` : transcript;
      });
      shouldRestoreInputFocusRef.current = true;
      setDictationStatus("ready");
    } catch {
      setDictationStatus("error");
    }
  };

  const cancelMessageDictation = () => {
    dictationSequenceRef.current += 1;
    setDictationStatus("ready");
  };

  const handleMessageDictationAction = () => {
    if (dictationStatus === "listening") {
      void stopMessageDictation();
      return;
    }

    startMessageDictation();
  };

  const handleAttachmentSelected = async (file?: File) => {
    if (!file || isVoiceSessionActive) {
      return;
    }

    const attachmentId = `demo-attachment-${Date.now()}`;
    const canPreview = file.type.startsWith("image/");
    const previewUrl = canPreview ? URL.createObjectURL(file) : undefined;

    if (previewUrl) {
      previewUrlRefs.current.push(previewUrl);
    }

    const attachment: DemoAttachment = {
      id: attachmentId,
      name: file.name,
      type: file.type || "Unknown type",
      size: file.size,
      status: "processing",
      progress: 4,
      previewUrl,
      message: "Processing preview",
    };
    const attachmentMessage = createDemoMessage(
      "user",
      `Attached locally: ${file.name}`,
      { attachmentId }
    );

    setDemoError(null);
    setDemoState((current) => ({
      ...current,
      attachments: [...current.attachments, attachment],
      messages: [...current.messages, attachmentMessage],
    }));

    const result = await simulateDemoAttachmentProcessing(file, (progress) => {
      setDemoState((current) => ({
        ...current,
        attachments: current.attachments.map((item) =>
          item.id === attachmentId ? { ...item, progress } : item
        ),
      }));
    });

    setDemoState((current) => ({
      ...current,
      attachments: current.attachments.map((item) =>
        item.id === attachmentId ? { ...item, ...result } : item
      ),
    }));

    if (result.status === "ready") {
      void submitDemoMessage(
        `I attached ${file.name} for the demo conversation.`,
        {
          allowWhileBusy: true,
        }
      );
    } else {
      setDemoError(
        result.message ?? "This file could not be used in the demo."
      );
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (attachmentId: string) => {
    const attachment = demoState.attachments.find(
      (item) => item.id === attachmentId
    );

    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
      previewUrlRefs.current = previewUrlRefs.current.filter(
        (url) => url !== attachment.previewUrl
      );
    }

    setDemoState((current) => ({
      ...current,
      attachments: current.attachments.filter(
        (item) => item.id !== attachmentId
      ),
      messages: [
        ...current.messages,
        createDemoMessage(
          "system",
          "Attachment removed from this demo session."
        ),
      ],
    }));
  };

  const handleResetConversation = () => {
    clearDemoTimers();
    stopLocalVoiceActivity();
    stopDemoSpeech();
    previewUrlRefs.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlRefs.current = [];
    requestSequenceRef.current += 1;
    voiceTurnSequenceRef.current += 1;
    dictationSequenceRef.current += 1;
    setDemoState(resetDemoConversation(initialMessageRef.current));
    setComposerValue("");
    setIsAssistantTyping(false);
    setVoiceStatus("idle");
    setVoiceSessionTurns([]);
    setVoiceAudioLevel(0.28);
    setDictationStatus("ready");
    setRecordingSeconds(0);
    setDemoError(null);
    setIsResetDialogOpen(false);

    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DEMO_ASSISTANT_STORAGE_KEY);
    }
  };

  return (
    <main
      data-testid="ai-conversation-page"
      className="assistant-demo-conversation-page flex min-h-0 flex-1 flex-col px-2 pb-3 pt-2 sm:px-4 sm:pb-5 sm:pt-4"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#d9e2ee] px-1 py-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0f5d9f]">
            Demo conversation
          </p>
          <button
            type="button"
            onClick={() => setIsResetDialogOpen(true)}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#d7e1ee] bg-white px-3 text-xs font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
          >
            <IconRefresh size={13} />
            Reset Conversation
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 py-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section
            aria-labelledby="local-conversation-title"
            className="flex min-h-0 flex-col overflow-y-auto overflow-x-hidden rounded-[18px] border border-[#dbe5f1] bg-[#f8fbff] shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
          >
            <header className="bg-white/82 border-b border-[#dbe6f2] px-4 py-4 sm:px-5">
              <div className="max-w-4xl">
                <h1
                  id="local-conversation-title"
                  className="text-2xl font-extrabold leading-tight text-[#1f2a3a] sm:text-[28px]"
                >
                  Tell your story
                </h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#60718a]">
                  Speak, type, or attach something locally. SafeSpeak will
                  simulate a calm multi-turn conversation for this frontend
                  demo.
                </p>
              </div>
            </header>

            <div className="conversation-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              {isVoiceSessionActive ? (
                <DemoVoiceSessionStage
                  status={voiceStatus}
                  durationSeconds={recordingSeconds}
                  turns={voiceSessionTurns}
                  audioLevel={voiceAudioLevel}
                  onFinishTurn={() => {
                    void finishVoiceTurn();
                  }}
                  onFinishSession={finishVoiceSession}
                  onCancelSession={cancelVoiceSession}
                  stageRef={voiceStageRef}
                />
              ) : (
                <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4">
                  {demoState.messages.map((message) => (
                    <DemoMessageItem
                      key={message.id}
                      message={message}
                      attachment={demoState.attachments.find(
                        (item) => item.id === message.attachmentId
                      )}
                      onRemoveAttachment={removeAttachment}
                      onSuggestionClick={handleSuggestionClick}
                    />
                  ))}

                  {isAssistantTyping ? <DemoTypingIndicator /> : null}

                  {hasProcessingAttachment ? (
                    <DemoStatusBubble
                      icon={<IconLoader2 size={13} className="animate-spin" />}
                      label="Processing local attachment preview..."
                    />
                  ) : null}

                  {demoError ? (
                    <div
                      className="inline-flex w-fit max-w-[540px] items-center gap-2 rounded-[14px] border border-[#fde2e2] bg-[#fff5f5] px-4 py-2.5 text-xs font-semibold text-[#b45353]"
                      role="status"
                    >
                      <IconAlertCircle size={14} />
                      {demoError}
                    </div>
                  ) : null}

                  <div ref={messagesEndRef} aria-hidden="true" />
                </div>
              )}
            </div>

            <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSendTypedResponse();
                }}
                className="border-t border-[#dbe6f2] bg-white/90 px-3 py-3 sm:px-5"
              >
                {demoState.attachments.length ? (
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {demoState.attachments.map((attachment) => (
                      <DemoAttachmentChip
                        key={attachment.id}
                        attachment={attachment}
                        onRemove={() => removeAttachment(attachment.id)}
                      />
                    ))}
                  </div>
                ) : null}

                <AssistantVoiceFirstInput
                  value={composerValue}
                  onChange={setComposerValue}
                  inputRef={composerInputRef}
                  inputTestId="ai-conversation-input"
                  placeholder="Type your response..."
                  inputLabel="Message SafeSpeak"
                  disabled={isComposerBusy}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSendTypedResponse();
                    }
                  }}
                  onDictationClick={handleMessageDictationAction}
                  dictationDisabled={
                    isDictationDisabled || dictationStatus === "transcribing"
                  }
                  dictationLabel={getDictationActionLabel(dictationStatus)}
                  dictationTestId="ai-conversation-dictation"
                  onVoiceFirstClick={handlePrimaryVoiceAction}
                  voiceFirstDisabled={isPrimaryVoiceDisabled}
                  voiceFirstLabel={getPrimaryVoiceActionLabel(voiceStatus)}
                  voiceTestId="ai-conversation-composer-voice"
                  sendLabel="Send demo message"
                  sendTestId="ai-conversation-send"
                  showSendButton={hasTypedMessage}
                  sendDisabled={!canSend}
                  isProcessing={isAssistantTyping}
                  captureState={
                    dictationStatus === "listening"
                      ? "listening"
                      : dictationStatus === "transcribing"
                        ? "review"
                        : "idle"
                  }
                  captureLabel={
                    dictationStatus === "listening"
                      ? "Listening..."
                      : "Transcribing..."
                  }
                  captureConfirmDisabled={dictationStatus !== "listening"}
                  cancelLabel="Cancel dictation"
                  confirmLabel="Stop message dictation"
                  onCancelCapture={cancelMessageDictation}
                  onConfirmCapture={() => {
                    void stopMessageDictation();
                  }}
                  leadingAction={
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isVoiceSessionActive}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#64748b] transition hover:bg-[#f4f7fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f5d9f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Attach a local file for this demo"
                    >
                      <IconPaperclip size={18} />
                    </button>
                  }
                  error={
                    dictationStatus === "error"
                      ? getDictationStatusText(dictationStatus)
                      : null
                  }
                />
                <p className="mt-2 text-center text-[11px] leading-5 text-[#60718a]">
                  Demo only. Nothing is uploaded, transcribed, spoken,
                  submitted, or shared with a production service.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                  onChange={(event) => {
                    void handleAttachmentSelected(event.target.files?.[0]);
                  }}
                />
              </form>
          </section>

          <aside className="min-w-0">
            <section className="rounded-[18px] border border-[#dce4ef] bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-[#1f2a3a]">
                    What SafeSpeak has understood
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-[#60718a]">
                    {demoState.understanding
                      ? `${demoState.understanding.summary} Nothing has been sent.`
                      : "Local demo summary. Nothing has been sent."}
                  </p>
                </div>
                <span className="rounded-full bg-[#e7f1fb] px-3 py-1.5 text-xs font-bold text-[#0f5d9f]">
                  {getDemoPhaseLabel(demoState.stage)}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <DemoProgressMetric
                  label="Conversation"
                  value={demoState.progress}
                />
                <DemoProgressMetric
                  label="Report readiness"
                  value={demoState.readiness}
                />
                <div className="rounded-[14px] border border-[#dbe5f0] bg-[#f8fbff] p-3 text-xs leading-5 text-[#60718a]">
                  Messages: {demoState.messages.length}
                  <span className="block">
                    Attachments: {demoState.attachments.length} local item
                    {demoState.attachments.length === 1 ? "" : "s"}
                  </span>
                  <span className="block">
                    Status: {isAssistantTyping ? "SafeSpeak typing" : "Ready"}
                  </span>
                </div>
                {demoState.understanding ? (
                  <div
                    data-testid="ai-conversation-understanding-summary"
                    className="rounded-[14px] border border-[#dbe5f0] bg-[#f8fbff] p-3 text-xs leading-5 text-[#60718a]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#1f2a3a]">
                        {demoState.understanding.concernType}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em] ${
                          demoState.understanding.urgencyLevel === "high"
                            ? "bg-[#fde2e2] text-[#b42323]"
                            : demoState.understanding.urgencyLevel === "medium"
                              ? "bg-[#fff1da] text-[#9a5b12]"
                              : "bg-[#e7f1fb] text-[#0f5d9f]"
                        }`}
                      >
                        {demoState.understanding.urgencyLevel} urgency
                      </span>
                    </div>
                    {demoState.understanding.biasIndicators.length ? (
                      <ul className="mt-2 flex flex-col gap-1">
                        {demoState.understanding.biasIndicators.map(
                          (indicator) => (
                            <li key={indicator.id}>
                              - {indicator.label} (possible indicator, not a
                              confirmed finding)
                            </li>
                          )
                        )}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-[14px] border border-[#f2d8b0] bg-[#fffaf2] px-3 py-3 text-xs leading-5 text-[#9a5b12]">
                This panel is informational for the demo. It does not classify,
                report, or contact a service.
              </div>
            </section>
          </aside>
        </div>
      </div>

      {isResetDialogOpen ? (
        <div
          className="fixed inset-0 z-[140] grid place-items-center bg-[#0b1725]/50 p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-conversation-title"
            className="w-full max-w-md rounded-[20px] border border-[#dbe6f2] bg-white p-5 text-[#1f2a3a] shadow-[0_20px_48px_rgba(15,23,42,0.24)]"
          >
            <h2
              id="reset-conversation-title"
              className="text-lg font-extrabold"
            >
              Reset Conversation?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#60718a]">
              This clears the demo messages, local attachments, voice state,
              progress, and session storage for this conversation only.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsResetDialogOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#dbe5f0] bg-white px-4 text-sm font-bold text-[#334155]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetConversation}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0f5d9f] px-4 text-sm font-bold text-white"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function DemoProgressMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-[#60718a]">{label}</span>
        <span className="font-bold text-[#0f5d9f]">{value}%</span>
      </div>
      <div
        className="mt-1 h-2 rounded-full bg-[#dbe6f2]"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div
          className="h-full rounded-full bg-[#0f5d9f] transition-all duration-200"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function DemoMessageItem({
  message,
  attachment,
  onRemoveAttachment,
  onSuggestionClick,
}: {
  message: DemoConversationMessage;
  attachment?: DemoAttachment;
  onRemoveAttachment: (attachmentId: string) => void;
  onSuggestionClick: (suggestion: DemoSuggestion, messageId: string) => void;
}) {
  if (message.role === "system") {
    return (
      <div
        data-testid="ai-conversation-message-system"
        className="mx-auto inline-flex max-w-[680px] items-center rounded-full border border-[#dbe5f0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#60718a]"
      >
        {message.content}
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div
      data-testid={`ai-conversation-message-${message.role}`}
      className={`motion-safe:duration-200 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 ${
        isUser ? "flex justify-end" : "flex justify-start"
      }`}
    >
      <div
        className={`flex max-w-[min(92%,680px)] gap-3 ${isUser ? "flex-row-reverse" : ""}`}
      >
        {!isUser ? (
          <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-[#e7f1fb] text-xs font-extrabold text-[#0f5d9f]">
            SS
          </span>
        ) : null}
        <div className={isUser ? "items-end" : "items-start"}>
          {isUser || message.content ? (
            <div
              className={`rounded-[18px] px-4 py-3 text-sm leading-6 shadow-[0_8px_22px_rgba(148,163,184,0.12)] ${
                isUser
                  ? "rounded-tr-[8px] bg-[#0f5d9f] text-white"
                  : "rounded-tl-[8px] bg-white text-[#41566f]"
              }`}
            >
              {isUser ? (
                message.content
              ) : (
                <AssistantMessageRenderer content={message.content} />
              )}
            </div>
          ) : null}
          {!isUser && message.blocks?.length ? (
            <div
              className={`flex flex-col gap-3 ${message.content ? "mt-3" : ""}`}
            >
              {message.blocks.map((block, index) => (
                <DemoMessageBlockRenderer
                  key={`${message.id}-block-${index}`}
                  block={block}
                />
              ))}
            </div>
          ) : null}
          {attachment ? (
            <div className="mt-2">
              <DemoAttachmentCard
                attachment={attachment}
                onRemove={() => onRemoveAttachment(attachment.id)}
              />
            </div>
          ) : null}
          {!isUser && message.suggestions?.length ? (
            <div
              className="mt-2 flex flex-wrap gap-2"
              aria-label="Suggested responses"
            >
              {message.suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => onSuggestionClick(suggestion, message.id)}
                  className="inline-flex min-h-9 items-center rounded-full border border-[#d7e1ee] bg-white px-3 text-xs font-bold text-[#334155] transition hover:border-[#bfd1e6] hover:bg-[#f8fbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f5d9f]"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DemoMessageBlockRenderer({ block }: { block: DemoMessageBlock }) {
  switch (block.kind) {
    case "safety_alert":
      return <DemoSafetyAlertBlock alert={block.alert} />;
    case "explanation":
      return <DemoExplanationBlock explanation={block.explanation} />;
    case "next_steps":
      return <DemoNextStepsBlock group={block.group} />;
    case "service_options":
      return <DemoServiceOptionsBlock services={block.services} />;
    default:
      return null;
  }
}

function DemoSafetyAlertBlock({ alert }: { alert: DemoEmergencyAlert }) {
  return (
    <div
      role="alert"
      data-testid="ai-conversation-safety-alert"
      className="w-full max-w-[600px] rounded-[18px] border border-[#f7c9c9] bg-[#fff5f5] p-4 shadow-[0_8px_22px_rgba(148,163,184,0.12)]"
    >
      <div className="flex items-center gap-2 text-sm font-extrabold text-[#b42323]">
        <IconAlertCircle size={16} />
        {alert.heading}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#7a2b2b]">{alert.body}</p>
      {alert.actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {alert.actions.map((action) => (
            <a
              key={action.id}
              href={`tel:${action.value}`}
              className={
                action.id === "call-emergency"
                  ? "inline-flex h-11 max-w-full items-center gap-2 whitespace-nowrap rounded-full bg-[#de3838] px-4 text-[11px] font-bold text-white"
                  : "inline-flex h-11 items-center rounded-full bg-[#0f5d9f] px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-white"
              }
            >
              {action.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DemoExplanationBlock({
  explanation,
}: {
  explanation: DemoExplanation;
}) {
  return (
    <div
      data-testid="ai-conversation-explanation"
      className="w-full max-w-[600px] rounded-[14px] border border-[#dbe5f0] bg-[#f8fbff] p-4"
    >
      <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#0f5d9f]">
        {explanation.heading}
      </p>
      <p className="mt-2 text-sm leading-6 text-[#41566f]">
        {explanation.body}
      </p>
    </div>
  );
}

function DemoNextStepsBlock({ group }: { group: DemoNextStepGroup }) {
  return (
    <div
      data-testid="ai-conversation-next-steps"
      className="w-full max-w-[600px] rounded-[14px] border border-[#dbe5f0] bg-white p-4 shadow-[0_6px_18px_rgba(148,163,184,0.12)]"
    >
      <p className="text-sm font-extrabold text-[#1f2a3a]">{group.heading}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {group.steps.map((step) => (
          <li key={step.id} className="rounded-[10px] bg-[#f8fbff] p-3">
            <p className="text-xs font-bold text-[#1f2a3a]">{step.label}</p>
            <p className="mt-1 text-xs leading-5 text-[#60718a]">
              {step.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DemoServiceOptionsBlock({
  services,
}: {
  services: DemoServiceOption[];
}) {
  if (!services.length) {
    return null;
  }

  return (
    <div
      data-testid="ai-conversation-service-options"
      className="flex w-full max-w-[600px] flex-col gap-2"
    >
      {services.map((service) => (
        <article
          key={service.id}
          className="rounded-[14px] border border-[#dbe5f0] bg-white p-3 shadow-[0_6px_18px_rgba(148,163,184,0.12)]"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold text-[#1f2a3a]">
                {service.name}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#60718a]">
                {service.category}
              </p>
            </div>
            {typeof service.matchScore === "number" ? (
              <span className="shrink-0 rounded-full bg-[#e7f1fb] px-2 py-1 text-[10px] font-bold text-[#0f5d9f]">
                {service.matchScore}% match
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#41566f]">
            {service.description}
          </p>
          {service.whyRelevant ? (
            <p className="mt-2 text-[11px] leading-5 text-[#60718a]">
              <span className="font-bold text-[#334155]">
                Why this may help:{" "}
              </span>
              {service.whyRelevant}
            </p>
          ) : null}
          {service.howSelected ? (
            <p className="mt-1 text-[11px] leading-5 text-[#8896ab]">
              {service.howSelected}
            </p>
          ) : null}
          {service.contactValue ? (
            <p className="mt-2 text-[11px] font-bold text-[#0f5d9f]">
              {service.contactLabel ?? "Contact"}: {service.contactValue}
            </p>
          ) : null}
          {service.website ? (
            <a
              href={
                service.website.startsWith("http")
                  ? service.website
                  : `https://${service.website}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-[11px] font-bold text-[#0f5d9f] underline"
            >
              {service.website}
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function DemoAttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: DemoAttachment;
  onRemove: () => void;
}) {
  return (
    <article className="w-full max-w-[360px] rounded-[14px] border border-[#dbe5f0] bg-white p-3 text-[#1f2a3a] shadow-[0_6px_18px_rgba(148,163,184,0.12)]">
      <div className="flex gap-3">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#f8fbff] text-[#0f5d9f] ring-1 ring-[#dbe5f0]">
          {attachment.previewUrl ? (
            <Image
              src={attachment.previewUrl}
              alt=""
              width={56}
              height={56}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : attachment.type.startsWith("image/") ? (
            <IconPhoto size={20} />
          ) : (
            <IconFileText size={20} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-extrabold text-[#1f2a3a]">
            {attachment.name}
          </p>
          <p className="mt-0.5 text-[11px] text-[#60718a]">
            {attachment.type || "Unknown type"} -{" "}
            {formatLocalFileSize(attachment.size)}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-[#e5edf6]">
            <div
              className={`h-full rounded-full ${
                attachment.status === "error" ? "bg-[#de3838]" : "bg-[#0f5d9f]"
              } transition-all duration-200`}
              style={{ width: `${attachment.progress}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] font-semibold text-[#60718a]">
            {attachment.message ??
              (attachment.status === "processing"
                ? "Processing preview"
                : "Available in this demo session")}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="grid size-7 shrink-0 place-items-center rounded-full text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#475569]"
          aria-label={`Remove ${attachment.name}`}
        >
          <IconX size={14} />
        </button>
      </div>
    </article>
  );
}

function DemoAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: DemoAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-w-[220px] max-w-[300px] items-center gap-2 rounded-[12px] border border-[#dbe5f0] bg-[#f8fbff] px-3 py-2 text-xs">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[#0f5d9f]">
        {attachment.previewUrl ? (
          <IconPhoto size={15} />
        ) : (
          <IconFileText size={15} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-[#1f2a3a]">
          {attachment.name}
        </span>
        <span className="block text-[10px] text-[#60718a]">
          {attachment.status === "processing"
            ? `${attachment.progress}% processing`
            : attachment.status === "ready"
              ? "Ready for this demo"
              : "Needs attention"}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[#60718a] hover:text-[#1f2a3a]"
        aria-label={`Remove ${attachment.name}`}
      >
        <IconX size={13} />
      </button>
    </div>
  );
}

function DemoTypingIndicator() {
  return (
    <div
      className="inline-flex w-fit items-center gap-2 rounded-[18px] rounded-tl-[8px] bg-white px-3 py-2 text-xs font-semibold text-[#60718a] shadow-[0_8px_22px_rgba(148,163,184,0.12)]"
      role="status"
      aria-live="polite"
    >
      SafeSpeak is typing
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="size-1.5 animate-bounce rounded-full bg-[#9fb3cb] [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[#9fb3cb] [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[#9fb3cb] [animation-delay:300ms]" />
      </span>
    </div>
  );
}

function DemoStatusBubble({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div
      className="inline-flex w-fit max-w-[540px] items-center gap-2 rounded-[16px] bg-white px-4 py-2.5 text-xs font-semibold text-[#5f6f86] shadow-[0_8px_22px_rgba(148,163,184,0.12)]"
      role="status"
      aria-live="polite"
    >
      {icon}
      {label}
    </div>
  );
}

// Retained for reference while Step 3 uses the frontend-only conversation.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacySafeSpeakAssistantConversationPage({
  initialMessage,
  initialPrefillMessage,
  initialCategory,
  initialTopic,
  startVoiceMode = false,
}: {
  initialMessage?: string;
  initialPrefillMessage?: string;
  initialCategory?: AssistantIncidentCategory;
  initialTopic?: DashboardCardFlowId;
  startVoiceMode?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  type ConversationUiMessage = AssistantConversationMessage & {
    messageId?: string;
    turnNumber?: number;
    responseMeta?: {
      disclaimer?: string;
      citations?: ConversationCitation[];
      confidence?: string;
      intent?: string;
      triageReady?: boolean;
      nextAction?: string;
      conversationSessionId?: string;
      selectedResponseSource?: string;
      responseSource?: string;
      model?: string;
      ragStatus?: string;
      showSources?: boolean;
      sourceDisplayReason?:
        | "legal_lookup"
        | "explicit_citation_request"
        | "hidden_support_reply"
        | "triage_handoff"
        | "not_directly_grounded";
      reviewStatus?: string;
      ragUnavailable?: boolean;
      assistantLanguage?: string;
      pendingHumanReview?: boolean;
      legalAwareness?: LegalAwareness;
      groundedLegalSource?: {
        sourceId: string;
        title?: string;
        legislationName?: string;
        citationUrl?: string;
      };
      assistantFormatPreference?: "paragraphs" | "bullets" | "mix";
      formatPreferenceUpdated?: boolean;
      subIntent?: string;
      encodingWarning?: boolean;
    };
  };
  const seededMessage = initialMessage?.trim();
  const seededPrefillMessage = initialPrefillMessage?.trim();
  const starterAssistantPrompts = [
    t("dashboard.assistant.conversation.botPromptWho"),
    "I'm helping you structure your report.",
    "Te ayudo a estructurar tu reporte.",
  ];
  const storedDraft = getAssistantConversationDraft({
    topic: initialTopic,
    incidentCategory: initialCategory,
  });
  const shouldIgnoreStoredDraft = Boolean(seededMessage);
  const existingDraft = shouldIgnoreStoredDraft ? null : storedDraft;
  const shouldRestoreVoiceMode = Boolean(
    startVoiceMode && existingDraft?.voiceSessionActive
  );
  const shouldAutoStartVoiceMode =
    shouldRestoreVoiceMode || (!existingDraft && startVoiceMode);
  const initialDraftMessages =
    existingDraft?.messages.filter(
      (message, index) =>
        !(
          index === 0 &&
          message.role === "assistant" &&
          starterAssistantPrompts.includes(message.content.trim())
        )
    ) ?? [];
  const initialConversationMessages: ConversationUiMessage[] =
    initialDraftMessages && initialDraftMessages.length > 0
      ? initialDraftMessages
      : ([
          seededMessage
            ? {
                role: "user" as const,
                content: seededMessage,
              }
            : null,
        ].filter(Boolean) as AssistantConversationMessage[]);
  const [input, setInput] = useState(seededPrefillMessage ?? "");
  const [conversationSessionId, setConversationSessionId] = useState<
    string | null
  >(existingDraft?.conversationSessionId ?? null);
  const [timeline, setTimeline] = useState<AssistantTimeline>(
    existingDraft?.timeline ?? emptyTimeline
  );
  const [messages, setMessages] = useState<ConversationUiMessage[]>(
    () => initialConversationMessages
  );
  const [isSending, setIsSending] = useState(
    Boolean(seededMessage) && !existingDraft
  );
  const [error, setError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(
    shouldRestoreVoiceMode
  );
  const [isVoiceSessionMuted, setIsVoiceSessionMuted] = useState(false);
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechPlaybackError, setSpeechPlaybackError] = useState<string | null>(
    null
  );
  const [replayVoiceText, setReplayVoiceText] = useState<string | null>(null);
  const [replayVoiceLanguage, setReplayVoiceLanguage] = useState<
    string | undefined
  >(undefined);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceAvatarState, setVoiceAvatarState] =
    useState<VoiceAvatarState>("idle");
  const [activeVoiceCaptureTarget, setActiveVoiceCaptureTarget] =
    useState<VoiceCaptureTarget | null>(null);
  const [pendingVoiceReviewBlob, setPendingVoiceReviewBlob] =
    useState<Blob | null>(null);
  const {
    pendingConsentRequirement,
    isGrantingConsent,
    captureConsentError,
    clearPendingConsent,
    grantPendingConsent,
  } = useConsentGate();
  const hasSentInitialRef = useRef(false);
  const hasStartedInitialVoiceModeRef = useRef(false);
  const latestMessagesRef = useRef(messages);
  const latestRequestIdRef = useRef(0);
  const latestAssistantTurnRef = useRef(
    Math.max(
      0,
      ...messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.turnNumber ?? 0)
    )
  );
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pendingAssistantRequestRef = useRef<{
    message: string;
    conversation: AssistantConversationMessage[];
    speakResponse?: boolean;
    continueVoiceSession?: boolean;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const shouldProcessRecordingRef = useRef(false);
  const voiceSessionActiveRef = useRef(false);
  const shouldContinueAfterPlaybackRef = useRef(false);
  const autoStopRecordingTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const restartListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const speechErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const speechPlaybackWatchdogRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const startVoiceRecordingRef = useRef<() => Promise<boolean>>(
    async () => false
  );
  const hasHandledPendingVoiceHandoffRef = useRef(false);
  const liveRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveFinalTranscriptRef = useRef("");
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechAudioUrlRef = useRef<string | null>(null);
  const speechPlaybackActiveRef = useRef(false);
  const pendingSpeechRevealRef = useRef<(() => void) | null>(null);
  const recordingDecisionRef = useRef<"confirm" | "cancel" | null>(null);
  const [timelineFieldOrder, setTimelineFieldOrder] = useState<string[]>(
    existingDraft?.timelineFieldOrder ?? []
  );
  const [showTriageCta, setShowTriageCta] = useState(
    Boolean(existingDraft?.triageCtaVisible)
  );
  const continueReportSubmissionPath = getContinueReportSubmissionPath(
    initialCategory,
    conversationSessionId ?? undefined
  );
  const assistantEntryHref = getAssistantEntryHref(
    initialTopic,
    initialCategory
  );
  const assistantEntryHrefString = getDashboardHrefString(assistantEntryHref);
  const useNswLegalAwareness = shouldUseNswLegalAwareness(
    initialTopic,
    initialCategory
  );
  const transcriptionLanguage = useMemo(() => {
    return i18n.resolvedLanguage === "es" || i18n.language === "es"
      ? "es"
      : "en";
  }, [i18n.language, i18n.resolvedLanguage]);
  const transcriptionLanguageHint =
    transcriptionLanguage === "en" ? undefined : transcriptionLanguage;
  const livePreviewLanguage =
    transcriptionLanguage === "es" ? "es-ES" : "en-US";

  useEffect(() => {
    if (!storedDraft) {
      return;
    }

    console.info(
      shouldIgnoreStoredDraft
        ? "[SafeSpeak][frontend-draft-ignored]"
        : "[SafeSpeak][frontend-draft-restored]",
      JSON.stringify({
        seededMessage,
        storedConversationSessionId: storedDraft.conversationSessionId,
        storedMessageCount: storedDraft.messages.length,
      })
    );
  }, [seededMessage, shouldIgnoreStoredDraft, storedDraft]);

  useEffect(() => {
    if (!shouldIgnoreStoredDraft) {
      return;
    }

    clearAssistantConversationDraft({
      topic: initialTopic,
      incidentCategory: initialCategory,
    });
  }, [initialCategory, initialTopic, shouldIgnoreStoredDraft]);

  useEffect(() => {
    latestMessagesRef.current = messages;
    latestAssistantTurnRef.current = Math.max(
      latestAssistantTurnRef.current,
      ...messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.turnNumber ?? 0)
    );
  }, [messages]);

  useEffect(() => {
    if (storedDraft) {
      console.info(
        "[SafeSpeak][frontend-draft-restore]",
        JSON.stringify({
          usedDraft: !shouldIgnoreStoredDraft,
          conversationSessionId: storedDraft.conversationSessionId ?? null,
          messageCount: storedDraft.messages.length,
          lastMessagePreview:
            storedDraft.messages.at(-1)?.content?.slice(0, 120) ?? "",
        })
      );
    }
  }, [shouldIgnoreStoredDraft, storedDraft]);

  useEffect(() => {
    voiceSessionActiveRef.current = isVoiceSessionActive;
  }, [isVoiceSessionActive]);

  const clearAutoStopRecordingTimer = useCallback(() => {
    if (autoStopRecordingTimerRef.current) {
      clearTimeout(autoStopRecordingTimerRef.current);
      autoStopRecordingTimerRef.current = null;
    }
  }, []);

  const clearRestartListeningTimer = useCallback(() => {
    if (restartListeningTimerRef.current) {
      clearTimeout(restartListeningTimerRef.current);
      restartListeningTimerRef.current = null;
    }
  }, []);

  const clearSpeechErrorTimer = useCallback(() => {
    if (speechErrorTimerRef.current) {
      clearTimeout(speechErrorTimerRef.current);
      speechErrorTimerRef.current = null;
    }
  }, []);

  const clearSpeechPlaybackWatchdog = useCallback(() => {
    if (speechPlaybackWatchdogRef.current) {
      clearTimeout(speechPlaybackWatchdogRef.current);
      speechPlaybackWatchdogRef.current = null;
    }
  }, []);

  const dismissSpeechError = useCallback(() => {
    clearSpeechErrorTimer();
    setSpeechError(null);
  }, [clearSpeechErrorTimer]);

  const showTransientSpeechError = useCallback(
    (message: string, durationMs = 3500) => {
      clearSpeechErrorTimer();
      setSpeechError(message);
      speechErrorTimerRef.current = setTimeout(() => {
        setSpeechError(null);
        speechErrorTimerRef.current = null;
      }, durationMs);
    },
    [clearSpeechErrorTimer]
  );

  const cleanupRecording = useCallback(() => {
    clearAutoStopRecordingTimer();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
  }, [clearAutoStopRecordingTimer]);

  const cleanupSpeechAudio = useCallback(() => {
    clearSpeechPlaybackWatchdog();

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    speechAudioRef.current?.pause();
    speechAudioRef.current = null;

    if (speechAudioUrlRef.current) {
      URL.revokeObjectURL(speechAudioUrlRef.current);
      speechAudioUrlRef.current = null;
    }
  }, [clearSpeechPlaybackWatchdog]);

  const revealPendingSpeechResponse = useCallback(() => {
    const reveal = pendingSpeechRevealRef.current;
    pendingSpeechRevealRef.current = null;
    reveal?.();
  }, []);

  const stopAssistantSpeech = useCallback(() => {
    speechPlaybackActiveRef.current = false;
    cleanupSpeechAudio();
    revealPendingSpeechResponse();
    setIsSpeaking(false);
    setIsGeneratingSpeech(false);
    setVoiceAvatarState("idle");
  }, [cleanupSpeechAudio, revealPendingSpeechResponse]);

  const scheduleNextVoiceTurn = useCallback(
    (attempt = 0) => {
      clearRestartListeningTimer();

      if (!voiceSessionActiveRef.current) {
        return;
      }

      if (isVoiceSessionMuted) {
        setVoiceAvatarState("idle");
        return;
      }

      // Voice state: assistant finished and is preparing to listen again.
      setVoiceAvatarState("listening");
      restartListeningTimerRef.current = setTimeout(
        () => {
          if (!voiceSessionActiveRef.current) {
            return;
          }

          void startVoiceRecordingRef.current().then((started) => {
            if (started || !voiceSessionActiveRef.current) {
              return;
            }

            // Keep recovering while the voice session is active. The End
            // button, consent decline, navigation, or component cleanup are
            // the only normal ways to terminate the loop.
            scheduleNextVoiceTurn(attempt + 1);
          });
        },
        attempt === 0 ? 350 : Math.min(500 + attempt * 250, 3000)
      );
    },
    [clearRestartListeningTimer, isVoiceSessionMuted]
  );

  const playAssistantSpeech = useCallback(
    async (
      text: string,
      options: {
        continueVoiceSession?: boolean;
        revealAfterPlayback?: () => void;
        language?: string;
      } = {}
    ) => {
      const speechText = text.trim();

      if (!speechText) {
        options.revealAfterPlayback?.();
        return;
      }

      cleanupSpeechAudio();
      if (options.revealAfterPlayback) {
        pendingSpeechRevealRef.current = options.revealAfterPlayback;
      }
      shouldContinueAfterPlaybackRef.current = Boolean(
        options.continueVoiceSession
      );
      const speechLanguage =
        normalizeAssistantSpeechLanguage(options.language) ??
        detectAssistantSpeechLanguage(speechText);
      setReplayVoiceText(speechText);
      setReplayVoiceLanguage(speechLanguage);
      setSpeechPlaybackError(null);
      setIsGeneratingSpeech(true);
      setIsSpeaking(false);
      speechPlaybackActiveRef.current = true;
      // Voice state: assistant response audio is being prepared or played.
      setVoiceAvatarState("aiSpeaking");

      try {
        const voice = await synthesizeAssistantVoice(
          speechText,
          speechLanguage
        );
        const audioUrl = createAssistantVoiceAudioUrl(voice);
        const audio = new Audio(audioUrl);

        speechAudioUrlRef.current = audioUrl;
        speechAudioRef.current = audio;

        let playbackFinished = false;
        const finishPlayback = (failed = false) => {
          if (playbackFinished) {
            return;
          }

          playbackFinished = true;
          clearSpeechPlaybackWatchdog();
          const shouldContinue = shouldContinueAfterPlaybackRef.current;

          speechPlaybackActiveRef.current = false;
          shouldContinueAfterPlaybackRef.current = false;
          setIsSpeaking(false);
          setIsGeneratingSpeech(false);
          if (failed) {
            setSpeechPlaybackError(
              t("dashboard.assistant.voicePlaybackFailed")
            );
          }
          revealPendingSpeechResponse();
          setVoiceAvatarState(shouldContinue ? "listening" : "idle");

          if (shouldContinue) {
            scheduleNextVoiceTurn();
          }
        };
        audio.onended = () => finishPlayback();
        audio.onerror = () => finishPlayback(true);

        setIsGeneratingSpeech(false);
        setIsSpeaking(true);
        const watchdogDelay = Math.min(
          90_000,
          Math.max(15_000, speechText.length * 120 + 8_000)
        );
        speechPlaybackWatchdogRef.current = setTimeout(
          () => finishPlayback(true),
          watchdogDelay
        );
        await audio.play();
      } catch (playbackError) {
        clearSpeechPlaybackWatchdog();
        speechPlaybackActiveRef.current = false;
        shouldContinueAfterPlaybackRef.current = false;
        setIsSpeaking(false);

        if (captureConsentError(playbackError)) {
          revealPendingSpeechResponse();
          setVoiceAvatarState("idle");
          setSpeechPlaybackError(null);
          return;
        }

        const playbackErrorName =
          playbackError instanceof DOMException
            ? playbackError.name
            : playbackError &&
                typeof playbackError === "object" &&
                "name" in playbackError &&
                typeof playbackError.name === "string"
              ? playbackError.name
              : null;
        const autoplayBlocked = playbackErrorName === "NotAllowedError";

        revealPendingSpeechResponse();

        if (!autoplayBlocked) {
          if (voiceSessionActiveRef.current) {
            scheduleNextVoiceTurn();
          } else {
            setVoiceAvatarState("idle");
          }
        } else {
          setVoiceAvatarState("idle");
        }

        setSpeechPlaybackError(
          autoplayBlocked
            ? t("dashboard.assistant.tapToPlayResponse")
            : playbackError instanceof Error
              ? playbackError.message
              : t("dashboard.assistant.voicePlaybackFailed")
        );
      } finally {
        setIsGeneratingSpeech(false);
      }
    },
    [
      captureConsentError,
      clearSpeechPlaybackWatchdog,
      cleanupSpeechAudio,
      revealPendingSpeechResponse,
      scheduleNextVoiceTurn,
      t,
    ]
  );

  const stopLiveTranscriptPreview = useCallback(() => {
    if (!liveRecognitionRef.current) {
      return;
    }

    liveRecognitionRef.current.onend = null;
    liveRecognitionRef.current.onresult = null;
    liveRecognitionRef.current.onerror = null;

    try {
      liveRecognitionRef.current.stop();
    } catch {
      liveRecognitionRef.current.abort();
    }

    liveRecognitionRef.current = null;
  }, []);

  const startLiveTranscriptPreview = useCallback((): boolean => {
    const recognitionCtor =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;

    if (!recognitionCtor) {
      return false;
    }

    stopLiveTranscriptPreview();

    const recognition = new recognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = livePreviewLanguage;
    recognition.maxAlternatives = 1;
    liveFinalTranscriptRef.current = "";

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim();

        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalChunk = `${finalChunk} ${transcript}`.trim();
        } else {
          interimChunk = `${interimChunk} ${transcript}`.trim();
        }
      }

      if (finalChunk) {
        liveFinalTranscriptRef.current =
          `${liveFinalTranscriptRef.current} ${finalChunk}`.trim();
      }

      setLiveTranscript(
        [liveFinalTranscriptRef.current, interimChunk].filter(Boolean).join(" ")
      );

      if (voiceSessionActiveRef.current && (finalChunk || interimChunk)) {
        // Voice state: the live recognizer has detected user speech.
        setVoiceAvatarState("userSpeaking");
        clearAutoStopRecordingTimer();
        autoStopRecordingTimerRef.current = setTimeout(
          () => {
            const mediaRecorder = mediaRecorderRef.current;

            if (
              voiceSessionActiveRef.current &&
              mediaRecorder?.state === "recording"
            ) {
              stopLiveTranscriptPreview();
              mediaRecorder.stop();
            }
          },
          finalChunk ? 900 : 1800
        );
      }
    };

    recognition.onerror = () => {
      liveRecognitionRef.current = null;
      if (voiceSessionActiveRef.current) {
        clearAutoStopRecordingTimer();
        autoStopRecordingTimerRef.current = setTimeout(() => {
          const mediaRecorder = mediaRecorderRef.current;

          if (
            voiceSessionActiveRef.current &&
            mediaRecorder?.state === "recording"
          ) {
            mediaRecorder.stop();
          }
        }, 2500);
      }
    };

    recognition.onend = () => {
      if (liveRecognitionRef.current === recognition) {
        liveRecognitionRef.current = null;
      }
    };

    liveRecognitionRef.current = recognition;

    try {
      recognition.start();
      return true;
    } catch {
      liveRecognitionRef.current = null;
      return false;
    }
  }, [
    clearAutoStopRecordingTimer,
    livePreviewLanguage,
    stopLiveTranscriptPreview,
  ]);

  const conversationMessages = useMemo<AssistantConversationMessage[]>(
    () => messages.map(({ role, content }) => ({ role, content })),
    [messages]
  );

  useEffect(() => {
    saveAssistantTriageSource({
      conversationSessionId: conversationSessionId ?? undefined,
      conversation: conversationMessages,
      timeline,
      incidentCategory: initialCategory,
    });
    saveAssistantConversationDraft(
      {
        conversationSessionId: conversationSessionId ?? undefined,
        messages: conversationMessages,
        timeline,
        timelineFieldOrder,
        triageCtaVisible: showTriageCta,
        voiceSessionActive: isVoiceSessionActive,
        incidentCategory: initialCategory,
        topic: initialTopic,
      },
      {
        topic: initialTopic,
        incidentCategory: initialCategory,
      }
    );
  }, [
    conversationMessages,
    initialCategory,
    initialTopic,
    conversationSessionId,
    isVoiceSessionActive,
    timeline,
    timelineFieldOrder,
    showTriageCta,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, showTriageCta, isSending, error]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.classList.add("assistant-conversation-lock");
    document.documentElement.classList.add("assistant-conversation-lock");

    return () => {
      document.body.classList.remove("assistant-conversation-lock");
      document.documentElement.classList.remove("assistant-conversation-lock");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        shouldProcessRecordingRef.current = false;
        mediaRecorderRef.current.stop();
      }

      voiceSessionActiveRef.current = false;
      clearAutoStopRecordingTimer();
      clearRestartListeningTimer();
      stopLiveTranscriptPreview();
      cleanupRecording();
      cleanupSpeechAudio();
    };
  }, [
    cleanupRecording,
    cleanupSpeechAudio,
    clearAutoStopRecordingTimer,
    clearRestartListeningTimer,
    stopLiveTranscriptPreview,
  ]);

  const requestAssistantTurn = useCallback(
    async (
      message: string,
      conversation: AssistantConversationMessage[],
      options: { speakResponse?: boolean; continueVoiceSession?: boolean } = {}
    ) => {
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      setIsSending(true);
      setError(null);
      let resolvedSessionId = conversationSessionId;

      const processConversationFlowResponse = async (
        response: Awaited<ReturnType<typeof appendConversationFlowMessage>>,
        fallbackSessionId: string
      ): Promise<boolean> => {
        const nextTimeline = response.factExtraction?.timeline ?? {};
        const responseSessionId =
          response.responseMeta?.conversationSessionId ?? fallbackSessionId;

        console.info(
          "[SafeSpeak][frontend-response]",
          JSON.stringify({
            requestId,
            responseSessionId,
            userMessageId: response.userMessage.id,
            userTurnNumber: response.userMessage.turnNumber,
            assistantMessageId: response.assistantMessage.id,
            assistantTurnNumber: response.assistantMessage.turnNumber,
            selectedResponseSource:
              (response.assistantMessage.metadata?.selectedResponseSource as
                | string
                | undefined) ??
              (
                response.responseMeta as
                  | { selectedResponseSource?: string }
                  | undefined
              )?.selectedResponseSource ??
              "unknown",
            intent:
              (response.assistantMessage.metadata?.intent as
                | string
                | undefined) ??
              response.responseMeta?.intent ??
              "unknown",
            assistantPreview: response.assistantMessage.content.slice(0, 120),
          })
        );

        if (requestId !== latestRequestIdRef.current) {
          console.info(
            "[SafeSpeak][frontend-response-ignored]",
            JSON.stringify({
              requestId,
              latestRequestId: latestRequestIdRef.current,
              assistantMessageId: response.assistantMessage.id,
            })
          );
          return false;
        }

        if (
          response.assistantMessage.turnNumber <= latestAssistantTurnRef.current
        ) {
          console.info(
            "[SafeSpeak][frontend-stale-assistant-ignored]",
            JSON.stringify({
              requestId,
              assistantMessageId: response.assistantMessage.id,
              assistantTurnNumber: response.assistantMessage.turnNumber,
              latestAssistantTurnNumber: latestAssistantTurnRef.current,
            })
          );
          return false;
        }

        if (responseSessionId && responseSessionId !== conversationSessionId) {
          setConversationSessionId(responseSessionId);
          resolvedSessionId = responseSessionId;
        }

        setTimeline((currentTimeline) => {
          const nextKeys = Object.entries(nextTimeline)
            .filter(([, value]) => value.trim().length > 0)
            .map(([key]) => key);

          setTimelineFieldOrder((currentOrder) => {
            const mergedOrder = [...currentOrder];

            nextKeys.forEach((key) => {
              const hadValue =
                typeof currentTimeline[key] === "string" &&
                currentTimeline[key].trim().length > 0;

              if (!hadValue && !mergedOrder.includes(key)) {
                mergedOrder.push(key);
              }
            });

            return mergedOrder.filter((key) => nextKeys.includes(key));
          });

          return nextTimeline;
        });

        const assistantMessage: ConversationUiMessage = {
          role: "assistant",
          content: response.assistantMessage.content,
          messageId: response.assistantMessage.id,
          turnNumber: response.assistantMessage.turnNumber,
          responseMeta: {
            citations: response.responseMeta?.citations,
            confidence: response.responseMeta?.confidence,
            intent: response.responseMeta?.intent,
            triageReady: response.responseMeta?.triageReady,
            nextAction: response.responseMeta?.nextAction,
            conversationSessionId: responseSessionId,
            selectedResponseSource:
              response.responseMeta?.selectedResponseSource,
            responseSource: response.responseMeta?.responseSource,
            model: response.responseMeta?.model,
            ragStatus: response.responseMeta?.ragStatus,
            showSources: response.responseMeta?.showSources,
            sourceDisplayReason: response.responseMeta?.sourceDisplayReason,
            reviewStatus: response.responseMeta?.reviewStatus,
            ragUnavailable: response.responseMeta?.rag?.unavailable,
            assistantLanguage: response.responseMeta?.assistantLanguage,
            pendingHumanReview: Boolean(
              response.triage?.humanReviewRecommended
            ),
          },
        };
        latestAssistantTurnRef.current = response.assistantMessage.turnNumber;

        if (options.speakResponse) {
          setMessages((currentMessages) => [
            ...currentMessages,
            assistantMessage,
          ]);
          void playAssistantSpeech(response.assistantMessage.content, {
            continueVoiceSession: options.continueVoiceSession,
            language: response.responseMeta?.assistantLanguage,
          });
        } else {
          setMessages((currentMessages) => [
            ...currentMessages,
            assistantMessage,
          ]);
        }

        if (isActionableConversationTriage(response)) {
          setShowTriageCta(true);
        }

        return true;
      };

      console.info(
        "[SafeSpeak][frontend-request]",
        JSON.stringify({
          requestId,
          conversationSessionId: resolvedSessionId,
          latestUserMessage: message,
          latestUserMessagePayload: buildConversationRequestBody({
            content: message,
            language: transcriptionLanguage,
          }),
          conversationLength: conversation.length,
        })
      );

      try {
        if (hasBrokenTextEncoding(message)) {
          setMessages([
            ...conversation,
            {
              role: "assistant",
              content:
                "The message looks like it was received with broken text encoding. Please resend it.",
              responseMeta: {
                intent: "encoding_error",
                selectedResponseSource: "frontend_encoding_guard",
              },
            },
          ]);
          setIsSending(false);
          return;
        }

        await ensureConsent(consentRequirements.aiAssistant);

        if (!resolvedSessionId) {
          const session = await createConversationFlowSession({
            selectedTopic: initialTopic ?? initialCategory,
            jurisdiction: useNswLegalAwareness ? "NSW" : undefined,
          });

          resolvedSessionId = session.id;
          setConversationSessionId(session.id);
        }

        const response = await appendConversationFlowMessage({
          conversationSessionId: resolvedSessionId,
          content: message,
          language: transcriptionLanguage,
        });
        const handled = await processConversationFlowResponse(
          response,
          resolvedSessionId
        );

        if (!handled) {
          return;
        }
      } catch (conversationFlowError) {
        if (captureConsentError(conversationFlowError)) {
          pendingAssistantRequestRef.current = {
            message,
            conversation,
            speakResponse: options.speakResponse,
            continueVoiceSession: options.continueVoiceSession,
          };
          setVoiceAvatarState("idle");
          return;
        }

        if (
          conversationFlowError instanceof ApiRequestError &&
          conversationFlowError.status >= 500 &&
          resolvedSessionId
        ) {
          try {
            const freshSession = await createConversationFlowSession({
              selectedTopic: initialTopic ?? initialCategory,
              jurisdiction: useNswLegalAwareness ? "NSW" : undefined,
            });

            setConversationSessionId(freshSession.id);
            resolvedSessionId = freshSession.id;

            const retryResponse = await appendConversationFlowMessage({
              conversationSessionId: freshSession.id,
              content: message,
              language: transcriptionLanguage,
            });
            const handledRetry = await processConversationFlowResponse(
              retryResponse,
              freshSession.id
            );

            if (handledRetry) {
              return;
            }
          } catch (retryError) {
            console.warn(
              "[SafeSpeak][frontend-conversation-retry-failed]",
              JSON.stringify({
                requestId,
                originalStatus:
                  conversationFlowError instanceof ApiRequestError
                    ? conversationFlowError.status
                    : undefined,
                retryStatus:
                  retryError instanceof ApiRequestError
                    ? retryError.status
                    : undefined,
              })
            );
          }
        }

        try {
          if (
            !shouldCallTimelineAssistant({
              message,
              conversation,
              timeline,
              incidentCategory: initialCategory,
            })
          ) {
            throw conversationFlowError;
          }

          const response = await sendTimelineAssistantMessage({
            message,
            conversation,
            timeline,
            incidentCategory: initialCategory,
            jurisdiction: useNswLegalAwareness ? "NSW" : undefined,
          });
          const assistantContent = buildAssistantBubbleContent(
            response.assistantMessage ?? "",
            response.nextQuestion ?? ""
          );

          setTimeline((currentTimeline) => {
            const nextTimeline = response.timeline;
            const nextKeys = Object.entries(nextTimeline)
              .filter(([, value]) => value.trim().length > 0)
              .map(([key]) => key);

            setTimelineFieldOrder((currentOrder) => {
              const mergedOrder = [...currentOrder];

              nextKeys.forEach((key) => {
                const hadValue =
                  typeof currentTimeline[key] === "string" &&
                  currentTimeline[key].trim().length > 0;

                if (!hadValue && !mergedOrder.includes(key)) {
                  mergedOrder.push(key);
                }
              });

              return mergedOrder.filter((key) => nextKeys.includes(key));
            });

            return nextTimeline;
          });
          const assistantMessage: ConversationUiMessage = {
            role: "assistant",
            content: assistantContent,
            responseMeta: {
              citations: response.citations,
              confidence: response.confidence,
              triageReady: response.triageReady,
              nextAction: response.nextAction,
              conversationSessionId: resolvedSessionId ?? undefined,
              showSources: response.showSources,
              sourceDisplayReason: response.sourceDisplayReason,
              reviewStatus: response.reviewStatus,
              ragUnavailable: response.rag?.unavailable,
              pendingHumanReview:
                response.reviewStatus === "pending_human_review",
              legalAwareness: response.legalAwareness,
              encodingWarning: response.encodingWarning,
            },
          };

          if (options.speakResponse) {
            setMessages((currentMessages) => [
              ...currentMessages,
              assistantMessage,
            ]);
            void playAssistantSpeech(assistantContent, {
              continueVoiceSession: options.continueVoiceSession,
            });
          } else {
            setMessages((currentMessages) => [
              ...currentMessages,
              assistantMessage,
            ]);
          }

          if (
            response.triageReady ||
            response.nextAction === "show_triage_button" ||
            (response.readyForSubmission &&
              detectHarmfulActivity({
                incidentCategory: initialCategory,
                timeline: response.timeline,
                conversation: [
                  ...conversation,
                  { role: "user", content: message },
                ],
              }))
          ) {
            setShowTriageCta(true);
          }
        } catch (requestError) {
          if (captureConsentError(requestError)) {
            pendingAssistantRequestRef.current = {
              message,
              conversation,
              speakResponse: options.speakResponse,
              continueVoiceSession: options.continueVoiceSession,
            };
            setVoiceAvatarState("idle");
            return;
          }

          setVoiceAvatarState("idle");
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Assistant response failed"
          );
          if (voiceSessionActiveRef.current && options.continueVoiceSession) {
            scheduleNextVoiceTurn();
          }
        }
      } finally {
        setIsSending(false);
      }
    },
    [
      clearPendingConsent,
      captureConsentError,
      conversationSessionId,
      initialCategory,
      initialTopic,
      playAssistantSpeech,
      scheduleNextVoiceTurn,
      timeline,
      transcriptionLanguage,
      useNswLegalAwareness,
    ]
  );

  useEffect(() => {
    if (!seededMessage || hasSentInitialRef.current || existingDraft) {
      return;
    }

    hasSentInitialRef.current = true;
    if (startVoiceMode) {
      voiceSessionActiveRef.current = true;
      setIsVoiceSessionActive(true);
    }
    void requestAssistantTurn(seededMessage, latestMessagesRef.current, {
      speakResponse: startVoiceMode,
      continueVoiceSession: startVoiceMode,
    });
  }, [existingDraft, requestAssistantTurn, seededMessage, startVoiceMode]);

  const transcribeVoiceBlobToInput = useCallback(
    async (audioBlob: Blob) => {
      const fastTranscript =
        liveFinalTranscriptRef.current.trim() || liveTranscript.trim();
      const transcript = fastTranscript
        ? fastTranscript
        : (
            await transcribeAssistantVoice(audioBlob, transcriptionLanguageHint)
          ).transcript.trim();

      if (!transcript) {
        throw new Error(getRecordingErrorMessage("no-speech", t));
      }

      setInput((currentInput) =>
        [currentInput.trim(), transcript].filter(Boolean).join(" ")
      );
    },
    [liveTranscript, t, transcriptionLanguageHint]
  );

  const processVoiceAudioBlob = useCallback(
    async (
      audioBlob: Blob,
      options: { speakResponse: boolean; continueVoiceSession: boolean }
    ) => {
      if (!audioBlob.size) {
        setIsTranscribing(false);
        showTransientSpeechError(getRecordingErrorMessage("no-speech", t));
        if (voiceSessionActiveRef.current) {
          scheduleNextVoiceTurn();
        } else {
          setVoiceAvatarState("idle");
        }
        return;
      }

      try {
        // Browser speech recognition is only a live preview. It is tied to a
        // configured locale and can turn multilingual speech into incorrect
        // English text, so voice-first turns always use server transcription
        // with language auto-detection.
        const transcript = (
          await transcribeAssistantVoice(audioBlob, transcriptionLanguageHint)
        ).transcript.trim();

        if (!transcript) {
          showTransientSpeechError(getRecordingErrorMessage("no-speech", t));
          if (voiceSessionActiveRef.current) {
            scheduleNextVoiceTurn();
          } else {
            setVoiceAvatarState("idle");
          }
          return;
        }

        const voiceMessage = [input.trim(), transcript]
          .filter(Boolean)
          .join(" ");
        const nextMessages = [
          ...latestMessagesRef.current,
          {
            role: "user" as const,
            content: voiceMessage,
          },
        ];

        setSpeechError(null);
        setInput("");
        setMessages(nextMessages);

        // Voice state: speech was captured and the assistant response is starting.
        setVoiceAvatarState("aiSpeaking");
        void requestAssistantTurn(voiceMessage, nextMessages, options);
      } catch (recordingError) {
        if (captureConsentError(recordingError)) {
          setVoiceAvatarState("idle");
          setSpeechError(null);
          return;
        }

        if (isNoSpeechTranscriptionError(recordingError)) {
          showTransientSpeechError(getRecordingErrorMessage("no-speech", t));
          if (voiceSessionActiveRef.current) {
            scheduleNextVoiceTurn();
          } else {
            setVoiceAvatarState("idle");
          }
          return;
        }

        showTransientSpeechError(
          recordingError instanceof Error
            ? recordingError.message
            : getRecordingErrorMessage("network", t),
          4500
        );
        if (voiceSessionActiveRef.current) {
          scheduleNextVoiceTurn();
        } else {
          setVoiceAvatarState("idle");
        }
      } finally {
        setIsTranscribing(false);
        liveFinalTranscriptRef.current = "";
        setLiveTranscript("");
      }
    },
    [
      captureConsentError,
      input,
      liveTranscript,
      requestAssistantTurn,
      scheduleNextVoiceTurn,
      t,
      transcriptionLanguageHint,
    ]
  );

  useEffect(() => {
    if (
      existingDraft ||
      seededMessage ||
      hasHandledPendingVoiceHandoffRef.current
    ) {
      return;
    }

    const pendingAudio = consumeAssistantVoiceHandoff();

    if (!pendingAudio) {
      return;
    }

    hasHandledPendingVoiceHandoffRef.current = true;

    if (startVoiceMode) {
      voiceSessionActiveRef.current = true;
      setIsVoiceSessionActive(true);
    }

    setIsTranscribing(true);
    setVoiceAvatarState("listening");
    void processVoiceAudioBlob(pendingAudio, {
      speakResponse: startVoiceMode,
      continueVoiceSession: startVoiceMode,
    });
  }, [existingDraft, processVoiceAudioBlob, seededMessage, startVoiceMode]);

  const handleRecordedAudio = useCallback(
    async (mimeType: string, target: VoiceCaptureTarget) => {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: mimeType || "audio/webm",
      });

      shouldProcessRecordingRef.current = false;
      audioChunksRef.current = [];
      cleanupRecording();

      if (target === "transcription") {
        try {
          if (!audioBlob.size) {
            showTransientSpeechError(getRecordingErrorMessage("no-speech", t));
            setVoiceAvatarState("idle");
            return;
          }

          if (recordingDecisionRef.current === "confirm") {
            setIsTranscribing(true);
            setVoiceAvatarState("listening");
            await transcribeVoiceBlobToInput(audioBlob);
          } else if (recordingDecisionRef.current !== "cancel") {
            setPendingVoiceReviewBlob(audioBlob);
            setSpeechError(null);
            setVoiceAvatarState("idle");
          }
        } catch (recordingError) {
          setVoiceAvatarState("idle");
          showTransientSpeechError(
            recordingError instanceof Error
              ? recordingError.message
              : getRecordingErrorMessage("network", t),
            4500
          );
        } finally {
          setIsTranscribing(false);
          setLiveTranscript("");
          setActiveVoiceCaptureTarget(null);
          recordingDecisionRef.current = null;
        }
        return;
      }

      await processVoiceAudioBlob(audioBlob, {
        speakResponse: true,
        continueVoiceSession: voiceSessionActiveRef.current,
      });
    },
    [cleanupRecording, processVoiceAudioBlob, t, transcribeVoiceBlobToInput]
  );

  const startVoiceRecording = useCallback(
    async (target: VoiceCaptureTarget = "conversation"): Promise<boolean> => {
      if (
        (target === "conversation" && isSending) ||
        isTranscribing ||
        ((isGeneratingSpeech || isSpeaking) && speechPlaybackActiveRef.current)
      ) {
        return false;
      }

      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        setVoiceAvatarState("idle");
        showTransientSpeechError(
          t("dashboard.assistant.speechErrors.unsupported"),
          4500
        );
        return false;
      }

      try {
        await ensureConsent(consentRequirements.audioTranscription);
      } catch (consentCheckError) {
        if (captureConsentError(consentCheckError)) {
          setVoiceAvatarState("idle");
          return false;
        }

        showTransientSpeechError(
          consentCheckError instanceof Error
            ? consentCheckError.message
            : "Consent status could not be checked.",
          4500
        );
        setVoiceAvatarState("idle");
        return false;
      }

      setSpeechError(null);
      setLiveTranscript("");
      setIsTranscribing(false);
      setPendingVoiceReviewBlob(null);
      setActiveVoiceCaptureTarget(target);
      audioChunksRef.current = [];
      shouldProcessRecordingRef.current = true;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const mimeType = getPreferredRecordingMimeType();
        const mediaRecorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined
        );

        recordingStreamRef.current = stream;
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            // Voice state: audio data arrived even if live recognition is unavailable.
            setVoiceAvatarState("userSpeaking");
          }
        };

        mediaRecorder.onerror = () => {
          shouldProcessRecordingRef.current = false;
          setIsRecordingActive(false);
          setIsTranscribing(false);
          setActiveVoiceCaptureTarget(null);
          setVoiceAvatarState("idle");
          cleanupRecording();
          showTransientSpeechError(
            getRecordingErrorMessage("audio-capture", t),
            4500
          );
        };

        mediaRecorder.onstop = () => {
          setIsRecordingActive(false);

          if (!shouldProcessRecordingRef.current) {
            audioChunksRef.current = [];
            cleanupRecording();
            setActiveVoiceCaptureTarget(null);
            setVoiceAvatarState("idle");
            return;
          }

          // Voice state: user speech ended, keep the avatar active while transcribing.
          setVoiceAvatarState("listening");
          if (
            target === "conversation" ||
            recordingDecisionRef.current === "confirm"
          ) {
            setIsTranscribing(true);
          }
          void handleRecordedAudio(
            mediaRecorder.mimeType || mimeType || "audio/webm",
            target
          );
        };

        mediaRecorder.start();
        // Voice state: microphone is open and waiting for the user to speak.
        setVoiceAvatarState("listening");
        const hasLiveEndpointing = startLiveTranscriptPreview();

        clearAutoStopRecordingTimer();
        autoStopRecordingTimerRef.current = setTimeout(() => {
          const activeRecorder = mediaRecorderRef.current;

          if (activeRecorder?.state === "recording") {
            if (hasLiveEndpointing) {
              stopLiveTranscriptPreview();
            }

            activeRecorder.stop();
          }
        }, VOICE_RECORDING_TIMEOUT_MS);

        setIsRecordingActive(true);
        return true;
      } catch (recordingError) {
        stopLiveTranscriptPreview();
        cleanupRecording();
        setActiveVoiceCaptureTarget(null);
        setVoiceAvatarState("idle");
        const errorCode =
          recordingError instanceof DOMException &&
          recordingError.name === "NotAllowedError"
            ? "not-allowed"
            : "audio-capture";
        showTransientSpeechError(getRecordingErrorMessage(errorCode, t), 4500);
        return false;
      }
    },
    [
      cleanupRecording,
      clearAutoStopRecordingTimer,
      handleRecordedAudio,
      isGeneratingSpeech,
      isSending,
      isSpeaking,
      isTranscribing,
      startLiveTranscriptPreview,
      stopLiveTranscriptPreview,
      showTransientSpeechError,
      t,
    ]
  );

  startVoiceRecordingRef.current = startVoiceRecording;

  const startVoiceSession = useCallback(async () => {
    if (voiceSessionActiveRef.current) {
      return;
    }

    voiceSessionActiveRef.current = true;
    setIsVoiceSessionActive(true);
    setIsVoiceSessionMuted(false);
    shouldContinueAfterPlaybackRef.current = false;
    setSpeechError(null);
    setSpeechPlaybackError(null);

    const started = await startVoiceRecording("conversation");

    if (!started) {
      scheduleNextVoiceTurn(1);
    }
  }, [scheduleNextVoiceTurn, startVoiceRecording]);

  const stopVoiceSession = useCallback(() => {
    voiceSessionActiveRef.current = false;
    setIsVoiceSessionActive(false);
    setIsVoiceSessionMuted(false);
    shouldContinueAfterPlaybackRef.current = false;
    shouldProcessRecordingRef.current = false;
    clearAutoStopRecordingTimer();
    clearRestartListeningTimer();
    stopLiveTranscriptPreview();
    stopAssistantSpeech();

    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      cleanupRecording();
    }

    audioChunksRef.current = [];
    setIsRecordingActive(false);
    setIsTranscribing(false);
    setActiveVoiceCaptureTarget(null);
    setPendingVoiceReviewBlob(null);
    setLiveTranscript("");
    setVoiceAvatarState("idle");
  }, [
    cleanupRecording,
    clearAutoStopRecordingTimer,
    clearRestartListeningTimer,
    stopAssistantSpeech,
    stopLiveTranscriptPreview,
  ]);

  const handleCancel = useCallback(() => {
    stopVoiceSession();
    clearAssistantConversationDraft({
      topic: initialTopic,
      incidentCategory: initialCategory,
    });
    clearAssistantTriageSource();

    if (typeof window !== "undefined") {
      const fallbackDashboardUrl = window.sessionStorage.getItem(
        LAST_NON_CONVERSATION_DASHBOARD_URL_STORAGE_KEY
      );
      const currentUrl = `${window.location.pathname}${window.location.search}`;

      if (
        fallbackDashboardUrl &&
        fallbackDashboardUrl !== currentUrl &&
        !fallbackDashboardUrl.includes("view=assistantconversation")
      ) {
        window.location.assign(fallbackDashboardUrl);
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
        window.setTimeout(() => {
          const nextUrl = `${window.location.pathname}${window.location.search}`;

          if (nextUrl === currentUrl) {
            window.location.assign(assistantEntryHrefString);
          }
        }, 150);
        return;
      }

      window.location.assign(assistantEntryHrefString);
      return;
    }

    router.push(assistantEntryHrefString as Parameters<typeof router.push>[0]);
  }, [
    assistantEntryHrefString,
    initialCategory,
    initialTopic,
    router,
    stopVoiceSession,
  ]);

  const toggleVoiceSessionMute = useCallback(() => {
    if (!voiceSessionActiveRef.current) {
      return;
    }

    if (isVoiceSessionMuted) {
      setIsVoiceSessionMuted(false);
      setSpeechError(null);

      if (
        !isRecordingActive &&
        !isTranscribing &&
        !isGeneratingSpeech &&
        !isSpeaking
      ) {
        void startVoiceRecording("conversation");
      } else if (isGeneratingSpeech || isSpeaking) {
        setVoiceAvatarState("aiSpeaking");
      } else {
        setVoiceAvatarState("listening");
      }

      return;
    }

    setIsVoiceSessionMuted(true);
    shouldProcessRecordingRef.current = false;
    shouldContinueAfterPlaybackRef.current = false;
    clearAutoStopRecordingTimer();
    clearRestartListeningTimer();
    stopLiveTranscriptPreview();

    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      cleanupRecording();
    }

    audioChunksRef.current = [];
    setIsRecordingActive(false);
    setIsTranscribing(false);
    setActiveVoiceCaptureTarget(null);
    setPendingVoiceReviewBlob(null);
    setLiveTranscript("");
    setVoiceAvatarState(
      isGeneratingSpeech || isSpeaking ? "aiSpeaking" : "idle"
    );
  }, [
    cleanupRecording,
    clearAutoStopRecordingTimer,
    clearRestartListeningTimer,
    isGeneratingSpeech,
    isRecordingActive,
    isSpeaking,
    isTranscribing,
    isVoiceSessionMuted,
    startVoiceRecording,
    stopLiveTranscriptPreview,
  ]);

  const cancelTranscriptionCapture = useCallback(() => {
    recordingDecisionRef.current = "cancel";
    shouldProcessRecordingRef.current = false;
    clearAutoStopRecordingTimer();
    stopLiveTranscriptPreview();

    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      cleanupRecording();
    }

    audioChunksRef.current = [];
    setPendingVoiceReviewBlob(null);
    setActiveVoiceCaptureTarget(null);
    setIsRecordingActive(false);
    setIsTranscribing(false);
    setLiveTranscript("");
    setVoiceAvatarState("idle");
  }, [
    cleanupRecording,
    clearAutoStopRecordingTimer,
    stopLiveTranscriptPreview,
  ]);

  const confirmTranscriptionCapture = useCallback(async () => {
    if (activeVoiceCaptureTarget === "transcription" && isRecordingActive) {
      recordingDecisionRef.current = "confirm";
      stopLiveTranscriptPreview();
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!pendingVoiceReviewBlob) {
      return;
    }

    setIsTranscribing(true);
    setSpeechError(null);
    setVoiceAvatarState("listening");

    try {
      await transcribeVoiceBlobToInput(pendingVoiceReviewBlob);
      setPendingVoiceReviewBlob(null);
      setVoiceAvatarState("idle");
    } catch (error) {
      setVoiceAvatarState("idle");
      showTransientSpeechError(
        error instanceof Error
          ? error.message
          : getRecordingErrorMessage("network", t),
        4500
      );
    } finally {
      setIsTranscribing(false);
    }
  }, [
    activeVoiceCaptureTarget,
    isRecordingActive,
    pendingVoiceReviewBlob,
    stopLiveTranscriptPreview,
    t,
    transcribeVoiceBlobToInput,
  ]);

  const toggleTranscriptionCapture = useCallback(() => {
    if (isVoiceSessionActive || isGeneratingSpeech || isSpeaking) {
      return;
    }

    if (activeVoiceCaptureTarget === "transcription" && isRecordingActive) {
      recordingDecisionRef.current = null;
      stopLiveTranscriptPreview();
      mediaRecorderRef.current?.stop();
      return;
    }

    if (isRecordingActive) {
      return;
    }

    void startVoiceRecording("transcription");
  }, [
    activeVoiceCaptureTarget,
    isGeneratingSpeech,
    isRecordingActive,
    isSpeaking,
    isVoiceSessionActive,
    startVoiceRecording,
    stopLiveTranscriptPreview,
  ]);

  useEffect(() => {
    if (
      !shouldAutoStartVoiceMode ||
      seededMessage ||
      hasStartedInitialVoiceModeRef.current
    ) {
      return;
    }

    hasStartedInitialVoiceModeRef.current = true;
    voiceSessionActiveRef.current = false;
    void startVoiceSession();
  }, [seededMessage, shouldAutoStartVoiceMode, startVoiceSession]);

  const handleAllowPendingConsent = async () => {
    const requirement = pendingConsentRequirement;

    try {
      await grantPendingConsent();
      setError(null);
      setSpeechError(null);

      if (
        requirement?.source === consentRequirements.audioTranscription.source
      ) {
        if (activeVoiceCaptureTarget === "transcription") {
          void startVoiceRecording("transcription");
        } else {
          void startVoiceSession();
        }
        return;
      }

      const pendingRequest = pendingAssistantRequestRef.current;
      pendingAssistantRequestRef.current = null;

      if (pendingRequest) {
        void requestAssistantTurn(
          pendingRequest.message,
          pendingRequest.conversation,
          {
            speakResponse: pendingRequest.speakResponse,
            continueVoiceSession: pendingRequest.continueVoiceSession,
          }
        );
        return;
      }

      if (isVoiceSessionActive && replayVoiceText) {
        void playAssistantSpeech(replayVoiceText, {
          continueVoiceSession: true,
          language: replayVoiceLanguage,
        });
      }
    } catch (consentError) {
      setVoiceAvatarState("idle");
      setError(
        consentError instanceof Error
          ? consentError.message
          : "Consent could not be saved."
      );
    }
  };

  const handleDeclinePendingConsent = () => {
    pendingAssistantRequestRef.current = null;
    revealPendingSpeechResponse();
    voiceSessionActiveRef.current = false;
    setIsVoiceSessionActive(false);
    setIsVoiceSessionMuted(false);
    shouldContinueAfterPlaybackRef.current = false;
    clearAutoStopRecordingTimer();
    clearRestartListeningTimer();
    setVoiceAvatarState("idle");
    clearPendingConsent();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = input.trim();

    dismissSpeechError();
    setSpeechPlaybackError(null);
    setLiveTranscript("");
    liveFinalTranscriptRef.current = "";

    if (
      !message ||
      isSending ||
      isVoiceSessionActive ||
      isRecordingActive ||
      isTranscribing ||
      isGeneratingSpeech ||
      isSpeaking
    ) {
      return;
    }

    const nextMessages = [
      ...latestMessagesRef.current,
      {
        role: "user" as const,
        content: message,
      },
    ];

    setInput("");
    setMessages(nextMessages);
    void requestAssistantTurn(message, nextMessages);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (speechError) {
      dismissSpeechError();
    }
    setInput(event.target.value);
  };

  const conversationVoiceAvatarState: VoiceAvatarState = isSpeaking
    ? "aiSpeaking"
    : isGeneratingSpeech || isSending || isTranscribing
      ? "processing"
      : liveTranscript
        ? "userSpeaking"
        : isRecordingActive
          ? voiceAvatarState === "userSpeaking"
            ? "userSpeaking"
            : "listening"
          : "idle";
  const isTranscriptionCaptureActive =
    activeVoiceCaptureTarget === "transcription" && isRecordingActive;
  const shouldShowSendButton = input.trim().length > 0;
  const shouldShowVoiceAvatar = isVoiceSessionActive;

  return (
    <div
      data-testid="ai-conversation-page"
      className="flex flex-1 flex-col overflow-hidden px-2 pb-0 pb-3 pt-2 sm:px-4 sm:pb-5 sm:pt-4"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1320px] flex-col">
        <div className="flex items-center justify-between border-b border-[#d9e2ee] px-1 py-2">
          <div />
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs font-medium text-[#7b8798]"
          >
            {t("common.cancel")}
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="relative flex h-full min-h-0 flex-1 flex-col bg-transparent px-2 pb-2 pt-2 sm:px-3 xl:min-h-[520px]">
            {pendingConsentRequirement ? (
              <div className="relative z-30 mb-3 max-w-[560px]">
                <ConsentRequiredCard
                  requirement={pendingConsentRequirement!}
                  isSubmitting={isGrantingConsent}
                  onAllow={() => {
                    void handleAllowPendingConsent();
                  }}
                  onDecline={handleDeclinePendingConsent}
                />
              </div>
            ) : null}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div
                data-testid="ai-conversation-chat"
                className="conversation-scrollbar h-full overflow-y-auto"
              >
                <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-2 pb-4">
                  {messages.map((message, index) => {
                    const displayContent = getAssistantDisplayContent(message);
                    const lawPrefix =
                      message.role === "assistant"
                        ? buildAssistantLawPrefix(message)
                        : "";
                    const displayText = lawPrefix
                      ? `${lawPrefix}\n\n${displayContent}`
                      : displayContent;

                    return (
                      <div
                        key={
                          message.messageId ??
                          `${message.role}-${message.turnNumber ?? index}-${message.content.slice(0, 16)}`
                        }
                        data-testid={`ai-conversation-message-${message.role}`}
                        className={
                          message.role === "user" ? "flex justify-end" : ""
                        }
                      >
                        <div className="max-w-[min(88%,540px)]">
                          <div
                            className={`inline-flex max-w-full rounded-[20px] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(148,163,184,0.12)] ${
                              message.role === "user"
                                ? "whitespace-pre-wrap rounded-tr-[8px] text-[14px] leading-[1.6] text-[#314256]"
                                : "rounded-tl-[8px] text-[#41566f]"
                            }`}
                          >
                            {message.role === "assistant" ? (
                              <AssistantMessageRenderer content={displayText} />
                            ) : (
                              displayText
                            )}
                          </div>
                          {message.role === "assistant" ? (
                            <>
                              <AssistantLegalCitationDetails
                                citations={
                                  message.responseMeta?.citations ?? []
                                }
                                groundedLegalSource={
                                  message.responseMeta?.groundedLegalSource
                                }
                                showDetails={Boolean(
                                  message.responseMeta?.showSources &&
                                  (message.responseMeta?.sourceDisplayReason ===
                                    "legal_lookup" ||
                                    message.responseMeta
                                      ?.sourceDisplayReason ===
                                      "explicit_citation_request")
                                )}
                              />
                              <AssistantResponseCitations
                                citations={
                                  message.responseMeta?.citations ?? []
                                }
                                showSources={Boolean(
                                  message.responseMeta?.showSources
                                )}
                                answerText={displayContent}
                              />
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  {showTriageCta ? (
                    <div className="flex justify-center py-2">
                      <button
                        type="button"
                        onClick={() => {
                          router.push(continueReportSubmissionPath as Route);
                        }}
                        data-testid="ai-conversation-triage-button"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#0f5d9f] px-6 text-[12px] font-bold text-white shadow-[0_12px_28px_rgba(15,93,159,0.26)] transition hover:bg-[#0b528d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f5d9f]"
                      >
                        Continue to Triage
                        <IconArrowRight size={14} />
                      </button>
                    </div>
                  ) : null}

                  {isSending ? (
                    <div className="inline-flex w-fit items-center rounded-[18px] rounded-tl-[8px] bg-white px-3 py-2 shadow-[0_8px_22px_rgba(148,163,184,0.12)]">
                      <span className="sr-only">Assistant is typing</span>
                      <div
                        className="flex items-center gap-1"
                        aria-hidden="true"
                      >
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#9fb3cb] [animation-delay:0ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#9fb3cb] [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#9fb3cb] [animation-delay:300ms]" />
                      </div>
                    </div>
                  ) : null}

                  {error ? (
                    <div className="inline-flex max-w-[540px] items-center gap-2 rounded-[18px] bg-white px-4 py-2.5 text-[11px] text-[#c24141] shadow-[0_8px_22px_rgba(148,163,184,0.12)]">
                      <IconAlertCircle size={12} />
                      {error}
                    </div>
                  ) : null}

                  {speechError ? (
                    <div className="inline-flex max-w-[540px] items-center gap-2 rounded-[18px] bg-white px-4 py-2.5 text-[11px] text-[#c24141] shadow-[0_8px_22px_rgba(148,163,184,0.12)]">
                      <IconAlertCircle size={12} />
                      {speechError}
                    </div>
                  ) : null}

                  {isGeneratingSpeech || isSpeaking ? (
                    <div
                      className="inline-flex max-w-[540px] items-center gap-2 rounded-[18px] bg-white px-4 py-2.5 text-[11px] text-[#5f6f86] shadow-[0_8px_22px_rgba(148,163,184,0.12)]"
                      aria-live="polite"
                    >
                      {isGeneratingSpeech ? (
                        <IconLoader2 size={12} className="animate-spin" />
                      ) : (
                        <IconMicrophone size={12} />
                      )}
                      <span>
                        {isGeneratingSpeech
                          ? t("dashboard.assistant.generatingVoice")
                          : t("dashboard.assistant.speaking")}
                      </span>
                      {isSpeaking ? (
                        <button
                          type="button"
                          onClick={stopAssistantSpeech}
                          className="ml-1 rounded-full border border-[#d6e7f6] px-2 py-1 text-[10px] font-bold text-[#0f5d9f]"
                          aria-label={t(
                            "dashboard.assistant.stopVoicePlayback"
                          )}
                        >
                          {t("dashboard.assistant.stopVoicePlayback")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {speechPlaybackError ? (
                    <div
                      className="inline-flex max-w-[540px] items-center gap-2 rounded-[18px] bg-white px-4 py-2.5 text-[11px] text-[#c24141] shadow-[0_8px_22px_rgba(148,163,184,0.12)]"
                      aria-live="polite"
                    >
                      <IconAlertCircle size={12} />
                      <span>{speechPlaybackError}</span>
                      {replayVoiceText ? (
                        <button
                          type="button"
                          onClick={() => {
                            void playAssistantSpeech(replayVoiceText ?? "", {
                              continueVoiceSession:
                                voiceSessionActiveRef.current,
                              language: replayVoiceLanguage,
                            });
                          }}
                          className="ml-1 rounded-full border border-[#d6e7f6] px-2 py-1 text-[10px] font-bold text-[#0f5d9f]"
                          aria-label={t(
                            "dashboard.assistant.replayVoiceResponse"
                          )}
                        >
                          {t("dashboard.assistant.replayVoiceResponse")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {isRecordingActive || isTranscribing || liveTranscript ? (
                    <div className="inline-flex max-w-[540px] items-center gap-2 rounded-[18px] bg-white px-4 py-2.5 text-[11px] text-[#5f6f86] shadow-[0_8px_22px_rgba(148,163,184,0.12)]">
                      {isTranscribing ? (
                        <IconLoader2 size={12} className="animate-spin" />
                      ) : (
                        <IconMicrophone size={12} />
                      )}
                      {isTranscribing
                        ? t("dashboard.assistant.transcribing")
                        : liveTranscript || t("dashboard.assistant.listening")}
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} aria-hidden="true" />
                </div>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="z-20 w-full shrink-0 bg-transparent px-2 pb-2 pt-3"
            >
              <div className="mx-auto w-full max-w-[1120px] px-2">
                {shouldShowVoiceAvatar ? (
                  <VoiceAvatarAnimation
                    state={conversationVoiceAvatarState}
                    size="small"
                    alt={t("dashboard.assistant.sphereAlt")}
                    className="mx-auto mb-2"
                  />
                ) : null}
                {isTranscriptionCaptureActive || pendingVoiceReviewBlob ? (
                  <div className="bg-[#f8fbff]/96 flex items-center gap-2 rounded-[28px] border border-[#dbe6f2] px-4 py-2 shadow-[0_10px_30px_rgba(148,163,184,0.18)] backdrop-blur">
                    <div className="flex flex-1 items-center gap-3 overflow-hidden">
                      <span className="text-[11px] font-medium text-[#64748b]">
                        {isTranscriptionCaptureActive
                          ? "Listening..."
                          : "Use transcribed text"}
                      </span>
                      <div className="flex h-8 flex-1 items-center gap-1 overflow-hidden">
                        {Array.from({ length: 32 }).map((_, index) => (
                          <span
                            key={index}
                            className={`w-1 rounded-full bg-[#7aa4d8] ${
                              isTranscriptionCaptureActive
                                ? "animate-pulse"
                                : ""
                            }`}
                            style={{
                              height: `${10 + ((index * 7) % 18)}px`,
                              animationDelay: `${index * 45}ms`,
                              opacity: 0.38 + (index % 6) * 0.1,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={cancelTranscriptionCapture}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dbe6f2] bg-white text-[#64748b] transition hover:bg-[#f4f7fb]"
                      aria-label={t("common.cancel")}
                    >
                      <IconX size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void confirmTranscriptionCapture();
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0f5d9f] text-white transition hover:bg-[#0c518a]"
                      aria-label="Use voice text"
                    >
                      <IconCheck size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="bg-[#f4f9ff]/96 flex items-center gap-2 rounded-[28px] border border-[#cfe0f1] px-3 py-2 shadow-[0_10px_30px_rgba(148,163,184,0.14)] backdrop-blur">
                    <input
                      type="text"
                      value={input}
                      onChange={handleInputChange}
                      data-testid="ai-conversation-input"
                      placeholder={t("dashboard.assistant.typeYourResponse")}
                      className="h-10 flex-1 rounded-full border border-transparent bg-transparent px-3 text-sm text-[#1f2937] outline-none transition-[background-color,box-shadow,border-color] duration-150 placeholder:text-[#95a3b8] focus-visible:outline-none"
                    />
                    {!isVoiceSessionActive ? (
                      <button
                        type="button"
                        onClick={toggleTranscriptionCapture}
                        disabled={
                          isGeneratingSpeech ||
                          isSpeaking ||
                          isSending ||
                          isTranscribing
                        }
                        aria-label={t("dashboard.assistant.toggleMicrophone")}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-[#64748b] transition hover:bg-[#f4f7fb] ${
                          isGeneratingSpeech ||
                          isSpeaking ||
                          isSending ||
                          isTranscribing
                            ? "cursor-not-allowed opacity-40"
                            : ""
                        }`}
                      >
                        <IconMicrophone size={18} />
                      </button>
                    ) : null}
                    {shouldShowSendButton ? (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-[#d7e5f3] bg-[#fbfdff] p-1 shadow-[0_6px_18px_rgba(148,163,184,0.12)]">
                        <button
                          type="submit"
                          data-testid="ai-conversation-send"
                          disabled={
                            isSending ||
                            isVoiceSessionActive ||
                            isRecordingActive ||
                            isTranscribing ||
                            isGeneratingSpeech ||
                            isSpeaking ||
                            !input.trim()
                          }
                          aria-label={t("common.send")}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#0f5d9f] text-white shadow-[0_10px_24px_rgba(15,93,159,0.22)] transition hover:bg-[#0c518a] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {isSending ? (
                            <IconLoader2 size={15} className="animate-spin" />
                          ) : (
                            <Image
                              src={sendIcon}
                              alt={t("common.send")}
                              width={11}
                              height={15}
                              className="h-[15px] w-[11px]"
                            />
                          )}
                        </button>
                      </span>
                    ) : isVoiceSessionActive ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-[#d7e5f3] bg-[#fbfdff] px-1.5 py-1 shadow-[0_6px_18px_rgba(148,163,184,0.12)]">
                        <button
                          type="button"
                          onClick={toggleVoiceSessionMute}
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition ${
                            isVoiceSessionMuted
                              ? "bg-[#eef2f7] text-[#94a3b8]"
                              : "bg-[#196bb1] text-white"
                          }`}
                          aria-label={
                            isVoiceSessionMuted
                              ? "Unmute voice mode"
                              : "Mute voice mode"
                          }
                        >
                          {isVoiceSessionMuted ? (
                            <IconMicrophoneOff size={16} />
                          ) : (
                            <IconMicrophone size={16} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={stopVoiceSession}
                          className="inline-flex h-8 shrink-0 items-center rounded-full bg-[#1f8cff] px-4 text-[11px] font-bold text-white transition hover:bg-[#137cf0]"
                          aria-label={t("dashboard.assistant.stopRecording")}
                        >
                          <span
                            className="mr-2 inline-flex items-center gap-[2px]"
                            aria-hidden="true"
                          >
                            <span className="h-[4px] w-[4px] rounded-full bg-white/90" />
                            <span className="h-[4px] w-[4px] rounded-full bg-white/90" />
                            <span className="h-[4px] w-[4px] rounded-full bg-white/90" />
                          </span>
                          End
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-[#d7e5f3] bg-[#fbfdff] p-1 shadow-[0_6px_18px_rgba(148,163,184,0.12)]">
                        <button
                          type="button"
                          onClick={startVoiceSession}
                          disabled={isSending || isTranscribing}
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#196bb1] text-white transition hover:bg-[#196bb1] ${
                            isSending || isTranscribing
                              ? "cursor-not-allowed opacity-40"
                              : ""
                          }`}
                          aria-label="Start avatar voice mode"
                        >
                          <AvatarVoiceControlGlyph />
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafeSpeakAssistantConversationPage({
  initialMessage,
  initialCategory,
}: {
  initialMessage?: string;
  initialPrefillMessage?: string;
  initialCategory?: AssistantIncidentCategory;
  initialTopic?: DashboardCardFlowId;
  startVoiceMode?: boolean;
}) {
  return (
    <LocalAssistantConversationPage
      initialMessage={initialMessage}
      initialCategory={initialCategory}
    />
  );
}

export { SafeSpeakAssistantConversationPage, SafeSpeakAssistantPage };
