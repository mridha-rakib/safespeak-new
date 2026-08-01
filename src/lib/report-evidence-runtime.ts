"use client";

/**
 * Phase 8.1 — in-memory (never persisted) registry of the actual `File`
 * objects behind currently-attached manual evidence, plus their lazily
 * created preview object URLs.
 *
 * This is intentionally NOT sessionStorage-backed: raw `File` objects and
 * `URL.createObjectURL()` results cannot be serialised, and persisting an
 * object URL string would be actively misleading (it becomes a dead
 * reference the instant the page reloads). Living in module scope means it
 * survives client-side navigation between manual-flow steps (Next.js App
 * Router keeps JS module state alive across `router.push`) but is correctly
 * and automatically wiped on a hard refresh/new tab — which is exactly the
 * "available_this_session vs needs_reselection" distinction this phase
 * requires, with no extra bookkeeping needed to detect a refresh.
 */

type LiveEntry = {
  file: File;
  objectUrl?: string;
};

const liveEvidenceFiles = new Map<string, LiveEntry>();

export function registerLiveEvidenceFile(id: string, file: File): void {
  liveEvidenceFiles.set(id, { file });
}

export function hasLiveEvidenceFile(id: string): boolean {
  return liveEvidenceFiles.has(id);
}

export function getLiveEvidenceFile(id: string): File | undefined {
  return liveEvidenceFiles.get(id)?.file;
}

/** Lazily creates (and caches) an object URL for previewing the live file. Returns undefined once the file is no longer live. */
export function getOrCreateLiveEvidenceObjectUrl(id: string): string | undefined {
  const entry = liveEvidenceFiles.get(id);

  if (!entry) {
    return undefined;
  }

  if (!entry.objectUrl) {
    entry.objectUrl = URL.createObjectURL(entry.file);
  }

  return entry.objectUrl;
}

/** Revokes any created object URL and forgets the live file — call on remove. */
export function revokeLiveEvidenceFile(id: string): void {
  const entry = liveEvidenceFiles.get(id);

  if (entry?.objectUrl) {
    URL.revokeObjectURL(entry.objectUrl);
  }

  liveEvidenceFiles.delete(id);
}

/** Revokes every live object URL and clears the registry — used by Quick Exit. */
export function revokeAllLiveEvidenceFiles(): void {
  for (const id of liveEvidenceFiles.keys()) {
    revokeLiveEvidenceFile(id);
  }
}
