# CivicResolve Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **No PII on Public Ledger**: `/issues/{issueId}` documents never contain reporter names, emails, or phone numbers. Contact details live strictly in `/issueContacts/{issueId}` and `/smsSubscriptions/{subId}`, readable only by `authorUid == request.auth.uid` or `isAdmin()`.
2. **Identity & Temporal Integrity**: Every user-created document must assert `authorUid == request.auth.uid`, `request.auth.token.email_verified == true`, and server-enforced timestamps (`createdAt == request.time`).
3. **Immutable Ownership & Status Guardrails**: Non-admin citizens cannot elevate `status` beyond `'Reported'`, set `aiApproved = true`, or modify `assignedDepartment`, `assignedCrew`, or `adminNotes`. Only `isAdmin()` may transition workflow status, dispatch crews, update governance rules, or delete issues.
4. **Administrator Identity**: Administrative API operations require a Firebase ID token with the trusted `admin: true` custom claim. Firestore administrators may also be granted access through `/admins/{uid}` documents. Never grant custom claims from browser code or rely on a hard-coded email address.
5. **Atomic Endorsements**: Creating `/issues/{issueId}/endorsements/{userId}` requires matching `userId == request.auth.uid`, parent issue existence, and atomic `endorsementCount == existing + 1` via `getAfter(...)`.
6. **Path ID & Payload Bounds**: Every document ID passes `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and every string/list field enforces strict `.size()` bounds.

## 2. Adversarial "Dirty Dozen" Payloads (All Expected: PERMISSION_DENIED)
1. **Shadow Field Injection on Issue Create**: `{ ..., isAdminOverride: true }` -> Rejected by `keys().hasOnly(...)`.
2. **PII Leak Attempt on Public Issue**: `{ ..., reporterDisplay: "Resident", reporterEmail: "citizen@example.com" }` -> Rejected by `keys().hasOnly(...)`.
3. **Spoofed Author UID on Issue Create**: Signed in as `uid-A`, submits `{ ..., authorUid: "uid-B" }` -> Rejected by `authorUid == request.auth.uid`.
4. **Citizen Self-Resolving Issue on Create**: Non-admin submits `{ ..., status: "Resolved", aiApproved: true }` -> Rejected by initial status invariant.
5. **Unverified Email Write**: `request.auth.token.email_verified == false` -> Rejected by `isVerifiedUser()`.
6. **Client-Forged Timestamp**: Submits `{ ..., createdAt: "2020-01-01T00:00:00Z" }` -> Rejected by `createdAt == request.time`.
7. **ID Poisoning**: Document path `/issues/../../admins/evil` or 500-char ID -> Rejected by `isValidId(issueId)`.
8. **Non-Admin Status Transition**: Non-admin tries `PATCH /issues/{id}` setting `status: "Dispatched"` -> Rejected by `isAdmin()`.
9. **Value Poisoning on Endorsement Count**: Non-admin bumps `endorsementCount` directly by `+500` without atomic endorsement doc -> Rejected by `getAfter` + `endorsementCount == existing + 1`.
10. **PII Blanket Read by Another User**: `uid-B` tries `get(/issueContacts/issue-of-uid-A)` -> Rejected by `authorUid == request.auth.uid || isAdmin()`.
11. **Orphaned Comment Write**: Posting to `/issues/nonexistent/comments/c1` -> Rejected by Master Gate `exists(/databases/.../issues/$(issueId))`.
12. **Admin Privilege Escalation**: Non-admin writes `/admins/{uid}` -> Rejected unless the verified Firebase ID token carries the trusted `admin: true` custom claim.

## API requirements

- Every AI endpoint and mutation requires a verified Firebase ID token.
- Administrative API mutations require the signed `admin: true` custom claim.
- Comment author name and role are derived from the verified token, not request-body fields.
- Public issue JSON and CSV omit reporter contact details.
