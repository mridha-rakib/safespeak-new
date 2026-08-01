import { getContentRepository, type ContentRepository } from "@/lib/mock/content-repository";
import {
  reportingDestinationToViewModel,
  type ReportDestinationViewModel,
} from "@/lib/mock/report-destination-view-model";
import type { ReportFlowDraft } from "@/lib/report-flow";

/**
 * Phase 7.2 — the one place a `ReportFlowDraft`'s `selectedDestinationId` is
 * turned into a full public destination view, for the mock/no-backend
 * branch only. This resolver never touches the live backend branch
 * (`selectedDestinationSource === "backend"`) or the onboarding Destination
 * step's own triage-service-derived fallback list
 * (`selectedDestinationSource === "manual"`) — those keep using their
 * existing resolution paths untouched, reported here as
 * `"incompatible_source"` so a caller can fall back to its existing
 * cached-name display without this resolver silently mixing catalogues.
 */
export type ReportDestinationResolution =
  | { status: "found"; destination: ReportDestinationViewModel }
  | { status: "not_found" }
  | { status: "incompatible_source" }
  | { status: "unavailable" };

export function resolveSelectedReportDestination(
  draft:
    | Pick<ReportFlowDraft, "selectedDestinationId" | "selectedDestinationSource">
    | null
    | undefined,
  repository: ContentRepository = getContentRepository()
): ReportDestinationResolution {
  if (!draft?.selectedDestinationId) {
    return { status: "not_found" };
  }

  if (draft.selectedDestinationSource !== "mock_bundle") {
    return { status: "incompatible_source" };
  }

  if (!repository.isReady()) {
    return { status: "unavailable" };
  }

  const record = repository.getById("reportingDestinations", draft.selectedDestinationId);
  if (!record) {
    return { status: "not_found" };
  }

  const sourceBundleVersion = repository.getManifest()?.schemaVersion ?? "unknown";
  return { status: "found", destination: reportingDestinationToViewModel(record, sourceBundleVersion) };
}
