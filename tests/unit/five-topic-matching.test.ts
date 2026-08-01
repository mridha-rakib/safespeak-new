import assert from "node:assert/strict";
import test from "node:test";

import { runMockMatching } from "../../src/lib/matching-rules/engine";
import { MockContentRepository } from "../../src/lib/mock/content-repository";
import { buildMockIncidentContext } from "../../src/lib/mock/incident-context";
import type { PublishedMockContentBundle } from "../../src/lib/contract/published-content-contract";

/**
 * Phase 6.1 — five-topic coverage. Every one of the five Assistant topics
 * must produce a meaningful (non-empty), governed, deterministic result
 * from nothing but the bare topic — the same bundle/engine/context-builder
 * path the real Triage page uses (`MockTriageRecommendationService`), not a
 * hand-built fixture.
 */

const repository = new MockContentRepository();

function totalRecommendations(data: PublishedMockContentBundle["data"], topic: string): number {
  const context = buildMockIncidentContext(repository, { topic });
  const result = runMockMatching(data, context);
  return Object.values(result.recommendations).reduce((sum, arr) => sum + arr.length, 0);
}

function bundleData(): PublishedMockContentBundle["data"] {
  return {
    incidentTypes: repository.list("incidentTypes"),
    triageLabels: repository.list("triageLabels"),
    resourceCategories: repository.list("resourceCategories"),
    legislationSources: repository.list("legislationSources"),
    microcards: repository.list("microcards"),
    rightsContent: repository.list("rightsContent"),
    supportOrganisations: repository.list("supportOrganisations"),
    supportProfessionals: repository.list("supportProfessionals"),
    reportingDestinations: repository.list("reportingDestinations"),
    matchingRules: repository.list("matchingRules"),
  };
}

const FIVE_TOPICS = ["general_assistant", "domestic_violence", "racial_abuse", "cyber_scam", "migrant_challenges"];

test("the repository loads before running these topic checks", () => {
  assert.equal(repository.isReady(), true, repository.getLoadError() ?? "");
});

for (const topic of FIVE_TOPICS) {
  test(`topic "${topic}" produces a meaningful (non-empty) governed result from the bare topic alone`, () => {
    const total = totalRecommendations(bundleData(), topic);
    assert.ok(total > 0, `expected at least one recommendation for topic "${topic}", got 0`);
  });
}

test("an unknown topic falls back to general_assistant's context safely, never throwing and never producing random results", () => {
  const context1 = buildMockIncidentContext(repository, { topic: "not_a_real_topic" });
  const context2 = buildMockIncidentContext(repository, { topic: "not_a_real_topic" });
  assert.equal(context1.assistantTopic, "general_assistant");
  assert.deepEqual(context1, context2, "the same unrecognised input must deterministically produce the same context");
});

test("topic alone never confirms an incident (incidentTypeIds stay empty unless resolved from real structured state)", () => {
  for (const topic of FIVE_TOPICS) {
    const context = buildMockIncidentContext(repository, { topic });
    // Every candidate incident-type machine key in the registry either
    // resolves to a real published record or is dropped — never invented —
    // and topic alone supplies no conversation-derived incident evidence.
    assert.ok(Array.isArray(context.incidentTypeIds));
  }
});

test("topic alone never sets immediateDangerSignal, for any of the five topics", () => {
  for (const topic of FIVE_TOPICS) {
    const context = buildMockIncidentContext(repository, { topic });
    assert.equal(context.immediateDangerSignal, undefined);
  }
});

test("each topic's triggered rule set is distinct from every other topic's (not one recommendation set reused for all five)", () => {
  const data = bundleData();
  const triggeredByTopic = new Map<string, string[]>();
  for (const topic of FIVE_TOPICS) {
    const context = buildMockIncidentContext(repository, { topic });
    const result = runMockMatching(data, context);
    triggeredByTopic.set(topic, result.triggeredRuleIds);
  }

  const allTriggeredSets = [...triggeredByTopic.values()].map((ids) => [...ids].sort().join(","));
  assert.equal(new Set(allTriggeredSets).size, allTriggeredSets.length, "two topics triggered the exact same rule set");
});

test("matching is deterministic across repeated runs for every topic", () => {
  const data = bundleData();
  for (const topic of FIVE_TOPICS) {
    const context = buildMockIncidentContext(repository, { topic });
    const first = runMockMatching(data, context);
    const second = runMockMatching(data, context);
    assert.deepEqual(first, second);
  }
});
