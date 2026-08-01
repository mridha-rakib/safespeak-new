import assert from "node:assert/strict";
import test from "node:test";

import {
  MANUAL_EVIDENCE_LIMITS,
  classifyEvidenceFile,
  processEvidenceFileForDemo,
  validateEvidenceFile,
} from "../../src/lib/demo-evidence-processing";

/**
 * Phase 8 — `DemoEvidenceProcessingService`. These tests pin the two
 * non-negotiable properties: (1) every accepted file category degrades
 * safely and truthfully (no fabricated OCR/transcription/AI claims), and
 * (2) validation reasons are always human-readable, never a raw code.
 *
 * A minimal `FileReader` polyfill is installed because Node has global
 * `File`/`Blob` (since v20) but no `FileReader` (DOM-only) — without it,
 * the plain-text safe-read path in `demo-evidence-processing.ts` would be
 * untestable here and would silently degrade instead of being exercised.
 */
class FakeFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText(file: File): void {
    file
      .text()
      .then((text) => {
        this.result = text;
        this.onload?.();
      })
      .catch(() => {
        this.onerror?.();
      });
  }
}

(globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;

function makeFile(name: string, content: string, type = ""): File {
  return new File([content], name, { type });
}

test("classifyEvidenceFile recognises every required document/image/video extension", () => {
  const cases: Array<[string, "document" | "image" | "video"]> = [
    ["report.pdf", "document"],
    ["notes.txt", "document"],
    ["statement.doc", "document"],
    ["statement.docx", "document"],
    ["photo.jpg", "image"],
    ["photo.jpeg", "image"],
    ["photo.png", "image"],
    ["photo.webp", "image"],
    ["clip.mp4", "video"],
    ["clip.mov", "video"],
    ["clip.webm", "video"],
  ];

  for (const [fileName, expectedCategory] of cases) {
    const file = makeFile(fileName, "content");
    const classification = classifyEvidenceFile(file);
    assert.ok(classification, `expected ${fileName} to classify`);
    assert.equal(classification!.category, expectedCategory);
  }
});

test("classifyEvidenceFile rejects unsupported extensions instead of guessing", () => {
  assert.equal(classifyEvidenceFile(makeFile("archive.zip", "x")), null);
  assert.equal(classifyEvidenceFile(makeFile("noextension", "x")), null);
  assert.equal(classifyEvidenceFile(makeFile("audio.mp3", "x")), null);
});

test("validateEvidenceFile rejects a zero-byte file with a human-readable reason", () => {
  const result = validateEvidenceFile(makeFile("empty.txt", ""), 0);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /empty/i);
    assert.doesNotMatch(result.reason, /_|[A-Z_]{4,}/);
  }
});

test("validateEvidenceFile rejects a file over the demo size limit", () => {
  const bigContent = "a".repeat(10);
  const file = makeFile("big.txt", bigContent);
  Object.defineProperty(file, "size", {
    value: MANUAL_EVIDENCE_LIMITS.maxFileSizeBytes + 1,
  });

  const result = validateEvidenceFile(file, 0);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /25 MB/);
  }
});

test("validateEvidenceFile rejects once the demo file-count limit is reached", () => {
  const result = validateEvidenceFile(
    makeFile("one-more.txt", "content"),
    MANUAL_EVIDENCE_LIMITS.maxFileCount
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, new RegExp(String(MANUAL_EVIDENCE_LIMITS.maxFileCount)));
  }
});

test("validateEvidenceFile rejects an unsupported file type human-readably", () => {
  const result = validateEvidenceFile(makeFile("audio.mp3", "content"), 0);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /supported file type/i);
  }
});

test("validateEvidenceFile accepts a normal supported file", () => {
  const result = validateEvidenceFile(makeFile("notes.txt", "hello"), 0);
  assert.equal(result.ok, true);
});

test("processEvidenceFileForDemo reads .txt content safely and preserves it exactly", async () => {
  const file = makeFile("notes.txt", "Line one\nLine two — unicode ✓");
  const result = await processEvidenceFileForDemo(file, "document");

  assert.equal(result.status, "ready");
  assert.equal(result.extractedText, "Line one\nLine two — unicode ✓");
  assert.doesNotMatch(result.demoNote, /OCR|transcri/i);
});

test("processEvidenceFileForDemo never claims real extraction for PDF/DOC/DOCX", async () => {
  for (const name of ["report.pdf", "statement.doc", "statement.docx"]) {
    const file = makeFile(name, "binary-ish content");
    const result = await processEvidenceFileForDemo(file, "document");

    assert.equal(result.status, "ready");
    assert.match(result.demoNote, /simulated/i);
    assert.equal(result.extractedText, undefined);
  }
});

test("processEvidenceFileForDemo never claims real OCR for images", async () => {
  const file = makeFile("photo.jpg", "binary", "image/jpeg");
  const result = await processEvidenceFileForDemo(file, "image");

  assert.equal(result.status, "ready");
  assert.doesNotMatch(result.demoNote, /\bOCR performed\b/i);
  assert.match(result.demoNote, /No visual analysis or OCR/i);
});

test("processEvidenceFileForDemo never claims real transcription for videos", async () => {
  const file = makeFile("clip.mp4", "binary", "video/mp4");
  const result = await processEvidenceFileForDemo(file, "video");

  assert.equal(result.status, "ready");
  assert.match(result.demoNote, /No transcription or content analysis/i);
});

test("processEvidenceFileForDemo degrades safely (no crash) when a .txt file can't be read", async () => {
  (globalThis as unknown as { FileReader: unknown }).FileReader = undefined;
  const file = makeFile("notes.txt", "content");
  const result = await processEvidenceFileForDemo(file, "document");

  assert.equal(result.status, "needs_attention");
  assert.equal(result.extractedText, undefined);
  (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
});
