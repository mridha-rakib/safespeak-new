import assert from "node:assert/strict";
import test from "node:test";

import type { ContentDomain, ContentRepository } from "../../src/lib/mock/content-repository";
import { resolveSelectedReportDestination } from "../../src/lib/mock/report-destination-resolver";
import type {
  PublishedMockContentManifest,
  PublishedReportingDestination,
} from "../../src/lib/contract/published-content-contract";

const BASE = {
  status: "published" as const,
  isDemo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
};

const DESTINATION: PublishedReportingDestination = {
  ...BASE,
  id: "demo-destination-1",
  name: "Demo Destination",
  destinationType: "police",
  resourceCategoryIds: [],
  incidentTypeIds: [],
  jurisdictions: [],
  australiaWide: true,
  audienceGroups: [],
  languages: [],
  tags: [],
  reportingMethods: ["phone", "online_form"],
  anonymousReporting: "unknown",
  emergencySuitability: "unknown",
};

function fakeRepository(options: { ready?: boolean } = {}): ContentRepository {
  const data: Partial<Record<ContentDomain, unknown[]>> = {
    reportingDestinations: [DESTINATION],
    // A different domain deliberately reusing the same id string, to prove
    // the resolver can never cross-resolve from the wrong namespace.
    supportOrganisations: [{ ...BASE, id: "demo-destination-1", name: "Wrong record" }],
  };
  const manifest: PublishedMockContentManifest = {
    schemaVersion: "1.0.0",
    purpose: "published_content",
    generatedAt: "2026-01-01T00:00:00.000Z",
    sourceApplication: "safespeak-admin",
    recordCounts: {},
    warnings: [],
  };
  return {
    isReady: () => options.ready ?? true,
    getManifest: () => (options.ready === false ? null : manifest),
    getLoadError: () => null,
    list: (domain) => (data[domain] ?? []) as never,
    getById: (domain, id) => ((data[domain] ?? []) as Array<{ id: string }>).find((r) => r.id === id) as never,
  };
}

test("resolveSelectedReportDestination returns not_found when there is no selectedDestinationId", () => {
  assert.deepEqual(resolveSelectedReportDestination(null, fakeRepository()), { status: "not_found" });
  assert.deepEqual(resolveSelectedReportDestination(undefined, fakeRepository()), { status: "not_found" });
  assert.deepEqual(
    resolveSelectedReportDestination({ selectedDestinationId: undefined, selectedDestinationSource: "mock_bundle" }, fakeRepository()),
    { status: "not_found" }
  );
});

test("resolveSelectedReportDestination reports incompatible_source for backend/manual selections — never resolves them itself", () => {
  assert.deepEqual(
    resolveSelectedReportDestination(
      { selectedDestinationId: "demo-destination-1", selectedDestinationSource: "backend" },
      fakeRepository()
    ),
    { status: "incompatible_source" }
  );
  assert.deepEqual(
    resolveSelectedReportDestination(
      { selectedDestinationId: "demo-destination-1", selectedDestinationSource: "manual" },
      fakeRepository()
    ),
    { status: "incompatible_source" }
  );
  assert.deepEqual(
    resolveSelectedReportDestination({ selectedDestinationId: "demo-destination-1", selectedDestinationSource: undefined }, fakeRepository()),
    { status: "incompatible_source" }
  );
});

test("resolveSelectedReportDestination returns unavailable when the repository is not ready", () => {
  assert.deepEqual(
    resolveSelectedReportDestination(
      { selectedDestinationId: "demo-destination-1", selectedDestinationSource: "mock_bundle" },
      fakeRepository({ ready: false })
    ),
    { status: "unavailable" }
  );
});

test("resolveSelectedReportDestination returns not_found for a mock_bundle id that doesn't exist in reportingDestinations, never crossing into another domain", () => {
  // "demo-destination-1" only really exists as a reportingDestinations record here;
  // this proves an id that coincidentally matches a supportOrganisations record
  // can't leak through when searched under a different, wrong id.
  assert.deepEqual(
    resolveSelectedReportDestination(
      { selectedDestinationId: "not-a-real-id", selectedDestinationSource: "mock_bundle" },
      fakeRepository()
    ),
    { status: "not_found" }
  );
});

test("resolveSelectedReportDestination resolves a governed mock destination and preserves tri-state 'unknown' verbatim", () => {
  const result = resolveSelectedReportDestination(
    { selectedDestinationId: "demo-destination-1", selectedDestinationSource: "mock_bundle" },
    fakeRepository()
  );
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.destination.id, "demo-destination-1");
  assert.equal(result.destination.name, "Demo Destination");
  assert.equal(result.destination.anonymousReporting, "unknown");
  assert.equal(result.destination.emergencySuitability, "unknown");
  assert.equal(result.destination.sourceBundleVersion, "1.0.0");
  assert.deepEqual(result.destination.reportingMethods, ["Phone", "Online Form"]);
});
