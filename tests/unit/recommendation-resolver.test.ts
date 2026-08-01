import assert from "node:assert/strict";
import test from "node:test";

import type { ContentDomain, ContentRepository } from "../../src/lib/mock/content-repository";
import { resolveRecommendation } from "../../src/lib/mock/recommendation-resolver";
import type {
  PublishedMicrocard,
  PublishedMockContentBundle,
  PublishedMockContentManifest,
  PublishedRightsContent,
} from "../../src/lib/contract/published-content-contract";

const BASE = {
  status: "published" as const,
  isDemo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
};

const MICROCARD: PublishedMicrocard = {
  ...BASE,
  id: "mc-1",
  title: "Microcard title",
  summary: "Microcard summary",
  tags: [],
  incidentTypeIds: [],
  priority: "normal",
  displayOrder: 0,
  relatedLegislationIds: [],
  relatedSupportOrganisationIds: [],
  cta: { type: "none" },
};

const RIGHTS_CONTENT: PublishedRightsContent = {
  ...BASE,
  id: "rc-1",
  title: "Rights title",
  summary: "Rights summary",
  relatedLegislationIds: [],
  incidentTypeIds: [],
  tags: [],
  resourceCategoryIds: [],
  relatedSupportOrganisationIds: [],
  priority: "normal",
};

function fakeRepository(options: { ready?: boolean } = {}): ContentRepository {
  const data: Partial<Record<ContentDomain, unknown[]>> = {
    microcards: [MICROCARD],
    rightsContent: [RIGHTS_CONTENT],
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

test("resolveRecommendation returns unsupported_entity_type for an entity type outside the canonical 6", () => {
  const result = resolveRecommendation("something_else", "any-id", [], fakeRepository());
  assert.equal(result.status, "unsupported_entity_type");
});

test("resolveRecommendation returns not_found when the repository is not ready", () => {
  const result = resolveRecommendation("microcard", "mc-1", [], fakeRepository({ ready: false }));
  assert.equal(result.status, "not_found");
});

test("resolveRecommendation returns not_found for a missing id, never throwing", () => {
  const result = resolveRecommendation("microcard", "does-not-exist", [], fakeRepository());
  assert.equal(result.status, "not_found");
});

test("resolveRecommendation resolves a microcard id only from the microcards domain, never crossing into rightsContent", () => {
  // "rc-1" only exists in rightsContent — asking for it as a microcard must not
  // accidentally resolve a same-named id from a different domain.
  const result = resolveRecommendation("microcard", "rc-1", [], fakeRepository());
  assert.equal(result.status, "not_found");
});

test("resolveRecommendation returns the typed record, entityType, matchReasons, and sourceBundleVersion when found", () => {
  const result = resolveRecommendation("microcard", "mc-1", ["Matched on topic."], fakeRepository());
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.recommendation.entityType, "microcard");
  assert.equal(result.recommendation.entityId, "mc-1");
  assert.equal(result.recommendation.record.title, "Microcard title");
  assert.deepEqual(result.recommendation.matchReasons, ["Matched on topic."]);
  assert.equal(result.recommendation.sourceBundleVersion, "1.0.0");
});

test("resolveRecommendation defaults matchReasons to an empty array when omitted", () => {
  const result = resolveRecommendation("rights_content", "rc-1", undefined, fakeRepository());
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.deepEqual(result.recommendation.matchReasons, []);
});

test("resolveRecommendation reports 'unknown' as the sourceBundleVersion when no manifest is available", () => {
  const repository: ContentRepository = {
    ...fakeRepository(),
    getManifest: () => null,
  };
  const result = resolveRecommendation("microcard", "mc-1", [], repository);
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.recommendation.sourceBundleVersion, "unknown");
});
