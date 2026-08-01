"use client";

import type { EvidenceCategory } from "@/lib/report-format";

/**
 * Phase 8 — `DemoEvidenceProcessingService`. This is the one place that
 * decides whether an attached file is accepted, what category it belongs
 * to, and what safe demo/local text (if any) can be shown for it.
 *
 * This is explicitly NOT real OCR, real transcription, or real AI
 * extraction. For plain-text files it safely reads the file's own text
 * (something a browser can do natively via `FileReader`). For every other
 * supported type (PDF, DOC, DOCX, image, video) it returns a clearly
 * labelled demo note and never invents incident facts, quotations, or
 * summaries from the file name or contents.
 */

export const MANUAL_EVIDENCE_LIMITS = {
  maxFileCount: 8,
  maxFileSizeBytes: 25 * 1024 * 1024, // 25 MB per file, shown to the user before they select files.
} as const;

type AcceptedExtension =
  | "pdf"
  | "txt"
  | "doc"
  | "docx"
  | "jpg"
  | "jpeg"
  | "png"
  | "webp"
  | "mp4"
  | "mov"
  | "webm";

const EXTENSION_CATEGORY: Record<AcceptedExtension, EvidenceCategory> = {
  pdf: "document",
  txt: "document",
  doc: "document",
  docx: "document",
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  mp4: "video",
  mov: "video",
  webm: "video",
};

/** Readable accepted-format text shown before the user selects files. */
export const MANUAL_EVIDENCE_ACCEPTED_FORMATS_LABEL =
  "Documents (PDF, TXT, DOC, DOCX), images (JPG, PNG, WEBP), or videos (MP4, MOV, WEBM)";

export const MANUAL_EVIDENCE_ACCEPT_ATTRIBUTE =
  ".pdf,.txt,.doc,.docx,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm";

function getExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

export function classifyEvidenceFile(
  file: File
): { category: EvidenceCategory; extension: string } | null {
  const extension = getExtension(file.name);

  if (!(extension in EXTENSION_CATEGORY)) {
    return null;
  }

  return {
    category: EXTENSION_CATEGORY[extension as AcceptedExtension],
    extension,
  };
}

export type EvidenceValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Per-file validation, human-readable reasons only — never a raw error code. */
export function validateEvidenceFile(
  file: File,
  currentCount: number
): EvidenceValidationResult {
  if (currentCount >= MANUAL_EVIDENCE_LIMITS.maxFileCount) {
    return {
      ok: false,
      reason: `You can attach up to ${MANUAL_EVIDENCE_LIMITS.maxFileCount} files in this demo. Remove a file before adding another.`,
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      reason: `${file.name} appears to be empty and can't be attached.`,
    };
  }

  if (file.size > MANUAL_EVIDENCE_LIMITS.maxFileSizeBytes) {
    return {
      ok: false,
      reason: `${file.name} is larger than the 25 MB demo limit for this prototype.`,
    };
  }

  if (!classifyEvidenceFile(file)) {
    return {
      ok: false,
      reason: `${file.name} isn't a supported file type in this demo. Accepted formats: ${MANUAL_EVIDENCE_ACCEPTED_FORMATS_LABEL}.`,
    };
  }

  return { ok: true };
}

export type DemoProcessingResult = {
  status: "ready" | "needs_attention";
  demoNote: string;
  extractedText?: string;
};

const MAX_SAFE_TEXT_READ_CHARS = 4000;

function readTextFileSafely(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof FileReader === "undefined") {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      resolve(result);
    };

    try {
      reader.readAsText(file);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Produces safe, truthful demo processing output for one file. Never claims
 * real OCR, transcription, or AI analysis occurred.
 */
export async function processEvidenceFileForDemo(
  file: File,
  category: EvidenceCategory
): Promise<DemoProcessingResult> {
  if (category === "document" && getExtension(file.name) === "txt") {
    const text = await readTextFileSafely(file);

    if (text === null) {
      return {
        status: "needs_attention",
        demoNote:
          "This text file could not be read safely in your browser. It is still attached as supporting evidence.",
      };
    }

    const trimmed = text.trim();

    if (!trimmed) {
      return {
        status: "ready",
        demoNote:
          "This text file is empty. It has been attached as supporting evidence.",
      };
    }

    return {
      status: "ready",
      demoNote:
        "Text was read directly from this file in your browser. Review it and copy anything relevant into your incident description.",
      extractedText: trimmed.slice(0, MAX_SAFE_TEXT_READ_CHARS),
    };
  }

  if (category === "document") {
    return {
      status: "ready",
      demoNote:
        "This document has been attached as supporting evidence. File-content extraction is simulated in this prototype — nothing has been read from inside the file. Review and add any important details to your description before continuing.",
    };
  }

  if (category === "image") {
    return {
      status: "ready",
      demoNote:
        "This image has been attached as supporting evidence. No visual analysis or OCR has been performed in this prototype.",
    };
  }

  return {
    status: "ready",
    demoNote:
      "This video has been attached as supporting evidence. No transcription or content analysis has been performed in this prototype.",
  };
}
