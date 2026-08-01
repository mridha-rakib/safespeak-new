import assert from "node:assert/strict";
import test from "node:test";

import {
  REPORT_START_FROM_TRIAGE_HREF,
  buildContactActions,
  emailHref,
  phoneHref,
  safeDialablePhone,
  safeEmail,
  safeHttpsUrl,
  safeInternalRoute,
  safePublicImageSrc,
} from "../../src/lib/mock/safe-actions";

test("safeDialablePhone accepts digits and a leading plus, and rejects blank/short/non-numeric input", () => {
  assert.equal(safeDialablePhone("1800 737 732"), "1800737732");
  assert.equal(safeDialablePhone("+61 2 9999 0000"), "+61299990000");
  assert.equal(safeDialablePhone(""), undefined);
  assert.equal(safeDialablePhone("   "), undefined);
  assert.equal(safeDialablePhone("abc"), undefined);
  assert.equal(safeDialablePhone("12"), undefined);
  assert.equal(safeDialablePhone(undefined), undefined);
  assert.equal(safeDialablePhone(null), undefined);
});

test("phoneHref only returns a tel: href for a valid dialable phone", () => {
  assert.equal(phoneHref("1800 737 732"), "tel:1800737732");
  assert.equal(phoneHref("not a phone"), undefined);
});

test("safeEmail requires a plausible local@domain shape", () => {
  assert.equal(safeEmail("help@example.org"), "help@example.org");
  assert.equal(safeEmail("not-an-email"), undefined);
  assert.equal(safeEmail(""), undefined);
  assert.equal(safeEmail(undefined), undefined);
});

test("emailHref only returns a mailto: href for a valid email", () => {
  assert.equal(emailHref("help@example.org"), "mailto:help@example.org");
  assert.equal(emailHref("not-an-email"), undefined);
});

test("safeHttpsUrl accepts only https:, rejecting http:, javascript:, data:, and malformed URLs", () => {
  assert.equal(safeHttpsUrl("https://example.org/page"), "https://example.org/page");
  assert.equal(safeHttpsUrl("http://example.org"), undefined);
  assert.equal(safeHttpsUrl("javascript:alert(1)"), undefined);
  assert.equal(safeHttpsUrl("data:text/html,<script>alert(1)</script>"), undefined);
  assert.equal(safeHttpsUrl("not a url"), undefined);
  assert.equal(safeHttpsUrl(""), undefined);
  assert.equal(safeHttpsUrl(undefined), undefined);
});

test("safeInternalRoute only resolves the hand-maintained allow-listed keys, never arbitrary route text", () => {
  assert.equal(safeInternalRoute("/rights"), "/dashboard?view=resources");
  assert.equal(safeInternalRoute("/report"), REPORT_START_FROM_TRIAGE_HREF);
  assert.equal(safeInternalRoute("/some/arbitrary/admin/route"), undefined);
  assert.equal(safeInternalRoute(""), undefined);
  assert.equal(safeInternalRoute(undefined), undefined);
});

test("Phase 8.2: safeInternalRoute('/emergency') resolves to the existing Smart Dialler urgent-help route, not the generic dashboard home", () => {
  // A Microcard CTA labelled "Get emergency help" (see the seeded
  // demo-microcard-safety-planning-quick-tip) must actually land somewhere
  // that helps — previously this resolved to plain "/dashboard".
  assert.equal(safeInternalRoute("/emergency"), "/dashboard?view=smartdialler");
});

test("buildContactActions only includes actions actually backed by valid source data, never a placeholder entry", () => {
  const actions = buildContactActions({});
  assert.deepEqual(actions, []);
});

test("buildContactActions builds call/email/website/book/refer/online_report actions only from valid fields", () => {
  const actions = buildContactActions({
    phone: "1800 737 732",
    email: "not-an-email",
    website: "https://example.org",
    bookingUrl: "javascript:alert(1)",
    referralUrl: "https://example.org/refer",
    onlineReportingUrl: "https://example.org/report",
  });
  const kinds = actions.map((a) => a.kind).sort();
  assert.deepEqual(kinds, ["call", "online_report", "refer", "website"].sort());
  assert.equal(actions.find((a) => a.kind === "call")?.href, "tel:1800737732");
  assert.equal(actions.find((a) => a.kind === "website")?.href, "https://example.org");
});

test("REPORT_START_FROM_TRIAGE_HREF is the confirmed canonical route, with the real step and fromTriage params", () => {
  assert.equal(
    REPORT_START_FROM_TRIAGE_HREF,
    "/dashboard?view=reportsubmissiondetails&step=report&fromTriage=1"
  );
});

test("safePublicImageSrc accepts a same-origin public asset path or a validated https URL", () => {
  assert.equal(safePublicImageSrc("/mock-assets/professionals/jordan-blake.jpg"), "/mock-assets/professionals/jordan-blake.jpg");
  assert.equal(safePublicImageSrc("https://example.org/photo.jpg"), "https://example.org/photo.jpg");
});

test("safePublicImageSrc rejects browser object URLs, local filesystem paths, and unsafe protocols", () => {
  assert.equal(safePublicImageSrc("blob:https://example.org/1234-5678"), undefined);
  assert.equal(safePublicImageSrc("file:///etc/passwd"), undefined);
  assert.equal(safePublicImageSrc("C:\\Users\\someone\\photo.jpg"), undefined);
  assert.equal(safePublicImageSrc("D:/local/photo.jpg"), undefined);
  assert.equal(safePublicImageSrc("javascript:alert(1)"), undefined);
  assert.equal(safePublicImageSrc("data:image/png;base64,abc"), undefined);
  assert.equal(safePublicImageSrc("http://example.org/photo.jpg"), undefined);
  assert.equal(safePublicImageSrc("//example.org/protocol-relative.jpg"), undefined);
  assert.equal(safePublicImageSrc(""), undefined);
  assert.equal(safePublicImageSrc(undefined), undefined);
  assert.equal(safePublicImageSrc(null), undefined);
});
