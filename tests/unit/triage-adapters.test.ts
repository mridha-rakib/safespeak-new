import assert from "node:assert/strict";
import test from "node:test";

import {
  destinationToReportingCard,
  formatContractJurisdiction,
  formatContractJurisdictionList,
  humanizeKey,
  microcardToResourceItem,
  organisationToSupportOption,
  professionalToAdvocateCard,
  resolveMicrocardCardHref,
  rightsContentDisclaimer,
  rightsContentToResourceItem,
  toDialablePhone,
} from "../../src/lib/mock/triage-adapters";
import type {
  MockMatchReason,
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

const REASONS: MockMatchReason[] = [{ code: "topic_match", ruleId: "r-1", ruleName: "Rule 1", detail: "Topic matched." }];

test("humanizeKey turns a snake_case value into Title Case words", () => {
  assert.equal(humanizeKey("quick_guidance"), "Quick Guidance");
  assert.equal(humanizeKey("legal-aid"), "Legal Aid");
  assert.equal(humanizeKey(""), "");
});

test("toDialablePhone strips everything except digits and a leading plus", () => {
  assert.equal(toDialablePhone("1800 737 732"), "1800737732");
  assert.equal(toDialablePhone("+61 2 9999 0000"), "+61299990000");
});

test("microcardToResourceItem only sets href for open_safe_external_link / open_internal_route CTAs, resolved through the same safety validators as the detail modal", () => {
  const base: PublishedMicrocard = {
    ...BASE,
    id: "mc-1",
    title: "Title",
    summary: "Summary",
    tags: [],
    incidentTypeIds: [],
    priority: "normal",
    displayOrder: 0,
    relatedLegislationIds: [],
    relatedSupportOrganisationIds: [],
    cta: { type: "none" },
  };

  assert.equal(microcardToResourceItem(base, REASONS).href, undefined);
  assert.equal(
    microcardToResourceItem({ ...base, cta: { type: "view_support_service", target: "org-1" } }, REASONS).href,
    undefined
  );
  assert.equal(
    microcardToResourceItem({ ...base, cta: { type: "open_safe_external_link", target: "https://example.org" } }, REASONS).href,
    "https://example.org"
  );
  // "/rights" is the canonical Microcard CTA vocabulary's internal-route
  // key (safespeak-admin's MICROCARD_INTERNAL_ROUTES) — resolved through
  // safeInternalRoute() to this app's real route, never passed through raw.
  assert.equal(
    microcardToResourceItem({ ...base, cta: { type: "open_internal_route", target: "/rights" } }, REASONS).href,
    "/dashboard?view=resources"
  );
});

test("microcardToResourceItem never sets href for an unsafe/unrecognised CTA target — no raw passthrough", () => {
  const base: PublishedMicrocard = {
    ...BASE,
    id: "mc-1",
    title: "Title",
    summary: "Summary",
    tags: [],
    incidentTypeIds: [],
    priority: "normal",
    displayOrder: 0,
    relatedLegislationIds: [],
    relatedSupportOrganisationIds: [],
    cta: { type: "none" },
  };

  assert.equal(
    microcardToResourceItem({ ...base, cta: { type: "open_safe_external_link", target: "javascript:alert(1)" } }, REASONS)
      .href,
    undefined
  );
  assert.equal(
    microcardToResourceItem({ ...base, cta: { type: "open_safe_external_link", target: "http://example.org" } }, REASONS)
      .href,
    undefined
  );
  assert.equal(
    microcardToResourceItem({ ...base, cta: { type: "open_internal_route", target: "/not-a-real-route" } }, REASONS)
      .href,
    undefined
  );
});

test("microcardToResourceItem humanises cardType into category, falling back to Guidance", () => {
  const base: PublishedMicrocard = {
    ...BASE,
    id: "mc-1",
    title: "Title",
    summary: "Summary",
    tags: [],
    incidentTypeIds: [],
    priority: "normal",
    displayOrder: 0,
    relatedLegislationIds: [],
    relatedSupportOrganisationIds: [],
    cta: { type: "none" },
  };
  assert.equal(microcardToResourceItem({ ...base, cardType: "safety_tip" }, REASONS).category, "Safety Tip");
  assert.equal(microcardToResourceItem(base, REASONS).category, "Guidance");
});

test("rightsContentDisclaimer passes the disclaimer through unmodified, and rightsContentToResourceItem never invents a disclaimer field", () => {
  const record: PublishedRightsContent = {
    ...BASE,
    id: "rc-1",
    title: "Rights title",
    summary: "Summary",
    relatedLegislationIds: [],
    incidentTypeIds: [],
    tags: [],
    resourceCategoryIds: [],
    relatedSupportOrganisationIds: [],
    priority: "normal",
    publicDisclaimer: "This is general information, not legal advice.",
  };
  assert.equal(rightsContentDisclaimer(record), "This is general information, not legal advice.");
  const item = rightsContentToResourceItem(record, REASONS);
  assert.equal((item as unknown as { publicDisclaimer?: unknown }).publicDisclaimer, undefined);
  assert.equal(item.category, "Know Your Rights");
});

test("organisationToSupportOption only sets contact fields when the source has them", () => {
  const record: PublishedSupportOrganisation = {
    ...BASE,
    id: "org-1",
    name: "Test Org",
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
  const withoutContact = organisationToSupportOption(record, REASONS, 1);
  assert.equal(withoutContact.phoneDial, undefined);
  assert.equal(withoutContact.phoneDisplay, undefined);
  assert.equal(withoutContact.url, undefined);
  assert.equal(withoutContact.jurisdiction, undefined);

  const withContact = organisationToSupportOption(
    { ...record, phone: "1800 737 732", website: "https://example.org", australiaWide: true },
    REASONS,
    2
  );
  assert.equal(withContact.phoneDial, "1800737732");
  assert.equal(withContact.phoneDisplay, "1800 737 732");
  assert.equal(withContact.url, "https://example.org");
  assert.equal(withContact.jurisdiction, "Australia-wide");
  assert.equal(withContact.order, 2);
  assert.ok(withContact.reason?.includes("Topic matched."));
});

test("organisationToSupportOption prefers explicit jurisdictions over the australiaWide fallback", () => {
  const record: PublishedSupportOrganisation = {
    ...BASE,
    id: "org-2",
    name: "Test Org",
    servicesOffered: [],
    resourceCategoryIds: [],
    incidentTypeIds: [],
    jurisdictions: ["nsw", "vic"],
    australiaWide: true,
    audienceGroups: [],
    languages: [],
    serviceDeliveryModes: [],
    tags: [],
    emergencyService: false,
    verificationStatus: "not_verified",
  };
  assert.equal(organisationToSupportOption(record, REASONS, 1).jurisdiction, "nsw, vic");
});

test("professionalToAdvocateCard preserves verificationStatus verbatim, including not_verified", () => {
  const record: PublishedSupportProfessional = {
    ...BASE,
    id: "prof-1",
    fullName: "Jordan Example",
    professionalType: "advocate",
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
  const card = professionalToAdvocateCard(record, REASONS);
  assert.equal(card.verificationStatus, "not_verified");
  assert.equal(card.displayName, "Jordan Example");
  assert.equal(card.phoneDisplay, undefined);
  assert.equal(card.professionalType, "Advocate");

  const verifiedWithPhone = professionalToAdvocateCard({ ...record, verificationStatus: "verified", phone: "1300 224 636" }, REASONS);
  assert.equal(verifiedWithPhone.verificationStatus, "verified");
  assert.equal(verifiedWithPhone.phoneDial, "1300224636");
});

test("destinationToReportingCard preserves the anonymousReporting/emergencySuitability tri-state verbatim, including 'unknown'", () => {
  const record: PublishedReportingDestination = {
    ...BASE,
    id: "dest-1",
    name: "Test Destination",
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
  const card = destinationToReportingCard(record, REASONS);
  assert.equal(card.anonymousReporting, "unknown");
  assert.equal(card.emergencySuitability, "unknown");
  assert.deepEqual(card.reportingMethods, ["Phone", "Online Form"]);
  assert.equal(card.onlineReportingUrl, undefined);

  const yesNo = destinationToReportingCard({ ...record, anonymousReporting: "yes", emergencySuitability: "no" }, REASONS);
  assert.equal(yesNo.anonymousReporting, "yes");
  assert.equal(yesNo.emergencySuitability, "no");
});

test("formatContractJurisdiction turns the lowercase contract enum into a readable label, never a raw code", () => {
  assert.equal(formatContractJurisdiction("commonwealth"), "Commonwealth");
  assert.equal(formatContractJurisdiction("nsw"), "NSW");
  assert.equal(formatContractJurisdiction("vic"), "VIC");
  assert.equal(formatContractJurisdiction(undefined), undefined);
  assert.equal(formatContractJurisdiction(""), undefined);
});

test("formatContractJurisdiction degrades to humanizeKey for a value outside the known enum, rather than rendering raw", () => {
  assert.equal(formatContractJurisdiction("future_region"), "Future Region");
});

test("formatContractJurisdictionList formats and joins every value, or is undefined for an empty list", () => {
  assert.equal(formatContractJurisdictionList(["nsw", "vic"]), "NSW, VIC");
  assert.equal(formatContractJurisdictionList([]), undefined);
  assert.equal(formatContractJurisdictionList(undefined), undefined);
});

test("resolveMicrocardCardHref uses the exact same safety validators as the detail modal — no divergent second mapper", () => {
  assert.equal(resolveMicrocardCardHref({ type: "none" }), undefined);
  assert.equal(resolveMicrocardCardHref({ type: "start_report" }), undefined);
  assert.equal(
    resolveMicrocardCardHref({ type: "view_rights_information", target: "rc-1" }),
    undefined
  );
  assert.equal(
    resolveMicrocardCardHref({ type: "open_safe_external_link", target: "https://example.org" }),
    "https://example.org"
  );
  assert.equal(
    resolveMicrocardCardHref({ type: "open_safe_external_link", target: "javascript:alert(1)" }),
    undefined
  );
  assert.equal(
    resolveMicrocardCardHref({ type: "open_internal_route", target: "/emergency" }),
    "/dashboard?view=smartdialler"
  );
});

test("destinationToReportingCard only sets onlineReportingUrl when the source has a non-empty value", () => {
  const record: PublishedReportingDestination = {
    ...BASE,
    id: "dest-2",
    name: "Test Destination",
    destinationType: "online_platform",
    resourceCategoryIds: [],
    incidentTypeIds: [],
    jurisdictions: [],
    australiaWide: true,
    audienceGroups: [],
    languages: [],
    tags: [],
    reportingMethods: ["online_form"],
    anonymousReporting: "unknown",
    emergencySuitability: "unknown",
    onlineReportingUrl: "https://example.org/report",
  };
  assert.equal(destinationToReportingCard(record, REASONS).onlineReportingUrl, "https://example.org/report");
});
