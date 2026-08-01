"use client";

import type {
  PublishedMicrocard,
  PublishedResourceCategory,
} from "@/lib/contract/published-content-contract";
import { getContentRepository } from "@/lib/mock/content-repository";
import { humanizeKey } from "@/lib/mock/triage-adapters";
import type {
  MicroEducationCategory,
  MicroEducationChip,
  MicroEducationItem,
  MicroEducationTone,
} from "@/lib/microeducation";

/**
 * Phase 8.3 — the dedicated Resource Library / Micro-card browsing pages
 * (`?view=resources`, `?view=microcards`, `?view=microeducation`) used to
 * call `src/lib/microeducation.ts` exclusively — a real-backend API client
 * with no mock fallback. With no backend running in this design/mock
 * phase, every one of those calls failed (a raw `500 Internal Server
 * Error` surfaced to the user), even though the exact same
 * `PublishedMicrocard` records these pages want to browse already exist in
 * the generated bundle and already render correctly inside Triage via
 * `MockContentRepository`.
 *
 * This module is that same source, reshaped to fit the existing
 * `MicroEducationCategory`/`MicroEducationItem` presentational types
 * these pages already render against — so the pages, their layout, and
 * their component tree are unchanged; only *where the data comes from* is
 * different. It does not become a second Microcard system: everything
 * here is a pure, derived view over `MockContentRepository`'s own
 * `microcards`/`resourceCategories` domains (Phase 6/7/8.2's canonical
 * pipeline). `microeducation.ts` itself is untouched and remains the
 * future live-backend path — see `MICROCARD_LIBRARY_MOCK_MODE` below.
 */

/**
 * Matches the module-level boolean-flag convention already established by
 * `REPORT_SUBMISSION_MOCK_MODE` (`report-submission-mock.ts`) rather than
 * inventing a new mock/live switching mechanism. `true` for the current
 * frontend/mock-only phase (no backend exists to switch to yet); flipping
 * this to `false` in a future phase is the entire migration back to
 * `microeducation.ts`'s live API — no call site needs to change shape.
 */
export const MICROCARD_LIBRARY_MOCK_MODE = true;

const ACCENT_TOKEN_STYLES: Record<string, { backgroundColor: string; textColor: string }> = {
  primary: { backgroundColor: "#0f5d9f", textColor: "#ffffff" },
  secondary: { backgroundColor: "#6d28d9", textColor: "#ffffff" },
  success: { backgroundColor: "#0d9488", textColor: "#ffffff" },
  warning: { backgroundColor: "#b45309", textColor: "#ffffff" },
  destructive: { backgroundColor: "#b91c1c", textColor: "#ffffff" },
};
const DEFAULT_ACCENT_STYLE = { backgroundColor: "#334155", textColor: "#ffffff" };

/** Deterministic, based on the card's own `cardType` — never randomised, never a fabricated claim about the content. */
const CARD_TYPE_TONE: Partial<Record<string, MicroEducationTone>> = {
  quick_guidance: "blue",
  safety_tip: "amber",
  rights_summary: "violet",
  next_step: "teal",
  evidence_tip: "green",
  support_option: "orange",
  preparation_tip: "blue",
  other: "teal",
};

function resolveTone(cardType: PublishedMicrocard["cardType"]): MicroEducationTone {
  return (cardType && CARD_TYPE_TONE[cardType]) || "blue";
}

/**
 * Best-effort chip categorisation from the card's own `cardType`/`tags` —
 * the same kind of deterministic, content-derived inference this codebase
 * already uses elsewhere (`inferMicroCardTheme` in this same page module),
 * never a fabricated claim about the incident or the card's subject.
 */
function resolveChips(record: PublishedMicrocard): MicroEducationChip[] {
  const chips = new Set<MicroEducationChip>();
  const haystack = [record.cardType ?? "", ...record.tags]
    .join(" ")
    .toLowerCase();

  if (record.cardType === "rights_summary" || haystack.includes("right")) {
    chips.add("rights");
  }
  if (record.cardType === "safety_tip" || haystack.includes("safety")) {
    chips.add("safety");
  }
  if (haystack.includes("harass")) {
    chips.add("harassment");
  }
  if (haystack.includes("wellbeing") || haystack.includes("mental")) {
    chips.add("mentalHealth");
  }

  return Array.from(chips);
}

function publishedResourceCategoryToCategory(
  record: PublishedResourceCategory,
  cardCount: number
): MicroEducationCategory {
  const accent =
    (record.accentToken ? ACCENT_TOKEN_STYLES[record.accentToken] : undefined) ??
    DEFAULT_ACCENT_STYLE;

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    backgroundColor: accent.backgroundColor,
    textColor: accent.textColor,
    iconName: record.iconKey,
    status: "published",
    sortOrder: record.displayOrder,
    cardCount,
  };
}

function publishedMicrocardToItem(
  record: PublishedMicrocard,
  category: PublishedResourceCategory | undefined
): MicroEducationItem {
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    // No real reading-time field exists on the source record — a fixed,
    // clearly-a-default label, not a per-card fabricated estimate.
    readTimeLabel: "4 min read",
    tag: category?.name ?? (record.cardType ? humanizeKey(record.cardType) : "Guidance"),
    cta: "Read more",
    detailHeading: record.title,
    detailSummary: record.summary,
    detailBody: record.body ?? record.summary,
    detailTakeaway: record.summary,
    imageAlt: record.title,
    categoryId: record.resourceCategoryId,
    // Not mapped to a full `MicroEducationCategory` here (that type also
    // carries `cardCount`/`sortOrder`, which have no single-category
    // meaning at this call site) — `tag` above already carries the
    // readable category name, and callers that read `.category` for
    // colour (`getMicroCardSurface`) already fall back to `tone` when it's
    // absent.
    tone: resolveTone(record.cardType),
    chips: resolveChips(record),
    // PublishedMicrocard has no duration/format dimension — "quick"/"guide"
    // are structural defaults (every mock-sourced card behaves the same
    // way: a short read, no video/interactive variant exists in this
    // domain), not a claim about any specific card's real content.
    duration: "quick",
    format: "guide",
    sortOrder: record.displayOrder,
    views: 0,
  };
}

function readyRepositoryOrNull() {
  const repository = getContentRepository();
  return repository.isReady() ? repository : null;
}

/** True once the repository has finished loading but failed — a real "can't load" state, not "still loading". */
export function isMicrocardLibraryUnavailable(): boolean {
  const repository = getContentRepository();
  return !repository.isReady() && repository.getLoadError() !== null;
}

export function getMockMicrocardCategories(): MicroEducationCategory[] {
  const repository = readyRepositoryOrNull();
  if (!repository) return [];

  const microcards = repository.list("microcards");

  return repository
    .list("resourceCategories")
    .map((category) =>
      publishedResourceCategoryToCategory(
        category,
        microcards.filter((card) => card.resourceCategoryId === category.id).length
      )
    )
    .filter((category) => (category.cardCount ?? 0) > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getMockMicrocardsByCategory(categoryId: string): MicroEducationItem[] {
  const repository = readyRepositoryOrNull();
  if (!repository) return [];

  const category = repository.getById("resourceCategories", categoryId);

  return repository
    .list("microcards")
    .filter((card) => card.resourceCategoryId === categoryId)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((card) => publishedMicrocardToItem(card, category));
}

/** Flat, all-published-cards list — used by pages with no category grouping (`ResourcesPage`, `MicroEducationPage`). */
export function getMockMicrocards(): MicroEducationItem[] {
  const repository = readyRepositoryOrNull();
  if (!repository) return [];

  const categoriesById = new Map(
    repository.list("resourceCategories").map((category) => [category.id, category])
  );

  return repository
    .list("microcards")
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((card) =>
      publishedMicrocardToItem(
        card,
        card.resourceCategoryId ? categoriesById.get(card.resourceCategoryId) : undefined
      )
    );
}

export function getMockMicrocardById(id: string): MicroEducationItem | undefined {
  const repository = readyRepositoryOrNull();
  if (!repository) return undefined;

  const record = repository.getById("microcards", id);
  if (!record) return undefined;

  const category = record.resourceCategoryId
    ? repository.getById("resourceCategories", record.resourceCategoryId)
    : undefined;

  return publishedMicrocardToItem(record, category);
}
