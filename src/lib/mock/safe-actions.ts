import type { Route } from "next";

/**
 * Phase 7 — the one place phone/email/URL/internal-route safety is decided
 * for every recommendation card and detail view. Never duplicated per
 * component. A helper returning `undefined` means "no action" — callers
 * must not render a button/link in that case, never fall back to a generic
 * placeholder destination.
 */

export function safeDialablePhone(phone: string | undefined | null): string | undefined {
  const trimmed = phone?.trim();
  if (!trimmed) return undefined;
  // Preserve international formatting (a leading "+") — never invent or
  // reformat into an Australian-specific shape.
  const dial = trimmed.replace(/[^0-9+]/g, "");
  if (!/^\+?[0-9]{4,}$/.test(dial)) return undefined;
  return dial;
}

export function phoneHref(phone: string | undefined | null): string | undefined {
  const dial = safeDialablePhone(phone);
  return dial ? `tel:${dial}` : undefined;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function safeEmail(email: string | undefined | null): string | undefined {
  const trimmed = email?.trim();
  if (!trimmed || !EMAIL_PATTERN.test(trimmed)) return undefined;
  return trimmed;
}

export function emailHref(email: string | undefined | null): string | undefined {
  const safe = safeEmail(email);
  return safe ? `mailto:${safe}` : undefined;
}

/** A validated `https://` URL only — rejects `javascript:`, `data:`, `http:`, and malformed values. Never reformats the URL text shown to the user, only validates it. */
export function safeHttpsUrl(url: string | undefined | null): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hand-maintained allow-list translating the canonical Microcard CTA's
 * `open_internal_route` target vocabulary (`lib/models/microcard-cta.ts`'s
 * `MICROCARD_INTERNAL_ROUTES` in `safespeak-admin`, duplicated here as plain
 * string keys since Frontend must never import Admin code) into this app's
 * real Dashboard routes. Never accepts arbitrary route text.
 */
/**
 * Phase 7.1 route audit (`report-submission-details-page.tsx`): `activeStep`
 * falls back to `"report"` whenever `fromTriage=1` is present and `step` is
 * absent/invalid, and a `useEffect` there immediately `router.replace`s to
 * the explicit `stepHref("report", true)` form
 * (`&step=report&fromTriage=1`) anyway — so the bare `&fromTriage=1` link
 * and the explicit `&step=report&fromTriage=1` link are behaviourally
 * identical, but the explicit form avoids that extra client-side redirect
 * and matches `stepHref()`'s own canonical output exactly. This is the one
 * shared constant every "start a report from Triage" call site reuses —
 * never a second duplicated literal route.
 */
export const REPORT_START_FROM_TRIAGE_HREF =
  "/dashboard?view=reportsubmissiondetails&step=report&fromTriage=1" as Route;

const INTERNAL_ROUTE_MAP: Record<string, Route> = {
  "/": "/dashboard" as Route,
  "/rights": "/dashboard?view=resources" as Route,
  "/support": "/dashboard?view=smartdialler" as Route,
  "/report": REPORT_START_FROM_TRIAGE_HREF,
  "/resources": "/dashboard?view=resources" as Route,
  // Phase 8.2 — was "/dashboard" (the generic dashboard home), which didn't
  // match a CTA labelled "Get emergency help" (the seeded
  // demo-microcard-safety-planning-quick-tip's `open_internal_route` CTA).
  // Smart Dialler is this app's existing urgent-help entry point (reused
  // the same way elsewhere, e.g. the Triage "Urgent help entry point"
  // awareness row) — not a new route, just correcting which existing route
  // this key resolves to.
  "/emergency": "/dashboard?view=smartdialler" as Route,
};

export function safeInternalRoute(target: string | undefined | null): Route | undefined {
  const trimmed = target?.trim();
  if (!trimmed) return undefined;
  return INTERNAL_ROUTE_MAP[trimmed];
}

/**
 * A same-origin public asset path (`/...`) or a validated `https://` URL
 * only. Rejects browser object URLs (`blob:`), `file:`/local filesystem
 * paths (including a Windows drive letter, e.g. `C:\...`), and any other
 * unsafe/unsupported protocol — never used to render an image sourced from
 * private local state or another user's session.
 */
export function safePublicImageSrc(path: string | undefined | null): string | undefined {
  const trimmed = path?.trim();
  if (!trimmed) return undefined;
  if (/^(blob|file|data|javascript):/i.test(trimmed)) return undefined;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return undefined;
  if (trimmed.startsWith("//")) return undefined;
  if (trimmed.startsWith("/")) return trimmed;
  return safeHttpsUrl(trimmed);
}

export type ContactActionKind = "call" | "email" | "website" | "book" | "refer" | "online_report";

export interface ContactAction {
  kind: ContactActionKind;
  href: string;
  label: string;
}

/** Only ever returns actions actually backed by valid data — never a placeholder entry. */
export function buildContactActions(input: {
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  bookingUrl?: string | null;
  referralUrl?: string | null;
  onlineReportingUrl?: string | null;
}): ContactAction[] {
  const actions: ContactAction[] = [];
  const tel = phoneHref(input.phone);
  if (tel) actions.push({ kind: "call", href: tel, label: `Call ${input.phone!.trim()}` });
  const mail = emailHref(input.email);
  if (mail) actions.push({ kind: "email", href: mail, label: "Email" });
  const website = safeHttpsUrl(input.website);
  if (website) actions.push({ kind: "website", href: website, label: "Visit website" });
  const booking = safeHttpsUrl(input.bookingUrl);
  if (booking) actions.push({ kind: "book", href: booking, label: "Book" });
  const referral = safeHttpsUrl(input.referralUrl);
  if (referral) actions.push({ kind: "refer", href: referral, label: "Referral information" });
  const onlineReport = safeHttpsUrl(input.onlineReportingUrl);
  if (onlineReport) actions.push({ kind: "online_report", href: onlineReport, label: "Report online" });
  return actions;
}
