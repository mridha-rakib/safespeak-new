import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultReportFlowDraft,
  getResolvedReportFlowDraft,
  saveReportFlowDraft,
  updateSelectedReportDestination,
} from "../../src/lib/report-flow";

/**
 * Phase 7.2 — `updateSelectedReportDestination()` is the one shared helper
 * both Triage's "Use this reporting option" and the onboarding Destination
 * step use. Exercised against an in-memory `window.sessionStorage`
 * polyfill, matching the pattern established in
 * `report-flow-destination-selection.test.ts` (Phase 7.1) — see that file
 * for why the polyfill is required under `node:test`.
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

test("stores the stable id, public name, and source", () => {
  const draft = updateSelectedReportDestination({ id: "dest-1", name: "Destination One", source: "mock_bundle" });
  assert.equal(draft.selectedDestinationId, "dest-1");
  assert.equal(draft.selectedDestinationName, "Destination One");
  assert.equal(draft.selectedDestinationSource, "mock_bundle");
});

test("preserves title, summary, evidence, and safety state already on the draft", () => {
  saveReportFlowDraft({
    ...defaultReportFlowDraft,
    title: "My report",
    summary: "What happened",
    safetyStatus: "safe",
    evidenceIds: ["evidence-1", "evidence-2"],
  });

  const draft = updateSelectedReportDestination({ id: "dest-1", name: "Destination One", source: "mock_bundle" });

  assert.equal(draft.title, "My report");
  assert.equal(draft.summary, "What happened");
  assert.equal(draft.safetyStatus, "safe");
  assert.deepEqual(draft.evidenceIds, ["evidence-1", "evidence-2"]);
});

test("selecting the same destination again is idempotent and does not clear existing consent/submission state", () => {
  updateSelectedReportDestination({ id: "dest-1", name: "Destination One", source: "mock_bundle" });
  const seeded = getResolvedReportFlowDraft();
  assert.ok(seeded);
  saveReportFlowDraft({
    ...seeded,
    consentGranted: true,
    consentGrantedAt: "2026-01-01T00:00:00.000Z",
    consentMode: "local_only",
  });

  const draft = updateSelectedReportDestination({ id: "dest-1", name: "Destination One", source: "mock_bundle" });

  assert.equal(draft.selectedDestinationId, "dest-1");
  assert.equal(draft.consentGranted, true);
  assert.equal(draft.consentMode, "local_only");
});

test("selecting a different destination replaces only destination fields and invalidates consent/prepared submission", () => {
  updateSelectedReportDestination({ id: "dest-1", name: "Destination One", source: "mock_bundle" });
  const seeded = getResolvedReportFlowDraft();
  assert.ok(seeded);
  saveReportFlowDraft({
    ...seeded,
    title: "My report",
    evidenceIds: ["evidence-1"],
    consentGranted: true,
    consentGrantedAt: "2026-01-01T00:00:00.000Z",
    consentMode: "local_only",
    latestSubmissionId: "submission-1",
    preparedSubmission: {
      destinationId: "dest-1",
      destinationName: "Destination One",
      channel: "email",
      status: "ready_to_share",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });

  const draft = updateSelectedReportDestination({ id: "dest-2", name: "Destination Two", source: "mock_bundle" });

  assert.equal(draft.selectedDestinationId, "dest-2");
  assert.equal(draft.selectedDestinationName, "Destination Two");
  // Consent/submission invalidated — a prior consent for destination 1 must never silently apply to destination 2.
  assert.equal(draft.consentGranted, undefined);
  assert.equal(draft.consentGrantedAt, undefined);
  assert.equal(draft.consentMode, undefined);
  assert.equal(draft.latestSubmissionId, undefined);
  assert.equal(draft.preparedSubmission, undefined);
  // Unrelated report data untouched.
  assert.equal(draft.title, "My report");
  assert.deepEqual(draft.evidenceIds, ["evidence-1"]);
});

test("never creates a second draft — always resolves through the one canonical sessionStorage key", () => {
  updateSelectedReportDestination({ id: "dest-1", name: "Destination One", source: "mock_bundle" });
  updateSelectedReportDestination({ id: "dest-2", name: "Destination Two", source: "mock_bundle" });
  const resolved = getResolvedReportFlowDraft();
  assert.equal(resolved?.selectedDestinationId, "dest-2");
});

test("never sets a submission id or marks the report submitted by itself", () => {
  const draft = updateSelectedReportDestination({ id: "dest-1", name: "Destination One", source: "mock_bundle" });
  assert.equal(draft.latestSubmissionId, undefined);
  assert.equal(draft.preparedSubmission, undefined);
});
