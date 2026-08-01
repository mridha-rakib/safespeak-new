import type { Route } from "next";

/**
 * Phase 7.1 — the controlled URL/query contract for "which recommendation
 * detail is open on Triage". Reuses the existing Dashboard convention (flat
 * query params on the same `/dashboard` route, e.g. `step`/`fromTriage`/
 * `conversationSessionId` in `report-submission-details-page.tsx`) rather
 * than inventing a new routing framework. Only the stable entity type and
 * stable entity ID are ever stored here — never match reasons, contact
 * details, content bodies, or any other part of the resolved record.
 */

export const RECOMMENDATION_TYPE_QUERY_KEY = "recommendationType";
export const RECOMMENDATION_ID_QUERY_KEY = "recommendationId";

export interface RecommendationDetailQueryState {
  entityType: string;
  entityId: string;
}

/** Reads only the two detail params — never throws on a malformed/partial query string. */
export function parseRecommendationDetailFromSearchParams(
  searchParams: URLSearchParams
): RecommendationDetailQueryState | null {
  const entityType = searchParams.get(RECOMMENDATION_TYPE_QUERY_KEY);
  const entityId = searchParams.get(RECOMMENDATION_ID_QUERY_KEY);

  if (!entityType || !entityId) {
    return null;
  }

  return { entityType, entityId };
}

/** Sets the two detail params on top of the current query string, preserving every other param (topic/context/report/debug/etc). */
export function withRecommendationDetail(
  currentSearchParams: URLSearchParams,
  entityType: string,
  entityId: string
): Route {
  const next = new URLSearchParams(currentSearchParams);
  next.set(RECOMMENDATION_TYPE_QUERY_KEY, entityType);
  next.set(RECOMMENDATION_ID_QUERY_KEY, entityId);
  return `/dashboard?${next.toString()}` as Route;
}

/** Removes only the two detail params, preserving every other param. */
export function withoutRecommendationDetail(currentSearchParams: URLSearchParams): Route {
  const next = new URLSearchParams(currentSearchParams);
  next.delete(RECOMMENDATION_TYPE_QUERY_KEY);
  next.delete(RECOMMENDATION_ID_QUERY_KEY);
  return `/dashboard?${next.toString()}` as Route;
}
