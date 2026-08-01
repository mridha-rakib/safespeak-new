import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Phase 7.2 — structural source assertions over the onboarding report-flow
 * stages (DestinationStage/ConsentStage/CompleteStage), in the same vein as
 * `triage-single-source.test.ts` and `recommendation-detail-modal-structure.test.ts`
 * (no React component-rendering harness exists in this project). Pins the
 * invariants that are easy to silently regress: the shared update helper is
 * used everywhere a destination is selected (never a duplicated inline
 * merge), the governed mock destination is never spliced into the same
 * array as backend/manual options, and the mock-only completion state never
 * claims a real submission occurred.
 */

const PAGE_PATH = join(
  __dirname,
  "../../src/components/dashboard/dashboard-report-submission-pages/report-review-onboarding-pages.tsx"
);
const pageSource = readFileSync(PAGE_PATH, "utf8");

test("both destination-selection paths (backend/manual list, and the Triage-selected mock card) use the one shared update helper", () => {
  assert.match(pageSource, /function handleSelect\(option: DestinationOption\): void \{\s*\n\s*setSelectedId\(option\.id\);\s*\n\s*updateSelectedReportDestination/);
  assert.match(pageSource, /function handleSelectTriageDestination\(\): void \{/);
  assert.match(pageSource, /updateSelectedReportDestination\(\{\s*\n\s*id: triageResolution\.destination\.id/);
});

test("the resolved governed mock destination is never appended into the backend/manual `destinations` state array", () => {
  assert.doesNotMatch(pageSource, /setDestinations\(\[[^\]]*triageResolution/);
  assert.doesNotMatch(pageSource, /\[\.\.\.destinations,\s*triageResolution/);
});

test("DestinationStage, ConsentStage, and CompleteStage all resolve the destination through resolveSelectedReportDestination, not ad hoc field reads", () => {
  const occurrences = pageSource.match(/resolveSelectedReportDestination\(/g) ?? [];
  assert.ok(occurrences.length >= 3, `expected resolveSelectedReportDestination to be used in all 3 stages, found ${occurrences.length} call sites`);
});

test("a stale/unresolvable mock destination selection shows a safe reselection state, never a crash or silent fallback to a different destination", () => {
  assert.match(pageSource, /no longer available/i);
  assert.match(pageSource, /Choose another reporting option/);
});

test("the mock-only Complete stage never claims a real submission occurred", () => {
  const start = pageSource.indexOf("function CompleteStage(");
  const end = pageSource.indexOf("function ReportReviewOnboardingRouter(");
  assert.ok(start >= 0 && end > start, "CompleteStage function not found");
  const completeStageSource = pageSource.slice(start, end);
  for (const forbidden of [
    /has been submitted/i,
    /report (was|has been) sent/i,
    /successfully (submitted|sent|delivered)/i,
    /has been (delivered|received)/i,
  ]) {
    assert.doesNotMatch(completeStageSource, forbidden);
  }
  assert.match(completeStageSource, /has not shared, submitted, or sent/i);
});

test("selecting a destination is never conflated with granting consent — consentGranted is only set inside ConsentStage", () => {
  const destinationStageMatch = pageSource.match(/function DestinationStage[\s\S]*?\n\/\*\* Stage 5/);
  assert.ok(destinationStageMatch, "DestinationStage function not found");
  assert.doesNotMatch(destinationStageMatch![0], /consentGranted/);
});
