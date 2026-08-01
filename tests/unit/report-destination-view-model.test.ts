import assert from "node:assert/strict";
import test from "node:test";

import { reportingDestinationToViewModel } from "../../src/lib/mock/report-destination-view-model";
import type { PublishedReportingDestination } from "../../src/lib/contract/published-content-contract";

const BASE = {
  status: "published" as const,
  isDemo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
};

test("reportingDestinationToViewModel falls back to Australia-wide only when jurisdictions is empty and australiaWide is true", () => {
  const record: PublishedReportingDestination = {
    ...BASE,
    id: "dest-1",
    name: "Destination",
    destinationType: "police",
    resourceCategoryIds: [],
    incidentTypeIds: [],
    jurisdictions: [],
    australiaWide: true,
    audienceGroups: [],
    languages: [],
    tags: [],
    reportingMethods: [],
    anonymousReporting: "unknown",
    emergencySuitability: "unknown",
  };
  assert.deepEqual(reportingDestinationToViewModel(record, "1.0.0").jurisdictions, ["Australia-wide"]);

  const withJurisdictions = reportingDestinationToViewModel(
    { ...record, jurisdictions: ["nsw", "vic"], australiaWide: true },
    "1.0.0"
  );
  assert.deepEqual(withJurisdictions.jurisdictions, ["nsw", "vic"]);

  const withNeither = reportingDestinationToViewModel({ ...record, australiaWide: false }, "1.0.0");
  assert.deepEqual(withNeither.jurisdictions, []);
});

test("reportingDestinationToViewModel preserves anonymousReporting/emergencySuitability verbatim, including 'unknown'", () => {
  const record: PublishedReportingDestination = {
    ...BASE,
    id: "dest-1",
    name: "Destination",
    destinationType: "police",
    resourceCategoryIds: [],
    incidentTypeIds: [],
    jurisdictions: [],
    australiaWide: true,
    audienceGroups: [],
    languages: [],
    tags: [],
    reportingMethods: [],
    anonymousReporting: "unknown",
    emergencySuitability: "yes",
  };
  const viewModel = reportingDestinationToViewModel(record, "1.0.0");
  assert.equal(viewModel.anonymousReporting, "unknown");
  assert.equal(viewModel.emergencySuitability, "yes");
});

test("reportingDestinationToViewModel only builds contact actions from valid source data", () => {
  const record: PublishedReportingDestination = {
    ...BASE,
    id: "dest-1",
    name: "Destination",
    destinationType: "police",
    resourceCategoryIds: [],
    incidentTypeIds: [],
    jurisdictions: [],
    australiaWide: true,
    audienceGroups: [],
    languages: [],
    tags: [],
    reportingMethods: [],
    anonymousReporting: "unknown",
    emergencySuitability: "unknown",
  };
  assert.deepEqual(reportingDestinationToViewModel(record, "1.0.0").contactActions, []);

  const withPhone = reportingDestinationToViewModel({ ...record, phone: "1800 737 732" }, "1.0.0");
  assert.equal(withPhone.contactActions.length, 1);
  assert.equal(withPhone.contactActions[0]?.kind, "call");
});

test("reportingDestinationToViewModel carries the passed-in sourceBundleVersion", () => {
  const record: PublishedReportingDestination = {
    ...BASE,
    id: "dest-1",
    name: "Destination",
    destinationType: "police",
    resourceCategoryIds: [],
    incidentTypeIds: [],
    jurisdictions: [],
    australiaWide: false,
    audienceGroups: [],
    languages: [],
    tags: [],
    reportingMethods: [],
    anonymousReporting: "unknown",
    emergencySuitability: "unknown",
  };
  assert.equal(reportingDestinationToViewModel(record, "2.0.0").sourceBundleVersion, "2.0.0");
});
