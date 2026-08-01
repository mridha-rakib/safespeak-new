import assert from "node:assert/strict";
import test from "node:test";

import {
  addManualEvidenceItem,
  computeEvidenceFingerprint,
  getManualEvidenceItems,
  hasManualEvidenceFingerprint,
  removeManualEvidenceItem,
  updateManualEvidenceItem,
  type ManualEvidenceItem,
} from "../../src/lib/report-evidence";

/**
 * Phase 8 — local/demo evidence store for the manual report builder.
 * Mirrors the `window.sessionStorage` polyfill pattern from
 * `report-flow-destination-selection.test.ts`. Pins: metadata persists
 * (never a raw `File`/blob URL), rapid duplicate adds don't create
 * duplicate evidence records, and remove only removes the targeted item.
 */

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const memoryStorage = new MemoryStorage();

(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: memoryStorage,
};

test.beforeEach(() => {
  memoryStorage.clear();
});

function makeItem(overrides: Partial<ManualEvidenceItem> = {}): ManualEvidenceItem {
  return {
    id: "evidence-1",
    fingerprint: "statement.pdf|204800|0|pdf",
    fileName: "statement.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    sizeBytes: 204800,
    category: "document",
    status: "ready",
    demoNote: "Attached as supporting evidence.",
    addedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

test("no evidence store means an empty list, never a crash", () => {
  assert.deepEqual(getManualEvidenceItems(), []);
});

test("added items are retrievable, and only metadata is persisted (no File/blob fields)", () => {
  addManualEvidenceItem(makeItem());
  const items = getManualEvidenceItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].fileName, "statement.pdf");
  assert.ok(!("previewUrl" in items[0]));
});

test("adding the same id twice does not create a duplicate record (rapid double-add safety)", () => {
  addManualEvidenceItem(makeItem());
  addManualEvidenceItem(makeItem());

  assert.equal(getManualEvidenceItems().length, 1);
});

test("getManualEvidenceItems(ids) filters to only the requested, still-present ids", () => {
  addManualEvidenceItem(makeItem({ id: "evidence-1" }));
  addManualEvidenceItem(makeItem({ id: "evidence-2", fileName: "photo.jpg" }));

  const filtered = getManualEvidenceItems(["evidence-2", "stale-id"]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "evidence-2");
});

test("removing one item leaves the others untouched", () => {
  addManualEvidenceItem(makeItem({ id: "evidence-1" }));
  addManualEvidenceItem(makeItem({ id: "evidence-2", fileName: "photo.jpg" }));

  removeManualEvidenceItem("evidence-1");
  const items = getManualEvidenceItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "evidence-2");
});

test("updateManualEvidenceItem patches only the targeted item", () => {
  addManualEvidenceItem(makeItem({ id: "evidence-1", status: "demo_processing" }));
  addManualEvidenceItem(makeItem({ id: "evidence-2", status: "demo_processing" }));

  updateManualEvidenceItem("evidence-1", { status: "ready" });
  const items = getManualEvidenceItems();

  assert.equal(items.find((item) => item.id === "evidence-1")?.status, "ready");
  assert.equal(items.find((item) => item.id === "evidence-2")?.status, "demo_processing");
});

test("a corrupted store value degrades to an empty list rather than throwing", () => {
  memoryStorage.setItem("safespeak_report_manual_evidence", "{not json");
  assert.deepEqual(getManualEvidenceItems(), []);
});

/** Phase 8.1 — deterministic evidence fingerprint + duplicate handling. */

test("computeEvidenceFingerprint is deterministic for identical file metadata", () => {
  const fileLike = { name: "statement.pdf", size: 1024, lastModified: 12345 };
  assert.equal(
    computeEvidenceFingerprint(fileLike, "pdf"),
    computeEvidenceFingerprint({ ...fileLike }, "pdf")
  );
});

test("computeEvidenceFingerprint distinguishes files that merely share a name", () => {
  const a = computeEvidenceFingerprint({ name: "photo.jpg", size: 1000, lastModified: 1 }, "jpg");
  const b = computeEvidenceFingerprint({ name: "photo.jpg", size: 2000, lastModified: 1 }, "jpg");
  const c = computeEvidenceFingerprint({ name: "photo.jpg", size: 1000, lastModified: 2 }, "jpg");
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("hasManualEvidenceFingerprint reflects the current store, not the random id", () => {
  assert.equal(hasManualEvidenceFingerprint("statement.pdf|204800|0|pdf"), false);
  addManualEvidenceItem(makeItem());
  assert.equal(hasManualEvidenceFingerprint("statement.pdf|204800|0|pdf"), true);
  assert.equal(hasManualEvidenceFingerprint("other.pdf|1|1|pdf"), false);
});

test("removing an item frees its fingerprint for a deliberate re-add", () => {
  addManualEvidenceItem(makeItem());
  assert.equal(hasManualEvidenceFingerprint("statement.pdf|204800|0|pdf"), true);

  removeManualEvidenceItem("evidence-1");
  assert.equal(hasManualEvidenceFingerprint("statement.pdf|204800|0|pdf"), false);

  addManualEvidenceItem(makeItem({ id: "evidence-1-readded" }));
  assert.equal(hasManualEvidenceFingerprint("statement.pdf|204800|0|pdf"), true);
  assert.equal(getManualEvidenceItems().length, 1);
});

test("two different files that happen to share a fingerprint-irrelevant id remain distinct records", () => {
  addManualEvidenceItem(
    makeItem({ id: "a", fingerprint: "one.txt|10|1|txt", fileName: "one.txt" })
  );
  addManualEvidenceItem(
    makeItem({ id: "b", fingerprint: "two.txt|20|2|txt", fileName: "two.txt" })
  );

  assert.equal(getManualEvidenceItems().length, 2);
});
