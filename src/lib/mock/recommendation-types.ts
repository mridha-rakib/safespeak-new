import type {
  PublishedLegislationSource,
  PublishedMicrocard,
  PublishedReportingDestination,
  PublishedRightsContent,
  PublishedSupportOrganisation,
  PublishedSupportProfessional,
} from "@/lib/contract/published-content-contract";
import type { ContentDomain } from "@/lib/mock/content-repository";

/**
 * Phase 7 — the one typed discriminated union every recommendation detail
 * consumer (cards, the shared detail shell, the resolver, tests) uses.
 * `record` is the full validated public-contract record — components read
 * whichever fields they need directly from it, typed, never from a
 * flattened/unsafe generic object and never from an Admin model.
 */
export type RecommendationEntityType =
  | "microcard"
  | "rights_content"
  | "support_organisation"
  | "support_professional"
  | "reporting_destination"
  | "legislation_source";

export const RECOMMENDATION_ENTITY_TYPES: readonly RecommendationEntityType[] = [
  "microcard",
  "rights_content",
  "support_organisation",
  "support_professional",
  "reporting_destination",
  "legislation_source",
];

export const RECOMMENDATION_ENTITY_TYPE_LABEL: Record<RecommendationEntityType, string> = {
  microcard: "Guidance",
  rights_content: "Rights & Legal Information",
  support_organisation: "Support Organisation",
  support_professional: "Advocate / Counsellor",
  reporting_destination: "Reporting Destination",
  legislation_source: "Legislation Source",
};

export const RECOMMENDATION_DOMAIN_BY_ENTITY_TYPE: Record<RecommendationEntityType, ContentDomain> = {
  microcard: "microcards",
  rights_content: "rightsContent",
  support_organisation: "supportOrganisations",
  support_professional: "supportProfessionals",
  reporting_destination: "reportingDestinations",
  legislation_source: "legislationSources",
};

interface RecommendationBase {
  entityId: string;
  /** Plain-language reason strings only — never a numeric score, rule id, or condition id. See lib/mock/triage-adapters.ts. */
  matchReasons: string[];
  /** The generated bundle's contract schema version (e.g. "1.0.0"), not a record revision number — for debug/support transparency only, never rendered as a user-facing detail. */
  sourceBundleVersion: string;
}

export interface MicrocardRecommendation extends RecommendationBase {
  entityType: "microcard";
  record: PublishedMicrocard;
}
export interface RightsContentRecommendation extends RecommendationBase {
  entityType: "rights_content";
  record: PublishedRightsContent;
}
export interface SupportOrganisationRecommendation extends RecommendationBase {
  entityType: "support_organisation";
  record: PublishedSupportOrganisation;
}
export interface SupportProfessionalRecommendation extends RecommendationBase {
  entityType: "support_professional";
  record: PublishedSupportProfessional;
}
export interface ReportingDestinationRecommendation extends RecommendationBase {
  entityType: "reporting_destination";
  record: PublishedReportingDestination;
}
export interface LegislationSourceRecommendation extends RecommendationBase {
  entityType: "legislation_source";
  record: PublishedLegislationSource;
}

export type MockRecommendation =
  | MicrocardRecommendation
  | RightsContentRecommendation
  | SupportOrganisationRecommendation
  | SupportProfessionalRecommendation
  | ReportingDestinationRecommendation
  | LegislationSourceRecommendation;

export function isRecommendationEntityType(value: string): value is RecommendationEntityType {
  return (RECOMMENDATION_ENTITY_TYPES as readonly string[]).includes(value);
}

/** Small, safe title/summary accessors for contexts (e.g. a modal header) that don't want a per-entity-type switch. */
export function recommendationTitle(recommendation: MockRecommendation): string {
  switch (recommendation.entityType) {
    case "microcard":
      return recommendation.record.title;
    case "rights_content":
      return recommendation.record.title;
    case "support_organisation":
      return recommendation.record.name;
    case "support_professional":
      return recommendation.record.displayName ?? recommendation.record.fullName;
    case "reporting_destination":
      return recommendation.record.name;
    case "legislation_source":
      return recommendation.record.title;
  }
}

export function recommendationSummary(recommendation: MockRecommendation): string | undefined {
  switch (recommendation.entityType) {
    case "microcard":
      return recommendation.record.summary;
    case "rights_content":
      return recommendation.record.summary;
    case "support_organisation":
      return recommendation.record.shortDescription ?? recommendation.record.fullDescription;
    case "support_professional":
      return recommendation.record.shortIntroduction;
    case "reporting_destination":
      return recommendation.record.description;
    case "legislation_source":
      return undefined;
  }
}
