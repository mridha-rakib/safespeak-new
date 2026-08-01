import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOMMENDATION_DOMAIN_BY_ENTITY_TYPE,
  RECOMMENDATION_ENTITY_TYPE_LABEL,
  isRecommendationEntityType,
  recommendationSummary,
  recommendationTitle,
  type MockRecommendation,
} from "../../src/lib/mock/recommendation-types";
import type {
  PublishedLegislationSource,
  PublishedMicrocard,
  PublishedReportingDestination,
  PublishedRightsContent,
  PublishedSupportOrganisation,
  PublishedSupportProfessional,
} from "../../src/lib/contract/published-content-contract";

const BASE = {
  status: "published" as const,
  isDemo: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
};

test("isRecommendationEntityType accepts exactly the 6 canonical entity types and rejects everything else", () => {
  for (const type of Object.keys(RECOMMENDATION_ENTITY_TYPE_LABEL)) {
    assert.equal(isRecommendationEntityType(type), true);
  }
  assert.equal(isRecommendationEntityType("matching_rule"), false);
  assert.equal(isRecommendationEntityType(""), false);
  assert.equal(isRecommendationEntityType("Microcard"), false);
});

test("every entity type maps to exactly one content domain, with no domain shared between two entity types", () => {
  const domains = Object.values(RECOMMENDATION_DOMAIN_BY_ENTITY_TYPE);
  assert.equal(new Set(domains).size, domains.length);
});

test("recommendationTitle and recommendationSummary cover all 6 entity types without throwing", () => {
  const microcard: PublishedMicrocard = {
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
  const rightsContent: PublishedRightsContent = {
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
  const supportOrganisation: PublishedSupportOrganisation = {
    ...BASE,
    id: "org-1",
    name: "Org name",
    shortDescription: "Org short description",
    servicesOffered: [],
    resourceCategoryIds: [],
    incidentTypeIds: [],
    jurisdictions: [],
    australiaWide: false,
    audienceGroups: [],
    languages: [],
    serviceDeliveryModes: [],
    tags: [],
    emergencyService: false,
    verificationStatus: "not_verified",
  };
  const supportProfessional: PublishedSupportProfessional = {
    ...BASE,
    id: "prof-1",
    fullName: "Jordan Example",
    professionalType: "advocate",
    shortIntroduction: "Short introduction",
    areasOfSupport: [],
    resourceCategoryIds: [],
    incidentTypeIds: [],
    triageLabelIds: [],
    specialisations: [],
    communitiesSupported: [],
    ageGroupsSupported: [],
    jurisdictions: [],
    australiaWide: false,
    serviceLocations: [],
    supportModes: [],
    languages: ["en"],
    accessibilitySupport: [],
    costType: "unknown",
    acceptingNewReferrals: true,
    verificationStatus: "not_verified",
    credentials: [],
  };
  const reportingDestination: PublishedReportingDestination = {
    ...BASE,
    id: "dest-1",
    name: "Destination name",
    description: "Destination description",
    destinationType: "police",
    resourceCategoryIds: [],
    incidentTypeIds: [],
    jurisdictions: [],
    australiaWide: true,
    audienceGroups: [],
    languages: [],
    tags: [],
    reportingMethods: ["phone"],
    anonymousReporting: "unknown",
    emergencySuitability: "unknown",
  };
  const legislationSource: PublishedLegislationSource = {
    ...BASE,
    id: "leg-1",
    title: "Legislation title",
    sourceType: "legislation",
    language: "en",
    licenseStatus: "unknown",
    relevantSections: [],
    tags: [],
    incidentTypeIds: [],
    priority: "medium",
    aiUsagePermission: false,
    aiEligible: false,
  };

  const recommendations: MockRecommendation[] = [
    { entityType: "microcard", entityId: microcard.id, record: microcard, matchReasons: [], sourceBundleVersion: "1.0.0" },
    { entityType: "rights_content", entityId: rightsContent.id, record: rightsContent, matchReasons: [], sourceBundleVersion: "1.0.0" },
    {
      entityType: "support_organisation",
      entityId: supportOrganisation.id,
      record: supportOrganisation,
      matchReasons: [],
      sourceBundleVersion: "1.0.0",
    },
    {
      entityType: "support_professional",
      entityId: supportProfessional.id,
      record: supportProfessional,
      matchReasons: [],
      sourceBundleVersion: "1.0.0",
    },
    {
      entityType: "reporting_destination",
      entityId: reportingDestination.id,
      record: reportingDestination,
      matchReasons: [],
      sourceBundleVersion: "1.0.0",
    },
    {
      entityType: "legislation_source",
      entityId: legislationSource.id,
      record: legislationSource,
      matchReasons: [],
      sourceBundleVersion: "1.0.0",
    },
  ];

  const expectedTitles: Record<string, string> = {
    microcard: "Microcard title",
    rights_content: "Rights title",
    support_organisation: "Org name",
    support_professional: "Jordan Example",
    reporting_destination: "Destination name",
    legislation_source: "Legislation title",
  };

  for (const recommendation of recommendations) {
    assert.equal(recommendationTitle(recommendation), expectedTitles[recommendation.entityType]);
    // Must never throw for any of the 6 entity types, even where summary is legitimately undefined (legislation_source).
    assert.doesNotThrow(() => recommendationSummary(recommendation));
  }

  assert.equal(recommendationSummary(recommendations[0]!), "Microcard summary");
  assert.equal(recommendationSummary(recommendations[5]!), undefined);
});
