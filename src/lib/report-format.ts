/**
 * Phase 8 — centralised human-readable formatting utilities for the manual
 * report builder (Incident Report / Review / Consent / Complete). Keeping
 * these in one place means file sizes, statuses, and machine-style values
 * are never independently re-formatted (and inconsistently) across stages.
 */

/** Formats a byte count as a readable size (bytes / KB / MB / GB). Never renders a raw byte count to the user. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Turns a snake_case/kebab-case machine value into a readable label, e.g. "domestic_violence" -> "Domestic violence". */
export function formatMachineValue(value: string | null | undefined): string {
  if (!value) {
    return "Not provided";
  }

  const spaced = value.replace(/[_-]+/g, " ").trim();

  if (!spaced) {
    return "Not provided";
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Readable local date/time, or a clear "not provided" fallback — never a raw ISO timestamp. */
export function formatReadableDateTime(
  value: string | null | undefined
): string {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not provided";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Readable local date only (for free-text/user-entered incident dates that may already be a plain date string). */
export function formatReadableDate(value: string | null | undefined): string {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    // Not a parseable date (e.g. free text like "last Tuesday") — show the user's own words rather than "Invalid Date".
    return value;
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date
  );
}

export type EvidenceStatus =
  | "selected"
  | "demo_processing"
  | "ready"
  | "needs_attention"
  | "unsupported"
  | "removed";

const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  selected: "Attached locally",
  demo_processing: "Preparing demo preview",
  ready: "Ready for review",
  needs_attention: "Needs attention",
  unsupported: "Unsupported file type",
  removed: "Removed",
};

export function formatEvidenceStatus(status: EvidenceStatus): string {
  return EVIDENCE_STATUS_LABELS[status] ?? "Attached to this draft";
}

/**
 * Phase 8.1 — whether the *original local file* for a piece of evidence is
 * still available in this browser tab, or only its metadata survived (e.g.
 * after a refresh, since raw `File` objects are never persisted to
 * sessionStorage). Two states only ("smallest compatible extension" per the
 * Phase 8.1 spec) — a third "metadata_only vs needs_reselection" distinction
 * would carry no different user action, so it's collapsed into one.
 */
export type EvidenceAvailability = "available_this_session" | "needs_reselection";

const EVIDENCE_AVAILABILITY_NOTES: Record<EvidenceAvailability, string | null> = {
  available_this_session: null,
  needs_reselection:
    "The attachment details are saved in this demo, but the original local file must be selected again after a browser refresh.",
};

/** Returns the truthful refresh/reselection note, or null when the file is still available (never shown in that case). */
export function formatEvidenceAvailabilityNote(
  availability: EvidenceAvailability
): string | null {
  return EVIDENCE_AVAILABILITY_NOTES[availability];
}

export type EvidenceCategory = "document" | "image" | "video";

const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  document: "Document",
  image: "Image",
  video: "Video",
};

/** Readable file-type label from a category + extension, e.g. "PDF document", never a raw MIME type. */
export function formatEvidenceFileType(
  category: EvidenceCategory,
  extension: string
): string {
  const upperExtension = extension.toUpperCase();

  if (category === "document") {
    return `${upperExtension} document`;
  }

  return `${upperExtension} ${EVIDENCE_CATEGORY_LABELS[category].toLowerCase()}`;
}
