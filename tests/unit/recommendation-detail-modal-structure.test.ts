import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Phase 7.1 — structural source assertions over the shared recommendation
 * detail modal, in the same vein as `triage-single-source.test.ts` (no React
 * component-rendering harness exists in this project). Pins the invariants
 * that are easy to silently regress: per-entity remount keys, the
 * professional image safety validator being used at all, admin-only field
 * names never appearing, and "Report online" staying a structurally
 * separate action from "Use this reporting option".
 */

const MODAL_PATH = join(
  __dirname,
  "../../src/components/dashboard/dashboard-report-submission-pages/recommendation-detail-modal.tsx"
);
const modalSource = readFileSync(MODAL_PATH, "utf8");

test("every DetailBody branch is keyed by entityId, so switching records (even within the same entity type) remounts local state", () => {
  for (const component of [
    "MicrocardDetailBody",
    "RightsContentDetailBody",
    "LegislationSourceDetailBody",
    "SupportOrganisationDetailBody",
    "SupportProfessionalDetailBody",
    "ReportingDestinationDetailBody",
  ]) {
    const pattern = new RegExp(`<${component} key=\\{recommendation\\.entityId\\}`);
    assert.match(modalSource, pattern, `${component} must be keyed by recommendation.entityId`);
  }
});

test("professional images are only ever rendered through the safe public-image validator", () => {
  assert.match(modalSource, /safePublicImageSrc\(/);
  assert.match(modalSource, /function ProfessionalAvatar/);
});

test("no admin-only field name is referenced anywhere in the detail modal", () => {
  for (const forbidden of [
    "internalNotes",
    "verificationNotes",
    "sourceNotes",
    "auditEvent",
    "matchingRuleId",
    "debugScore",
    "createdBy",
    "updatedBy",
  ]) {
    assert.doesNotMatch(modalSource, new RegExp(forbidden));
  }
});

test("'Use this reporting option' (SafeSpeak draft selection) is structurally separate from 'Report online' (external contact action)", () => {
  assert.match(modalSource, /Use this reporting option/);
  assert.match(modalSource, /Report online/);
  assert.match(modalSource, /handleUseThisReportingOption/);
  // The selection handler must write to the canonical report draft through
  // the one shared Phase 7.2 update helper (never a duplicated inline
  // mergeReportFlowDraft call), and never call anything that looks like a
  // submission/contact API.
  assert.match(modalSource, /updateSelectedReportDestination\(\{\s*id: record\.id/);
});

test("selecting a destination never sets consentGranted or a submission id directly in the modal", () => {
  assert.doesNotMatch(modalSource, /consentGranted:\s*true/);
  assert.doesNotMatch(modalSource, /latestSubmissionId:/);
  assert.doesNotMatch(modalSource, /preparedSubmission:/);
});

test("the modal never shows a fabricated success/submitted/contacted state", () => {
  for (const forbidden of [/Report submitted/i, /Destination contacted/i, /Booking confirmed/i]) {
    assert.doesNotMatch(modalSource, forbidden);
  }
});
