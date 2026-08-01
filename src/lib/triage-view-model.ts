// Shared Triage view-model types and a pure normaliser that derives the
// complete Triage dataset from the existing Assistant Conversation ->
// Triage handoff (AssistantTriageSource.timeline). This intentionally does
// not add a new persisted field or storage key: it reads the same
// concernType/urgencyLevel/safetyStatus entries already written by the
// demo Assistant Conversation flow.

import type { AssistantTimeline } from "@/lib/assistant-conversation";
import { REPORT_START_FROM_TRIAGE_HREF } from "@/lib/mock/safe-actions";
import {
  EMERGENCY_NUMBER,
  SUPPORT_NUMBER_DIAL,
  SUPPORT_NUMBER_DISPLAY,
} from "@/lib/safety";

export type TriagePrimaryActionKind =
  | "build_report"
  | "learn_more"
  | "find_support"
  | "save_privately"
  | "finish_for_now";

export type TriagePrimaryAction = {
  id: string;
  kind: TriagePrimaryActionKind;
  label: string;
  description: string;
  ctaLabel: string;
  href?: string;
};

export type TriageResourceItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  actionLabel: string;
  href?: string;
  phoneDial?: string;
  phoneDisplay?: string;
  iconKey?: string;
  /** Phase 7 — only populated for governed mock-bundle matches; plain-language reason strings, never a score/rule id. */
  matchReasons?: string[];
};

export type TriageResourceGroup = {
  id: string;
  heading: string;
  items: TriageResourceItem[];
};

export type TriageRecommendationPriority =
  | "recommended"
  | "also_available"
  | "emergency_only";

export type TriageSupportOption = {
  id: string;
  name: string;
  category: string;
  description: string;
  recommendationLabel?: string;
  recommendationPriority: TriageRecommendationPriority;
  phoneDisplay?: string;
  phoneDial?: string;
  url?: string;
  jurisdiction?: string;
  availability?: string;
  reason?: string;
  /** Phase 7 — only populated for governed mock-bundle matches; plain-language reason strings, never a score/rule id. */
  matchReasons?: string[];
  emergencyOnly: boolean;
  order: number;
};

export type TriageIncidentSummary = {
  concernType: string;
  urgencyLevel?: string;
  safetyStatus?: string;
};

export type TriageOverview = {
  incident: TriageIncidentSummary;
  introEyebrow: string;
  introHeading: string;
  introBody: string;
  controlNote: string;
  primaryActions: TriagePrimaryAction[];
  resourceGroups: TriageResourceGroup[];
  supportOptions: TriageSupportOption[];
};

/**
 * Builds the complete demo Triage dataset from the timeline fields already
 * saved by the Assistant Conversation handoff. Returns null when the
 * timeline has no recognised incident concern, so callers can fall back to
 * the existing generic Triage presentation instead of showing an empty or
 * fabricated section.
 */
export function buildDemoTriageOverview(
  timeline: AssistantTimeline
): TriageOverview | null {
  const concernType = timeline.concernType?.trim();

  if (!concernType) {
    return null;
  }

  const urgencyLevel = timeline.urgencyLevel?.trim() || undefined;
  const safetyStatus = timeline.safetyStatus?.trim() || undefined;
  const incidentLabel = concernType.charAt(0).toLowerCase() + concernType.slice(1);

  return {
    incident: { concernType, urgencyLevel, safetyStatus },
    introEyebrow: "You're in control",
    introHeading: "What would you like to do next?",
    introBody: `Based on what you shared about ${incidentLabel}, here are some relevant next-step options. Nothing is sent anywhere without your permission — you can explore these options, come back later, or finish for now.`,
    controlNote:
      "SafeSpeak does not call, email, report, or share anything automatically. Opening a service, calling a number, or continuing to a report only happens if you choose that next step.",
    primaryActions: [
      {
        id: "build-report",
        kind: "build_report",
        label: "Build a report",
        description:
          "Continue into the report builder using the information you already shared. Nothing is submitted automatically.",
        ctaLabel: "Continue",
        href: REPORT_START_FROM_TRIAGE_HREF,
      },
      {
        id: "learn-more",
        kind: "learn_more",
        label: "Learn more",
        description:
          "Read plain-language information about your rights and the options available to you.",
        ctaLabel: "Open Know Your Rights",
        href: "/dashboard?view=resources",
      },
      {
        id: "find-support",
        kind: "find_support",
        label: "Find support",
        description:
          "Explore support organisations that may help, including free and confidential services.",
        ctaLabel: "Open Support",
        href: "/dashboard?view=smartdialler",
      },
      {
        id: "save-privately",
        kind: "save_privately",
        label: "Save privately",
        description:
          "Keep this conversation saved in this browser session so you can come back to it.",
        ctaLabel: "Save",
      },
      {
        id: "finish-for-now",
        kind: "finish_for_now",
        label: "Finish for now",
        description:
          "Leave this screen safely. Nothing is submitted, and your saved session is kept.",
        ctaLabel: "Exit",
        href: "/dashboard",
      },
    ],
    resourceGroups: buildStandardTriageResourceGroups(),
    supportOptions: buildDemoSupportOptions(),
  };
}

/**
 * The canonical "Get Support" / "Know Your Rights" resource groups. These
 * are not incident-specific, so callers that don't have a full Triage
 * timeline (e.g. the guided report-review onboarding's "Choose your next
 * step" stage) can still show them without fabricating incident data.
 */
export function buildStandardTriageResourceGroups(): TriageResourceGroup[] {
  return [
    {
      id: "get-support",
      heading: "Get Support",
      items: [
        {
          id: "13yarn",
          title: "13YARN",
          category: "Crisis support",
          description:
            "Crisis support for Aboriginal and Torres Strait Islander people.",
          actionLabel: "Open",
          phoneDial: "139276",
          phoneDisplay: "13 92 76",
          iconKey: "crisis",
        },
        {
          id: "1800respect-resource",
          title: SUPPORT_NUMBER_DISPLAY,
          category: "National support service",
          description:
            "National sexual assault, domestic and family violence counselling service.",
          actionLabel: "Open",
          phoneDial: SUPPORT_NUMBER_DIAL,
          phoneDisplay: "1800 737 732",
          iconKey: "national",
        },
        {
          id: "beyond-blue",
          title: "Beyond Blue",
          category: "Mental health and wellbeing",
          description:
            "Information and support for anxiety, depression, and emotional wellbeing.",
          actionLabel: "Open",
          phoneDial: "1300224636",
          phoneDisplay: "1300 22 4636",
          iconKey: "wellbeing",
        },
      ],
    },
    {
      id: "know-your-rights",
      heading: "Know Your Rights",
      items: [
        {
          id: "workplace-rights",
          title: "Workplace rights",
          category: "Know Your Rights",
          description:
            "Discrimination, harassment, and unfair treatment at work.",
          actionLabel: "Open",
          href: "/dashboard?view=resources",
          iconKey: "workplace",
        },
        {
          id: "racism-discrimination",
          title: "Racism and discrimination",
          category: "Know Your Rights",
          description: "Racial vilification and discriminatory treatment.",
          actionLabel: "Open",
          href: "/dashboard?view=resources",
          iconKey: "discrimination",
        },
        {
          id: "online-abuse",
          title: "Online abuse",
          category: "Know Your Rights",
          description:
            "Cyberbullying, image-based abuse, and online harassment.",
          actionLabel: "Open",
          href: "/dashboard?view=resources",
          iconKey: "online",
        },
      ],
    },
  ];
}

/**
 * The canonical demo tailored-support/service directory. Shared by the
 * Triage page and the report-builder step so both surfaces show the same
 * service records instead of maintaining duplicate lists.
 */
export function buildDemoSupportOptions(): TriageSupportOption[] {
  return [
    {
      id: "nsw-police-assistance",
      name: "Police Assistance Line",
      category: "Police or non-emergency reporting",
      description:
        "Non-urgent police reporting for assault when you are safe and there is no immediate danger.",
      recommendationLabel: "Recommended for you",
      recommendationPriority: "recommended",
      phoneDisplay: "131 444",
      phoneDial: "131444",
      jurisdiction: "New South Wales",
      emergencyOnly: false,
      order: 1,
    },
    {
      id: "victims-services-nsw",
      name: "Victims Services NSW",
      category: "Victims support",
      description:
        "Counselling, support coordination, and victims-support information.",
      recommendationLabel: "Recommended for you",
      recommendationPriority: "recommended",
      phoneDisplay: "1800 633 063",
      phoneDial: "1800633063",
      jurisdiction: "New South Wales",
      emergencyOnly: false,
      order: 2,
    },
    {
      id: "healthdirect",
      name: "Healthdirect",
      category: "Medical or health advice",
      description:
        "24/7 health advice when you are injured or uncertain whether to seek medical care.",
      recommendationLabel: "Also available",
      recommendationPriority: "also_available",
      phoneDisplay: "1800 022 222",
      phoneDial: "1800022222",
      availability: "24 hours, 7 days",
      emergencyOnly: false,
      order: 3,
    },
    {
      id: "triple-zero",
      name: "Triple Zero (000)",
      category: "Emergency service",
      description:
        "Police, ambulance, or fire support for immediate danger only.",
      recommendationLabel: "Recommended only when immediate danger applies",
      recommendationPriority: "emergency_only",
      phoneDisplay: EMERGENCY_NUMBER,
      phoneDial: EMERGENCY_NUMBER,
      emergencyOnly: true,
      order: 4,
    },
  ];
}
