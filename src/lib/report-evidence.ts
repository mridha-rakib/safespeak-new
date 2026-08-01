"use client";

import type { EvidenceCategory, EvidenceStatus } from "@/lib/report-format";

/**
 * Phase 8 — local/demo evidence store for the manual report builder.
 *
 * This is deliberately separate from `evidence-client.ts` (which calls a
 * real backend evidence vault) — the manual flow never uploads anything to
 * a server. It mirrors the *shape* of a real evidence list (items keyed by
 * id, associated with the current report draft) so the mock/live boundary
 * stays clean: `ReportFlowDraft.evidenceIds` holds the ids, this store
 * holds the metadata those ids point to.
 *
 * Only metadata is persisted (never raw `File` objects, never blob/object
 * URLs — those are revoked and are meaningless after a refresh). Preview
 * URLs are kept in React state only, for the current page lifetime.
 */

const MANUAL_EVIDENCE_STORAGE_KEY = "safespeak_report_manual_evidence";

export type ManualEvidenceItem = {
  id: string;
  /**
   * Phase 8.1 — a deterministic fingerprint of the file's own metadata
   * (name/size/lastModified/extension), independent of `id` (which
   * includes a random suffix so re-adding after removal is never blocked).
   * Used only for duplicate detection — never shown to the user.
   */
  fingerprint: string;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  category: EvidenceCategory;
  status: EvidenceStatus;
  demoNote: string;
  extractedText?: string;
  addedAt: string;
};

/**
 * Deterministic per-file fingerprint for duplicate detection. Deliberately
 * excludes any random/generated value (unlike `id`) so the same file
 * selected twice — in one batch or across separate selections — is always
 * recognised, while two different files that merely share a name are not.
 */
export function computeEvidenceFingerprint(
  file: Pick<File, "name" | "size" | "lastModified">,
  extension: string
): string {
  return `${file.name}|${file.size}|${file.lastModified}|${extension}`;
}

/** True when a file with this fingerprint is already recorded (and not yet removed). */
export function hasManualEvidenceFingerprint(fingerprint: string): boolean {
  return readStore().some((item) => item.fingerprint === fingerprint);
}

function readStore(): ManualEvidenceItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.sessionStorage.getItem(MANUAL_EVIDENCE_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ManualEvidenceItem[]) : [];
  } catch {
    window.sessionStorage.removeItem(MANUAL_EVIDENCE_STORAGE_KEY);
    return [];
  }
}

function writeStore(items: ManualEvidenceItem[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    MANUAL_EVIDENCE_STORAGE_KEY,
    JSON.stringify(items)
  );
}

export function getManualEvidenceItems(
  ids?: readonly string[]
): ManualEvidenceItem[] {
  const items = readStore();

  if (!ids) {
    return items;
  }

  const idSet = new Set(ids);
  return items.filter((item) => idSet.has(item.id));
}

/** Adds an item if its id isn't already present (idempotent — guards against duplicate evidence from rapid double-adds). */
export function addManualEvidenceItem(item: ManualEvidenceItem): void {
  const items = readStore();

  if (items.some((existing) => existing.id === item.id)) {
    return;
  }

  writeStore([...items, item]);
}

export function removeManualEvidenceItem(id: string): void {
  writeStore(readStore().filter((item) => item.id !== id));
}

export function updateManualEvidenceItem(
  id: string,
  patch: Partial<Omit<ManualEvidenceItem, "id">>
): void {
  writeStore(
    readStore().map((item) => (item.id === id ? { ...item, ...patch } : item))
  );
}
