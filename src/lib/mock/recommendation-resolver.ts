import { getContentRepository, type ContentRepository } from "@/lib/mock/content-repository";
import {
  RECOMMENDATION_DOMAIN_BY_ENTITY_TYPE,
  isRecommendationEntityType,
  type MockRecommendation,
} from "@/lib/mock/recommendation-types";

/**
 * Phase 7 — the one place a recommendation's stable (entityType, entityId)
 * pair is turned into a full typed public record. Every consumer
 * (recommendation cards, the shared detail shell, the report-flow handoff,
 * tests) goes through this instead of independently searching bundle
 * collections — a wrong/unsupported entity type can never accidentally
 * resolve an id that happens to collide in a different collection, since
 * each entity type is mapped to exactly one domain up front.
 */

export type RecommendationResolution =
  | { status: "found"; recommendation: MockRecommendation }
  | { status: "not_found" }
  | { status: "unsupported_entity_type" };

export function resolveRecommendation(
  entityType: string,
  entityId: string,
  matchReasons: string[] = [],
  repository: ContentRepository = getContentRepository()
): RecommendationResolution {
  if (!isRecommendationEntityType(entityType)) {
    return { status: "unsupported_entity_type" };
  }
  if (!repository.isReady()) {
    return { status: "not_found" };
  }

  const domain = RECOMMENDATION_DOMAIN_BY_ENTITY_TYPE[entityType];
  const record = repository.getById(domain, entityId);
  if (!record) {
    return { status: "not_found" };
  }

  const sourceBundleVersion = repository.getManifest()?.schemaVersion ?? "unknown";

  // TypeScript can't narrow the record type across the domain lookup on its
  // own — the entityType/domain pairing above is exactly what guarantees
  // this cast is safe (every entityType maps to exactly one domain, and
  // `repository.getById` is generic over that same domain key).
  return {
    status: "found",
    recommendation: {
      entityType,
      entityId,
      record,
      matchReasons,
      sourceBundleVersion,
    } as MockRecommendation,
  };
}
