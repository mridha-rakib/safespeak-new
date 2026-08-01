import type {
  ContractTristateValue,
  PublishedReportingDestination,
} from "@/lib/contract/published-content-contract";
import { buildContactActions, type ContactAction } from "@/lib/mock/safe-actions";
import { humanizeKey } from "@/lib/mock/triage-adapters";

/**
 * Phase 7.2 — the one typed, public-fields-only view of a governed Reporting
 * Destination, shared by every surface that needs to display a selected
 * destination (Triage detail modal, the onboarding Destination/Consent/
 * Complete stages). No Admin-only fields exist on `PublishedReportingDestination`
 * in the first place (the public contract never carries internal notes,
 * verification notes, audit metadata, or matching-rule ids), so there is
 * nothing to filter out here beyond simply never reading fields that don't
 * exist on the type — this still centralises the *mapping* so no two pages
 * invent their own humanisation/tri-state logic.
 */
export interface ReportDestinationViewModel {
  id: string;
  name: string;
  destinationType: string;
  description?: string;
  jurisdictions: string[];
  reportingMethods: string[];
  /** Never coerced — `"unknown"` stays `"unknown"`, never displayed as "No". */
  anonymousReporting: ContractTristateValue;
  emergencySuitability: ContractTristateValue;
  reportingInstructions?: string;
  evidenceGuidance?: string;
  responseExpectations?: string;
  publicDisclaimer?: string;
  contactActions: ContactAction[];
  sourceBundleVersion: string;
}

/** The one shared tri-state label map — every surface renders "unknown" the same way, never as "No". */
export const REPORT_DESTINATION_TRISTATE_LABEL: Record<ContractTristateValue, string> = {
  yes: "Yes",
  no: "No",
  unknown: "Unknown / not confirmed",
};

export function reportingDestinationToViewModel(
  record: PublishedReportingDestination,
  sourceBundleVersion: string
): ReportDestinationViewModel {
  return {
    id: record.id,
    name: record.name,
    destinationType: humanizeKey(record.destinationType),
    description: record.fullDescription ?? record.description,
    jurisdictions:
      record.jurisdictions.length > 0
        ? record.jurisdictions
        : record.australiaWide
          ? ["Australia-wide"]
          : [],
    reportingMethods: record.reportingMethods.map(humanizeKey),
    anonymousReporting: record.anonymousReporting,
    emergencySuitability: record.emergencySuitability,
    reportingInstructions: record.reportingInstructions,
    evidenceGuidance: record.evidenceGuidance,
    responseExpectations: record.responseExpectations,
    publicDisclaimer: record.publicDisclaimer,
    contactActions: buildContactActions({
      phone: record.phone,
      onlineReportingUrl: record.onlineReportingUrl,
    }),
    sourceBundleVersion,
  };
}
