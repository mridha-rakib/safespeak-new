import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOMMENDATION_ID_QUERY_KEY,
  RECOMMENDATION_TYPE_QUERY_KEY,
  parseRecommendationDetailFromSearchParams,
  withRecommendationDetail,
  withoutRecommendationDetail,
} from "../../src/lib/mock/recommendation-detail-url";

test("parseRecommendationDetailFromSearchParams parses a valid entityType and entityId pair", () => {
  const params = new URLSearchParams("view=reportsubmissionsupport&recommendationType=microcard&recommendationId=mc-1");
  assert.deepEqual(parseRecommendationDetailFromSearchParams(params), {
    entityType: "microcard",
    entityId: "mc-1",
  });
});

test("parseRecommendationDetailFromSearchParams returns null when either param is missing", () => {
  assert.equal(
    parseRecommendationDetailFromSearchParams(new URLSearchParams("recommendationType=microcard")),
    null
  );
  assert.equal(
    parseRecommendationDetailFromSearchParams(new URLSearchParams("recommendationId=mc-1")),
    null
  );
  assert.equal(parseRecommendationDetailFromSearchParams(new URLSearchParams("view=reportsubmissionsupport")), null);
});

test("parseRecommendationDetailFromSearchParams does not crash or fabricate a result for an unsupported entity type — that decision belongs to the resolver, not the URL parser", () => {
  const params = new URLSearchParams("recommendationType=not_a_real_type&recommendationId=xyz");
  assert.deepEqual(parseRecommendationDetailFromSearchParams(params), {
    entityType: "not_a_real_type",
    entityId: "xyz",
  });
});

test("withRecommendationDetail sets only the two detail params and preserves every other existing param", () => {
  const current = new URLSearchParams(
    "view=reportsubmissionsupport&conversationSessionId=abc&triageDebug=1"
  );
  const href = withRecommendationDetail(current, "support_organisation", "org-1");
  const result = new URL(href, "http://localhost");
  assert.equal(result.searchParams.get("view"), "reportsubmissionsupport");
  assert.equal(result.searchParams.get("conversationSessionId"), "abc");
  assert.equal(result.searchParams.get("triageDebug"), "1");
  assert.equal(result.searchParams.get(RECOMMENDATION_TYPE_QUERY_KEY), "support_organisation");
  assert.equal(result.searchParams.get(RECOMMENDATION_ID_QUERY_KEY), "org-1");
});

test("withRecommendationDetail replaces an already-open detail's params rather than duplicating them", () => {
  const current = new URLSearchParams("recommendationType=microcard&recommendationId=mc-1");
  const href = withRecommendationDetail(current, "rights_content", "rc-1");
  const result = new URL(href, "http://localhost");
  assert.equal(result.searchParams.getAll(RECOMMENDATION_TYPE_QUERY_KEY).length, 1);
  assert.equal(result.searchParams.get(RECOMMENDATION_TYPE_QUERY_KEY), "rights_content");
  assert.equal(result.searchParams.get(RECOMMENDATION_ID_QUERY_KEY), "rc-1");
});

test("withoutRecommendationDetail removes only the two detail params, preserving unrelated Dashboard params", () => {
  const current = new URLSearchParams(
    "view=reportsubmissionsupport&conversationSessionId=abc&recommendationType=microcard&recommendationId=mc-1"
  );
  const href = withoutRecommendationDetail(current);
  const result = new URL(href, "http://localhost");
  assert.equal(result.searchParams.get("view"), "reportsubmissionsupport");
  assert.equal(result.searchParams.get("conversationSessionId"), "abc");
  assert.equal(result.searchParams.has(RECOMMENDATION_TYPE_QUERY_KEY), false);
  assert.equal(result.searchParams.has(RECOMMENDATION_ID_QUERY_KEY), false);
});

test("the URL-state contract never carries anything beyond the stable entity type/id — no match reasons, content, or contact fields", () => {
  const current = new URLSearchParams();
  const href = withRecommendationDetail(current, "reporting_destination", "dest-1");
  const result = new URL(href, "http://localhost");
  const keys = Array.from(result.searchParams.keys());
  assert.deepEqual(keys.sort(), [RECOMMENDATION_ID_QUERY_KEY, RECOMMENDATION_TYPE_QUERY_KEY].sort());
});
