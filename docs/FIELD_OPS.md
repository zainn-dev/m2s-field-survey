# Field & Console Operations Manual — M2S Field Survey

## 1. User Roles & Consoles

| Role | Console | Capabilities |
| --- | --- | --- |
| `VOLUNTEER` | Volunteer Android App (`apps/mobile`) / Web Field Route | Create/edit `DRAFT` & `RETURNED` surveys, consent-based GPS capture, camera/gallery/PDF multi-page capture, offline IndexedDB queue |
| `SUPERVISOR` | Admin Web Console (`/admin`) | Review/approve/return/reject `SUBMITTED` surveys, verify documents, inspect GPS pins & volunteer monitoring within assigned clusters |
| `ADMIN` | Admin Web Console (`/admin`) | Manage volunteers/supervisors/clusters, re-review decided surveys, inspect audit logs, download Case File PDFs & exports |
| `SUPER_ADMIN` | Admin Web Console (`/admin`) | Full `ADMIN` privileges plus admin account management and system study settings |

## 2. Field Enumeration Workflow (Volunteers)

1. **Sign In**: Open the app URL on a mobile browser or install it via browser "Add to Home Screen". Volunteers authenticate through the field login screen (desktop admin login rejects `VOLUNTEER` accounts).
2. **Start a Survey**:
   - Record **Consent Given** before submission.
   - Complete **Part 1 (B1–B10)**: cluster selection, interviewer/translator, ID verification type + last 4 digits only (full 12-digit Aadhaar is blocked), head of household demographics, household counts, and income shift.
   - Complete **Part 2 (Q1a–Q28, sections A–F)** in English or Hindi; Q19, Q23 and Q25a allow several choices, and Q26–Q28 record the household's own words.
3. **Document Capture**:
   - Capture multi-page images (`JPG`/`PNG`) or `PDF`s (up to 10 pages, max 10 MB each) and confirm household consent per upload.
   - When offline, photos stay safely in IndexedDB until connectivity resumes. Clicking **Sync Queue** uploads queued drafts, uploads attached files, and completes final submission automatically.
4. **Returned Surveys**: If a supervisor marks a survey `RETURNED`, open it from the field list, address the reviewer feedback banner, and re-submit.

## 3. Verification & Review Workflow (Supervisors / Admins)

- **Review Queue (`/admin/reviews`)**:
  - Navigate records rapidly using keyboard shortcuts: `J`/`↓` (next), `K`/`↑` (previous), `V`/`Enter` (inspect), `A` (Approve), `R` (Return for corrections), `X` (Reject).
  - Returning or rejecting requires a clear explanation (minimum 5 characters) visible to the assigned volunteer.
- **Documents (`/admin/documents`)**: Preview multi-page uploads cleanly in-app, download individual pages or scoped ZIPs, and mark pages `VERIFIED` or `REJECTED`.
- **Exports (`/admin/exports`)**: Generate filtered `surveys.csv`, SPSS/R long-format `answers.csv`, multi-sheet `.xlsx` workbooks, cluster summaries, or streamed `documents.zip` bundles with `manifest.csv` and SHA-256 checksums.

## 4. Common Errors & Resolutions

- **`DOCUMENTS_REQUIRED` on submit**: Study settings require specific document categories (e.g., Aadhaar) before submission. Upload the missing document category and re-submit.
- **`REVISION_CONFLICT` (`409`)**: The record was updated on the server after the draft was opened locally. Refresh/reload the latest server revision before re-applying changes.
- **`MALWARE_DETECTED` (`422`)**: An uploaded PDF contains active scripts/launch actions or triggered scanner checks. Capture clean images or flatten/re-scan the document.

