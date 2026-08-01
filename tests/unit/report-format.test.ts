import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEvidenceFileType,
  formatEvidenceStatus,
  formatFileSize,
  formatMachineValue,
  formatReadableDate,
  formatReadableDateTime,
} from "../../src/lib/report-format";

/**
 * Phase 8 — centralised human-readable formatting utilities. These pin the
 * "never render a raw machine value" rule from the Phase 8 spec: byte
 * counts, snake_case values, ISO timestamps, and internal status strings
 * must always come out through one of these functions.
 */

test("formatFileSize renders bytes/KB/MB/GB and never a raw byte count for anything above 1KB", () => {
  assert.equal(formatFileSize(500), "500 B");
  assert.equal(formatFileSize(2048), "2.0 KB");
  assert.equal(formatFileSize(2_500_000), "2.4 MB");
  assert.equal(formatFileSize(3_221_225_472), "3.0 GB");
});

test("formatFileSize degrades to a readable fallback for invalid input, never NaN or a raw number", () => {
  assert.equal(formatFileSize(-1), "Unknown size");
  assert.equal(formatFileSize(Number.NaN), "Unknown size");
});

test("formatMachineValue turns snake_case/kebab-case into a readable label", () => {
  assert.equal(formatMachineValue("domestic_violence"), "Domestic violence");
  assert.equal(formatMachineValue("not-verified"), "Not verified");
  assert.equal(formatMachineValue(""), "Not provided");
  assert.equal(formatMachineValue(undefined), "Not provided");
});

test("formatReadableDateTime never renders a raw ISO timestamp", () => {
  const formatted = formatReadableDateTime("2026-07-30T13:00:00.000Z");
  assert.doesNotMatch(formatted, /T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  assert.equal(formatReadableDateTime(null), "Not provided");
  assert.equal(formatReadableDateTime("not-a-date"), "Not provided");
});

test("formatReadableDate preserves free-text user-entered dates instead of showing 'Invalid Date'", () => {
  assert.equal(formatReadableDate("last Tuesday"), "last Tuesday");
  assert.equal(formatReadableDate(null), "Not provided");
});

test("formatEvidenceStatus maps every internal status to a readable label, never the raw key", () => {
  assert.equal(formatEvidenceStatus("selected"), "Attached locally");
  assert.equal(formatEvidenceStatus("demo_processing"), "Preparing demo preview");
  assert.equal(formatEvidenceStatus("ready"), "Ready for review");
  assert.equal(formatEvidenceStatus("needs_attention"), "Needs attention");
  assert.equal(formatEvidenceStatus("unsupported"), "Unsupported file type");
  assert.equal(formatEvidenceStatus("removed"), "Removed");
});

test("formatEvidenceFileType never renders a raw MIME type", () => {
  assert.equal(formatEvidenceFileType("document", "pdf"), "PDF document");
  assert.equal(formatEvidenceFileType("image", "jpg"), "JPG image");
  assert.equal(formatEvidenceFileType("video", "mp4"), "MP4 video");
});
