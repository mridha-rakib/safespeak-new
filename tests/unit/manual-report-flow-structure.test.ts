import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Phase 8 — structural source assertions over the manual report builder
 * pages, in the same vein as `report-destination-onboarding-structure.test.ts`
 * (no React-component-rendering harness exists in this project). Pins the
 * invariants that would otherwise silently regress: Know/Privacy/Hub are
 * gone from the manual pre-report step array, the Complete stage (shared
 * with Triage) never claims a real submission, and file-content extraction
 * is never claimed to be real.
 */

const DETAILS_PAGE_PATH = join(
  __dirname,
  "../../src/components/dashboard/dashboard-report-submission-pages/report-submission-details-page.tsx"
);
const detailsPageSource = readFileSync(DETAILS_PAGE_PATH, "utf8");

const MANUAL_REVIEW_PAGES_PATH = join(
  __dirname,
  "../../src/components/dashboard/dashboard-report-submission-pages/manual-report-review-pages.tsx"
);
const manualReviewPagesSource = readFileSync(MANUAL_REVIEW_PAGES_PATH, "utf8");

test("the pre-report `steps` array contains exactly language/community/report", () => {
  const match = detailsPageSource.match(/const steps = \[([\s\S]*?)\] as const;/);
  assert.ok(match, "steps array not found");
  const stepsBlock = match![1];

  assert.match(stepsBlock, /id: "language"/);
  assert.match(stepsBlock, /id: "community"/);
  assert.match(stepsBlock, /id: "report"/);
  assert.doesNotMatch(stepsBlock, /id: "information"/);
  assert.doesNotMatch(stepsBlock, /id: "privacy"/);
  assert.doesNotMatch(stepsBlock, /id: "services"/);
});

test("the Incident Report step's visible label is 'Incident Report', not 'Report'", () => {
  assert.match(detailsPageSource, /id: "report", label: "Incident Report"/);
});

test("InformationStep, PrivacyStep, and ServiceHubStep no longer exist in the source", () => {
  for (const removedComponent of ["function InformationStep(", "function PrivacyStep(", "function ServiceHubStep("]) {
    assert.doesNotMatch(detailsPageSource, new RegExp(escapeRegExp(removedComponent)));
  }
});

test("legacy step ids are normalised via router.replace to the report step, never rendered", () => {
  assert.match(detailsPageSource, /requestedStep in LEGACY_MANUAL_DETAILS_STEP_MAP/);
  assert.match(detailsPageSource, /router\.replace\(stepHref\("report", fromTriage\)\)/);
});

test("the manual entry point (fromTriage=false) reaches the Incident Report step from Community, not a Hub step", () => {
  assert.match(detailsPageSource, /fromTriage\s*\?\s*"Back to Triage"\s*:\s*"Back to Community"/);
});

test("file-content extraction is never claimed as real in the Incident Report attachment panel", () => {
  const panelStart = detailsPageSource.indexOf("function EvidenceUploadPanel(");
  assert.ok(panelStart >= 0, "EvidenceUploadPanel not found");
  const panelSource = detailsPageSource.slice(panelStart);

  assert.match(panelSource, /simulated in this prototype/i);
  for (const forbidden of [/OCR (was|has been) performed/i, /transcri(bed|ption) (was|has been) generated/i, /analysed by AI/i]) {
    assert.doesNotMatch(panelSource, forbidden);
  }
});

test("attaching files never shows a server-upload status ('Uploaded') — only local/demo wording", () => {
  const panelStart = detailsPageSource.indexOf("function EvidenceUploadPanel(");
  const panelSource = detailsPageSource.slice(panelStart, panelStart + 4000);
  assert.doesNotMatch(panelSource, /\bUploaded\b/);
});

test("Continue from Incident Report is blocked without narrative or evidence, with a human-readable message", () => {
  assert.match(
    detailsPageSource,
    /Add a short description of what happened, or attach a supported file, before continuing\./
  );
  assert.doesNotMatch(detailsPageSource, /INVALID_REPORT_BODY|incidentNarrative\.min_length/);
});

test("the manual Review stage's 'nothing sent' notice mirrors the Complete stage's honesty", () => {
  assert.match(manualReviewPagesSource, /Nothing has been sent yet\./);
});

test("ManualReviewStage reuses the same removeManualEvidenceItem + mergeReportFlowDraft helpers — no second evidence/draft store", () => {
  const occurrences = manualReviewPagesSource.match(/mergeReportFlowDraft\(/g) ?? [];
  assert.ok(occurrences.length >= 2, "expected mergeReportFlowDraft to be used for both title/summary edits and evidence removal");
  assert.match(manualReviewPagesSource, /removeManualEvidenceItem\(/);
});

test("ManualReportReviewRouter reuses the shared DestinationStage/ConsentStage/CompleteStage components, not duplicates", () => {
  assert.match(manualReviewPagesSource, /import \{[\s\S]*?ConsentStage,[\s\S]*?CompleteStage,[\s\S]*?DestinationStage,[\s\S]*?\} from "\.\/report-review-onboarding-pages"/);
  assert.doesNotMatch(manualReviewPagesSource, /function DestinationStage\(/);
  assert.doesNotMatch(manualReviewPagesSource, /function ConsentStage\(/);
  assert.doesNotMatch(manualReviewPagesSource, /function CompleteStage\(/);
});

/** Phase 8.1 — ManualReportFlowProgress must read the canonical MANUAL_REPORT_FLOW_STAGES, not a second hardcoded label array. */

test("ManualReportFlowProgress imports MANUAL_REPORT_FLOW_STAGES from the canonical flow module", () => {
  assert.match(
    manualReviewPagesSource,
    /import \{\s*\n\s*MANUAL_REPORT_FLOW_STAGES,/
  );
});

test("ManualReportFlowProgress derives its labels/total from MANUAL_REPORT_FLOW_STAGES, not a hardcoded literal array", () => {
  const progressStart = manualReviewPagesSource.indexOf("function ManualReportFlowProgress(");
  assert.ok(progressStart >= 0, "ManualReportFlowProgress not found");
  const progressEnd = manualReviewPagesSource.indexOf("\n}\n", progressStart);
  const progressSource = manualReviewPagesSource.slice(progressStart, progressEnd);

  assert.match(progressSource, /const labels = MANUAL_REPORT_FLOW_STAGES\.map\(/);
  // Regression guard: no second literal 7-item label array like the one Phase 8.1 removed.
  assert.doesNotMatch(progressSource, /const labels = \[\s*\n\s*"Language",/);
});

test("REGRESSION: no duplicate seven-stage label array remains anywhere in manual-report-review-pages.tsx", () => {
  const literalStageArrayOccurrences =
    manualReviewPagesSource.match(/"Language",\s*\n\s*"Community",\s*\n\s*"Incident Report",/g) ?? [];
  assert.equal(literalStageArrayOccurrences.length, 0);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
