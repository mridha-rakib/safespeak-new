import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Phase 6.1 — single-source Triage pipeline + live/mock separation. There is
 * no React component-rendering harness in this project (all existing unit
 * tests are plain `node:test` over pure logic — see the other files in this
 * directory), so — consistent with the same pattern already used for the
 * Knowledge & Legislation tab regression tests in safespeak-admin — these
 * are structural source assertions over the actual Triage page file, pinned
 * to the exact patterns the implementation relies on. The full rendering
 * behaviour is additionally covered by the focused Playwright smoke test
 * (`tests/e2e/assistant-to-triage-five-topics.spec.ts`).
 */

const PAGE_PATH = join(
  __dirname,
  "../../src/components/dashboard/dashboard-report-submission-pages/report-submission-support-page.tsx"
);
const pageSource = readFileSync(PAGE_PATH, "utf8");

test("the legacy static demoTriage.resourceGroups recommendation block is no longer rendered", () => {
  assert.doesNotMatch(pageSource, /demoTriage\.resourceGroups\.map/);
});

test("the legacy static demoTriage.supportOptions recommendation block is no longer rendered", () => {
  assert.doesNotMatch(pageSource, /demoTriage\.supportOptions\.map/);
  assert.doesNotMatch(pageSource, /demoTriage\.supportOptions\.length/);
});

test("the governed mock pipeline (mockTriage) is the only recommendation source rendered for resourceGroups/supportOptions/advocates/reportingDestinations", () => {
  assert.match(pageSource, /mockTriage\.resourceGroups\.map/);
  assert.match(pageSource, /mockTriage\.supportOptions/);
  assert.match(pageSource, /mockTriage\.advocates/);
  assert.match(pageSource, /mockTriage\.reportingDestinations/);
});

test("independently-required emergency guidance is gated on the shared no-session boundary, not on demoTriage or a governed match", () => {
  assert.match(pageSource, /shouldShowNoSessionTriage\s*&&\s*emergencyOptions\.length > 0/);
});

test("emergencyOptions is derived independently of the governed matching result (filters buildDemoSupportOptions() directly, not mockTriage)", () => {
  const emergencyBlockMatch = pageSource.match(/const emergencyOptions = useMemo\(([\s\S]*?)\n {2}\);/);
  assert.ok(emergencyBlockMatch, "emergencyOptions useMemo block not found");
  assert.match(emergencyBlockMatch![1], /buildDemoSupportOptions\(\)\.filter/);
  assert.doesNotMatch(emergencyBlockMatch![1], /mockTriage/);
});

test("shouldShowMockTriage and shouldShowSupportOptions are mutually exclusive by construction (!triage vs Boolean(triage))", () => {
  assert.match(pageSource, /shouldShowNoSessionTriage\s*=\s*!loading\s*&&\s*!pendingConsentRequirement\s*&&\s*!triage/);
  assert.match(pageSource, /shouldShowSupportOptions\s*=\s*\n?\s*!loading\s*&&\s*!pendingConsentRequirement\s*&&\s*Boolean\(triage\)/);
  assert.match(pageSource, /shouldShowMockTriage\s*=\s*shouldShowNoSessionTriage\s*&&\s*mockTriage\?\.status\s*===\s*"success"/);
});

test("mockTriage is explicitly cleared to null when the live-backend session branch is taken", () => {
  const liveSessionBranch = pageSource.split('if (!conversationSessionId) {')[1] ?? "";
  const setMockTriageNullIndex = liveSessionBranch.indexOf("setMockTriage(null)");
  const catchAllIndex = liveSessionBranch.indexOf("try {");
  assert.ok(setMockTriageNullIndex !== -1, "setMockTriage(null) not found after the no-session branch");
  assert.ok(
    catchAllIndex === -1 || setMockTriageNullIndex < catchAllIndex,
    "setMockTriage(null) must be cleared before the live-backend fetch begins"
  );
});

test("no admin-only field name leaks into the Triage page source (internalNotes, verificationNotes, sourceNotes, auditEvent)", () => {
  for (const forbidden of ["internalNotes", "verificationNotes", "sourceNotes", "auditEvent", "createdBy", "updatedBy"]) {
    assert.doesNotMatch(pageSource, new RegExp(forbidden));
  }
});
