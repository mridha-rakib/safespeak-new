# Phase 8 / 8.1 — manual report builder (Language → Community → Incident Report → Review → Destination → Consent → Complete)

This is a **mock-only, frontend-only** phase: no real backend, no real API, no real OCR/PDF/DOC extraction, no real video transcription, no real AI report generation, no cloud file storage, and no real external report submission. Its purpose is a fully local/demo manual reporting journey that is honest at every step about what did and did not happen.

Route: `/dashboard?view=reportsubmissiondetails&step=language`.

## The two entry modes, sharing one route

`report-submission-details-page.tsx` serves **both** entry modes on the same `view=reportsubmissiondetails` route, distinguished by the `fromTriage=1` query flag:

- **Manual entry** (`fromTriage` absent): the seven-stage flow below.
- **Assistant/Triage entry** (`fromTriage=1`): unchanged from before Phase 8 — reaches the same shared `report` (Incident Report) step, then its own six-stage onboarding (`review → next → preview → destination → consent → complete`, `REPORT_REVIEW_ONBOARDING_STEPS` in `report-review-onboarding.ts`). **This chain was not modified by Phase 8 or 8.1.**

Both entry modes share: the canonical `ReportFlowDraft` (`report-flow.ts`), the local evidence store (`report-evidence.ts`), and the `DestinationStage`/`ConsentStage`/`CompleteStage` components (`report-review-onboarding-pages.tsx`) — only the step *sequence* differs.

## The seven manual stages

Canonical source: `MANUAL_REPORT_FLOW_STAGES` in `report-review-onboarding.ts`. **Every** progress indicator (desktop and mobile, pre-report and post-report) reads from this one array — there is no second hardcoded label list (Phase 8.1 removed the one that had crept into `ManualReportFlowProgress`).

1. **Language** — `report-submission-details-page.tsx`'s `steps` array, id `language`.
2. **Community** — id `community`.
3. **Incident Report** — id `report` (kept for backward compatibility with existing links like `?step=report&fromTriage=1`; only its label/content changed from the old "Report").
4. **Review** — `MANUAL_REVIEW_ONBOARDING_STEPS.review` (a **separate, manual-only** stage from Triage's read-only `review`/`next`/`preview` chain — see below).
5. **Destination** — shared `DestinationStage`.
6. **Consent** — shared `ConsentStage`.
7. **Complete** — shared `CompleteStage`.

### Removed: Know, Privacy, Hub/Services

The old pre-report steps `information` (Know), `privacy` (Privacy), and `services` (Hub) were deleted (`InformationStep`/`PrivacyStep`/`ServiceHubStep` no longer exist). Any old link to one of these — or to `know`/`hub` — is centrally normalised via `LEGACY_MANUAL_DETAILS_STEP_MAP` (`report-review-onboarding.ts`) to the Incident Report step, preserving the draft, never rendering the removed page. A manual visit to the Triage-only `next`/`preview` sub-stages is separately normalised (`normalizeManualOnboardingStep`) to `review`.

### Why Review is a separate stage from Triage's

Triage's `review`/`next`/`preview` chain (`REPORT_REVIEW_ONBOARDING_STEPS`) is read-only and unchanged. The manual flow's `review` stage is a **different, richer, editable** stage (`ManualReviewStage` in `manual-report-review-pages.tsx`): editable title/narrative, language/community with "Change" links, a full evidence list with previews and removal. Both stages happen to use the same query value (`step=review`) — which one renders is decided purely by `fromTriage`, exactly like the pre-existing pattern for `destination`/`consent`/`complete`.

## Language

Catalogue: `report-language.ts`, `REPORT_LANGUAGE_OPTIONS`. Nine languages: English, Arabic, Mandarin Chinese, Cantonese, Vietnamese, Punjabi, Hindi, **Bengali (`bn-BD`, added in Phase 8.1)**, Greek. Each option has a stable `ReportLanguageCode`, an English name, and a native name. `formatReportLanguageLabel()` renders `"Native — English"` (e.g. `"বাংলা — Bengali"`); a code with no match renders `"No language selected"`, never a raw code.

**No automatic translation.** `LANGUAGE_TRANSLATION_DISCLAIMER` is shown on the Language stage and states plainly that typed text and attached files are not translated. The selected code/label are written into `ReportFlowDraft.language`/`.languageLabel` and survive Continue/Back/refresh/Review/Destination/Consent/Complete (they're part of the one canonical draft, not a separate flow-local state).

## Community

Catalogue: `report-community.ts` (`REPORT_COMMUNITY_OPTIONS`, up to 3 selections, plus `REPORT_COMMUNITY_SKIP_OPTION = "Prefer not to say"`). Never inferred from language, narrative text, or location. Selection is written into `ReportFlowDraft.community`/`.communityLabel` on every toggle (not only on Continue).

## Incident Report

Component: `ReportEntryStep` in `report-submission-details-page.tsx` (shared with Triage — the classification/matched-pathway/services/legal-info cards only render when a Triage `overview` exists). Heading: "Tell us what happened". Optional prompt chips (What/When/Where/Who/How/anything else) are decorative hints, never mandatory fields.

**Validation**: Continue ("Review your incident") requires either non-whitespace narrative text or at least one attached file — never both. The message is plain language: *"Add a short description of what happened, or attach a supported file, before continuing."*

### Supported attachment categories

`demo-evidence-processing.ts`:

| Category | Extensions | Real processing |
|---|---|---|
| Document | `pdf`, `txt`, `doc`, `docx` | `.txt` only: safe local `FileReader.readAsText()`, capped at 4000 characters, preserved verbatim (Unicode included). Everything else: metadata only, clearly labelled "simulated". |
| Image | `jpg`, `jpeg`, `png`, `webp` | None — current-session preview only (see below), no OCR/visual analysis claimed. |
| Video | `mp4`, `mov`, `webm` | None — current-session native `<video controls>` preview only, no transcription/content-analysis claimed. |

Limits (`MANUAL_EVIDENCE_LIMITS`): 8 files, 25 MB each, shown to the user before they pick files. Validation reasons are always plain language (`validateEvidenceFile`) — no raw codes.

### Human-readable formatting (`report-format.ts`)

Single source for every rendered value: `formatFileSize` (bytes → B/KB/MB/GB), `formatEvidenceFileType` (e.g. `"PDF document"`, never a raw MIME type), `formatEvidenceStatus`, `formatEvidenceAvailabilityNote`, `formatMachineValue` (snake_case → Title Case), `formatReadableDate(Time)`.

Status vocabulary (`EvidenceStatus` / `EVIDENCE_STATUS_LABELS`):

| Internal | Shown | When |
|---|---|---|
| `selected` | Attached locally | The instant a file passes validation, before demo processing resolves. |
| `demo_processing` | Preparing demo preview | Reserved for a future async pipeline — not produced by the current synchronous demo. |
| `ready` | Ready for review | After demo processing resolves normally. |
| `needs_attention` | Needs attention | e.g. a `.txt` file that could not be read safely. |
| `unsupported` | Unsupported file type | Reserved — the current UI rejects unsupported files at selection time rather than storing a flagged record. |
| `removed` | Removed | Reserved — removal deletes the record outright rather than flagging it. |

`demo_processing`/`unsupported`/`removed` are intentionally-kept, currently-unused members of the same enum a real backend pipeline would need — consistent with this codebase's general "mock is a drop-in-replaceable stand-in for the real thing" approach (see `docs/PHASE_6_MOCK_MATCHING.md`).

### Evidence fingerprint + duplicate handling (Phase 8.1)

`ManualEvidenceItem.id` includes a random suffix (so a removed file can always be re-added deliberately) — it is **not** used for duplicate detection. `computeEvidenceFingerprint(file, extension)` (`report-evidence.ts`) builds a deterministic `name|size|lastModified|extension` string instead, never shown to the user. `handleFilesSelected` checks a new file's fingerprint against both the in-memory batch/component state (fast path) and `hasManualEvidenceFingerprint()` reading the store directly (source-of-truth path, guards against stale component state after evidence was removed elsewhere — see below). A duplicate is skipped with `"<name> is already attached."`; removing a file frees its fingerprint for a deliberate re-add.

### Object URL lifecycle and current-session previews (Phase 8.1)

`report-evidence-runtime.ts` is a small **in-memory-only** module (never sessionStorage-backed) mapping evidence id → the live `File` object and a lazily-created `URL.createObjectURL()` preview. It survives client-side navigation between manual-flow steps (the page component doesn't remount on a `step=` query change) but is correctly wiped on a hard refresh/new tab, which is exactly the "is the original file still available" signal the UI needs — no extra bookkeeping required to detect a refresh.

- `EvidenceAttachmentCard` (`manual-report-review-pages.tsx`, shared by the Incident Report attach panel and the Review stage) renders an `<img>`/`<video controls playsInline>` preview only when `hasLiveEvidenceFile(id)` is true. Video is never autoplayed. An `onError` handler falls back to a neutral "This preview couldn't be loaded" message rather than a broken media element.
- Object URLs are revoked (`revokeLiveEvidenceFile`) on explicit removal; `revokeAllLiveEvidenceFiles()` is called from Quick Exit for hygiene.
- Only metadata (name/size/type/extension/status/demoNote/extractedText/fingerprint) is ever written to sessionStorage — never a `File` object, never an object URL string.

### Truthful refresh behaviour

After a refresh, `hasLiveEvidenceFile(id)` is false for every previously-attached item. The card then shows, instead of a broken preview:

> *"The attachment details are saved in this demo, but the original local file must be selected again after a browser refresh."*

for documents, or *"Preview unavailable after refresh. Reselect the file to preview it again."* for images/videos — **only** when the file is genuinely no longer live; never shown while the original `File` object is still available in the tab.

### File-only reports

A report with attachments but no narrative is valid (Incident Report and Review both accept it). The Review stage shows a non-blocking prompt: *"Supporting files were attached. Add a description when you are ready to explain what happened."* No filename-derived allegation, incident fact, or legal classification is ever generated.

## Review (manual only)

`ManualReviewStage` (`manual-report-review-pages.tsx`): editable title (`#manual-review-title`) and narrative (`#manual-review-summary`, edits also patch `structuredFields.what` for consistency with the shared Destination/Consent copy), read-only Language/Community with "Change" links back to those stages, the same `EvidenceAttachmentCard` list with per-item Remove, and a `.txt` extracted-text preview behind a native `<details>` disclosure (never auto-merged into the narrative — the user copies in anything relevant themselves). Continue is blocked with the same plain-language message as Incident Report until there's a narrative or at least one attachment.

## Destination / Consent / Complete

Reused verbatim from `report-review-onboarding-pages.tsx` (`DestinationStage`/`ConsentStage`/`CompleteStage`), exported specifically so both the Triage router and `ManualReportReviewRouter` can share them without duplicating a page component. `Complete` never claims a real submission occurred ("has not shared, submitted, or sent"); a local demo reference may be shown but is always labelled as such.

**Phase 8.1 fix**: `buildManualDestinationOptions()` previously returned an empty list whenever there was no Triage-derived `overview` — which permanently blocked a purely-manual (never-touched-Triage) user at the Destination stage, since Continue there requires a selection. Fixed to fall back to the same `buildDemoSupportOptions()` catalogue `buildReportBuilderOverview()` already uses internally — not a new destination catalogue, and it fixes the identical gap for a Triage session with no recognised concern type too.

## Canonical state ownership

- **`ReportFlowDraft`** (`report-flow.ts`, sessionStorage key `safespeak_report_flow_draft`) — the one draft. Phase 8 added `language`/`languageLabel`/`community`/`communityLabel`/`entrySource`; no second draft store exists anywhere in the manual flow.
- **`ManualEvidenceItem[]`** (`report-evidence.ts`, sessionStorage key `safespeak_report_manual_evidence`) — the one evidence metadata store, referenced by id from `ReportFlowDraft.evidenceIds`. Separate from — and never touching — `evidence-client.ts` (the real-backend evidence vault client used by the unrelated `view=reportsubmissionevidence` flow).
- **Live file registry** (`report-evidence-runtime.ts`) — in-memory only, described above.

Latest-edits-win throughout: every mutation reads the current canonical draft/store immediately before merging, never a captured closure value.

## Test commands

```
npm run typecheck
npm run lint
npm test                                                    # unit (node:test via tsx)
npx playwright test tests/e2e/manual-report-flow.spec.ts        # legacy routes, progress, mobile, a11y
npx playwright test tests/e2e/manual-report-attachments.spec.ts # TXT/PDF/DOCX/image/video/combined, browser-verified
npm run build
```

Fixtures for the attachment specs live in `tests/fixtures/evidence/` (tiny, real, non-sensitive: a real minimal PDF, a placeholder DOCX, a real ~2 KB WebM and ~3 KB MP4 generated with `ffmpeg`, a real small PNG, English/Bengali `.txt` files, a zero-byte file, an unsupported `.mp3`, and a Unicode-named `.txt`).

## Deferred (explicitly out of scope)

Real backend, real API, production database, real authentication integration, real OCR, real PDF/DOC/DOCX extraction, real audio/video transcription, real AI report generation, cloud file storage, persistent raw file storage, real external report submission, live destination delivery, real receipt/reference generation, email/SMS notifications, production security hardening, full historical E2E stabilisation.
