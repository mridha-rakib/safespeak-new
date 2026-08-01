import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_MANUAL_DETAILS_STEP_MAP,
  MANUAL_REPORT_FLOW_STAGES,
  MANUAL_REVIEW_ONBOARDING_STEP_ORDER,
  MANUAL_REVIEW_ONBOARDING_STEPS,
  REPORT_REVIEW_ONBOARDING_STEP_ORDER,
  REPORT_REVIEW_ONBOARDING_STEPS,
  isManualReviewOnboardingStep,
  normalizeManualOnboardingStep,
} from "../../src/lib/report-review-onboarding";

/**
 * Phase 8 — pins the manual report flow's shape and its separation from the
 * (unchanged) Assistant/Triage onboarding flow. `REPORT_REVIEW_ONBOARDING_*`
 * must remain exactly as it was pre-Phase-8 (still six stages, including
 * "next"/"preview") — that's the regression guard proving Triage wasn't
 * touched. `MANUAL_REVIEW_ONBOARDING_*` is the new, separate four-stage
 * config the manual flow uses instead.
 */

test("the manual report flow has exactly seven visible stages, in order", () => {
  assert.equal(MANUAL_REPORT_FLOW_STAGES.length, 7);
  assert.deepEqual(
    MANUAL_REPORT_FLOW_STAGES.map((stage) => stage.label),
    [
      "Language",
      "Community",
      "Incident Report",
      "Review",
      "Destination",
      "Consent",
      "Complete",
    ]
  );
});

test("Know, Privacy, and Hub are not among the manual flow's seven stages", () => {
  const labels = MANUAL_REPORT_FLOW_STAGES.map((stage) => stage.label);
  for (const removed of ["Know", "Privacy", "Hub", "Services"]) {
    assert.ok(!labels.includes(removed as never), `${removed} should not be a manual flow stage`);
  }
});

test("every old Know/Privacy/Hub/Services step id normalises to the Incident Report step, not a crash", () => {
  assert.equal(LEGACY_MANUAL_DETAILS_STEP_MAP.know, "report");
  assert.equal(LEGACY_MANUAL_DETAILS_STEP_MAP.information, "report");
  assert.equal(LEGACY_MANUAL_DETAILS_STEP_MAP.privacy, "report");
  assert.equal(LEGACY_MANUAL_DETAILS_STEP_MAP.hub, "report");
  assert.equal(LEGACY_MANUAL_DETAILS_STEP_MAP.services, "report");
});

test("the manual review-onboarding config has exactly review/destination/consent/complete — no next/preview", () => {
  const ids = Object.keys(MANUAL_REVIEW_ONBOARDING_STEPS).sort();
  assert.deepEqual(ids, ["complete", "consent", "destination", "review"]);
  assert.equal(MANUAL_REVIEW_ONBOARDING_STEP_ORDER.length, 4);
});

test("the manual review stage flows straight to Destination (no 'next'/'preview' sub-stage in between)", () => {
  assert.equal(MANUAL_REVIEW_ONBOARDING_STEPS.review.next, "destination");
  assert.equal(MANUAL_REVIEW_ONBOARDING_STEPS.review.previous, null);
});

test("Destination/Consent/Complete keep the same gating rules as the Triage config (requiresDestination/requiresConsent)", () => {
  assert.equal(
    MANUAL_REVIEW_ONBOARDING_STEPS.consent.requiresDestination,
    REPORT_REVIEW_ONBOARDING_STEPS.consent.requiresDestination
  );
  assert.equal(
    MANUAL_REVIEW_ONBOARDING_STEPS.complete.requiresConsent,
    REPORT_REVIEW_ONBOARDING_STEPS.complete.requiresConsent
  );
});

test("REGRESSION: the Triage onboarding config is untouched — still six stages including next/preview", () => {
  const ids = Object.keys(REPORT_REVIEW_ONBOARDING_STEPS).sort();
  assert.deepEqual(ids, ["complete", "consent", "destination", "next", "preview", "review"]);
  assert.equal(REPORT_REVIEW_ONBOARDING_STEP_ORDER.length, 6);
  assert.equal(REPORT_REVIEW_ONBOARDING_STEPS.review.next, "next");
});

test("isManualReviewOnboardingStep accepts only the four manual step ids", () => {
  assert.equal(isManualReviewOnboardingStep("review"), true);
  assert.equal(isManualReviewOnboardingStep("destination"), true);
  assert.equal(isManualReviewOnboardingStep("consent"), true);
  assert.equal(isManualReviewOnboardingStep("complete"), true);
  assert.equal(isManualReviewOnboardingStep("next"), false);
  assert.equal(isManualReviewOnboardingStep("preview"), false);
  assert.equal(isManualReviewOnboardingStep("information"), false);
  assert.equal(isManualReviewOnboardingStep(null), false);
});

test("normalizeManualOnboardingStep maps Triage-only 'next'/'preview' to 'review', preserving in-flow navigation", () => {
  assert.equal(normalizeManualOnboardingStep("next"), "review");
  assert.equal(normalizeManualOnboardingStep("preview"), "review");
  assert.equal(normalizeManualOnboardingStep("review"), "review");
  assert.equal(normalizeManualOnboardingStep("destination"), "destination");
  assert.equal(normalizeManualOnboardingStep("consent"), "consent");
  assert.equal(normalizeManualOnboardingStep("complete"), "complete");
});

test("normalizeManualOnboardingStep returns null for unrelated step values (e.g. pre-report step ids)", () => {
  assert.equal(normalizeManualOnboardingStep("language"), null);
  assert.equal(normalizeManualOnboardingStep("community"), null);
  assert.equal(normalizeManualOnboardingStep("report"), null);
  assert.equal(normalizeManualOnboardingStep("information"), null);
  assert.equal(normalizeManualOnboardingStep("garbage"), null);
});
