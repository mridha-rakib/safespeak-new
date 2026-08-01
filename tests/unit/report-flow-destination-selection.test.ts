import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultReportFlowDraft,
  getResolvedReportFlowDraft,
  mergeReportFlowDraft,
  saveReportFlowDraft,
} from "../../src/lib/report-flow";

/**
 * Phase 7.1 — exercises the real `report-flow.ts` draft merge/read
 * functions (the canonical report-draft owner) against an in-memory
 * `window.sessionStorage` polyfill, since `node:test` has no DOM/window by
 * default. Every guard in `report-flow.ts` (`typeof window === "undefined"`)
 * is written to degrade to a no-op under Node, so without this polyfill the
 * functions would silently never persist anything and these tests would be
 * unable to prove merge/idempotency/preservation behaviour at all.
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
  location: { search: "" },
};

test.beforeEach(() => {
  memoryStorage.clear();
});

test("viewing (no merge call at all) never creates or updates a draft", () => {
  assert.equal(getResolvedReportFlowDraft(), null);
});

test("selecting a destination stores only the stable id/name/source, defaulting consent/submission to unset", () => {
  const draft = mergeReportFlowDraft({
    selectedDestinationId: "dest-1",
    selectedDestinationName: "Test Destination",
    selectedDestinationSource: "manual",
  });

  assert.equal(draft.selectedDestinationId, "dest-1");
  assert.equal(draft.selectedDestinationName, "Test Destination");
  assert.equal(draft.selectedDestinationSource, "manual");
  assert.equal(draft.consentGranted, undefined);
  assert.equal(draft.latestSubmissionId, undefined);
});

test("selecting a destination preserves all pre-existing draft fields (title, evidenceIds, safetyStatus)", () => {
  saveReportFlowDraft({
    ...defaultReportFlowDraft,
    title: "Existing report title",
    summary: "Existing summary",
    evidenceIds: ["evidence-1", "evidence-2"],
    safetyStatus: "safe",
  });

  const draft = mergeReportFlowDraft({
    selectedDestinationId: "dest-1",
    selectedDestinationName: "Test Destination",
    selectedDestinationSource: "manual",
  });

  assert.equal(draft.title, "Existing report title");
  assert.equal(draft.summary, "Existing summary");
  assert.equal(draft.safetyStatus, "safe");
  assert.deepEqual(draft.evidenceIds, ["evidence-1", "evidence-2"]);
  assert.equal(draft.selectedDestinationId, "dest-1");
});

test("selecting the same destination twice is idempotent — no duplicate state, values unchanged", () => {
  const first = mergeReportFlowDraft({
    selectedDestinationId: "dest-1",
    selectedDestinationName: "Test Destination",
    selectedDestinationSource: "manual",
  });
  const second = mergeReportFlowDraft({
    selectedDestinationId: "dest-1",
    selectedDestinationName: "Test Destination",
    selectedDestinationSource: "manual",
  });

  assert.equal(first.selectedDestinationId, second.selectedDestinationId);
  assert.equal(first.selectedDestinationName, second.selectedDestinationName);
  const resolved = getResolvedReportFlowDraft();
  assert.equal(resolved?.selectedDestinationId, "dest-1");
});

test("selecting a different destination replaces the previous selection without discarding unrelated draft data", () => {
  saveReportFlowDraft({ ...defaultReportFlowDraft, title: "My report" });
  mergeReportFlowDraft({
    selectedDestinationId: "dest-1",
    selectedDestinationName: "Destination A",
    selectedDestinationSource: "manual",
  });
  const replaced = mergeReportFlowDraft({
    selectedDestinationId: "dest-2",
    selectedDestinationName: "Destination B",
    selectedDestinationSource: "manual",
  });

  assert.equal(replaced.selectedDestinationId, "dest-2");
  assert.equal(replaced.selectedDestinationName, "Destination B");
  assert.equal(replaced.title, "My report");
});

test("selecting a destination never sets consentGranted or latestSubmissionId — selection is not submission", () => {
  saveReportFlowDraft({ ...defaultReportFlowDraft, consentGranted: false });
  const draft = mergeReportFlowDraft({
    selectedDestinationId: "dest-1",
    selectedDestinationName: "Test Destination",
    selectedDestinationSource: "manual",
  });

  assert.equal(draft.consentGranted, false);
  assert.equal(draft.latestSubmissionId, undefined);
  assert.equal(draft.preparedSubmission, undefined);
});

test("a draft's evidenceIds are never silently dropped by an unrelated merge", () => {
  saveReportFlowDraft({
    ...defaultReportFlowDraft,
    evidenceIds: ["evidence-1"],
  });
  mergeReportFlowDraft({ jurisdiction: "nsw" });
  const resolved = getResolvedReportFlowDraft();
  assert.deepEqual(resolved?.evidenceIds, ["evidence-1"]);
});
