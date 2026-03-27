# Knowledge Screen (DEEP SPEC)

## STATES

- idle
- uploading
- extracting
- review
- approved
- error

---

## FLOW

Upload → Extract → Review → Approve

---

## INTERACTION

- Show progress bar
- Allow cancel upload
- Preview extracted content
- Approve / reject

---

## EDGE CASES

- File too large
- Unsupported format
- Extraction fail

---

## RULES

- Cannot use knowledge until approved
- Tag required before saving
