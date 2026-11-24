# EduMind ICT Online — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Every unmatched Firestore path is denied for both reads and writes (`match /{document=**} { allow read, write: if false; }`).
2. **PII Isolation**: Student names, classes, and scores in `/student_analytics/{studentId}` and `/student_events/{eventId}` are NEVER readable or listable by unauthenticated users or non-staff users. Only verified Admin (`khanhbp0805@gmail.com` with `email_verified == true` or UID in `/admins/{uid}`) and verified Teacher (UID in `/teachers/{uid}`) may read/list analytics.
3. **No Self-Assigned Privileges**: Users cannot create or mutate `/admins/{uid}` or `/teachers/{uid}` unless they already pass `isAdmin()`.
4. **Direct Non-Destructive Student Persistence**: Students (without Google accounts) may create their own initial record or apply strictly monotonic additive increments (`loginCount +0..1`, `sessionsCount +0..1`, `totalQuestions +0..200`, `totalCorrect +0..200`, `totalPoints +0..10000`, `arrayUnion(completedLessonIds)`) to `/student_analytics/{studentId}`. Existing counters, `id`, `name`, `grade`, `className`, `firstLoginAt`, and `createdAt` can NEVER be reduced or overwritten by unauthenticated writes.
5. **Immutable Append-Only Fallback Events**: `/student_events/{eventId}` allows strictly validated `create` operations as an offline/fallback queue with bounded string/numeric sizes, strict key allowlists (`hasAll` + `hasOnly`), regex-validated `studentId` and `eventId`, and `createdAt == request.time`. Events cannot be updated (`allow update: if false`), and can only be read/listed/deleted by verified staff after folding into `/student_analytics/{studentId}`.
6. **Anti-Update-Gap & Temporal Integrity**: Every `create` and `update` on `/student_analytics/{studentId}` calls `isValidStudentAnalytics(incoming())`, enforces immutable `id` and `createdAt`, requires `updatedAt == request.time`, and restricts modified keys via `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Analytics Read**: `GET /student_analytics/stu-123` with `auth = null` -> DENIED.
2. **Unauthenticated Analytics List Scraping**: `LIST /student_analytics` with `auth = null` -> DENIED.
3. **Unverified Email Admin Spoof**: `LIST /student_analytics` with `auth.token.email = "khanhbp0805@gmail.com"` and `auth.token.email_verified = false` -> DENIED.
4. **Non-Staff Authenticated User Read**: `GET /student_analytics/stu-123` with verified random Google user (`student@gmail.com`) -> DENIED.
5. **Privilege Escalation (Self-Admin Creation)**: `CREATE /admins/{myUid}` by non-admin user -> DENIED.
6. **Privilege Escalation (Self-Teacher Creation)**: `CREATE /teachers/{myUid}` by non-admin user -> DENIED.
7. **Shadow Field Injection on Student Event**: `CREATE /student_events/evt-shadow-1` containing extra ghost field `isAdmin: true` -> DENIED (`hasOnly` blocks unknown keys).
8. **ID Poisoning on Student Event**: `CREATE /student_events/invalid$id!with/junk` or 200-char ID -> DENIED (`isValidId` blocks invalid ID).
9. **Resource Exhaustion / 1MB String Poisoning**: `CREATE /student_events/evt-huge-1` with `name` of 5000 characters -> DENIED (`name.size() <= 100`).
10. **Forged Timestamp on Student Event**: `CREATE /student_events/evt-ts-1` with client-forged `createdAt` != `request.time` -> DENIED.
11. **Mutating Immutable Student Event**: `UPDATE /student_events/evt-1` even by admin -> DENIED (`allow update: if false`).
12. **Mutating Immutable `createdAt` or `id` on Student Analytics**: `UPDATE /student_analytics/stu-1` changing `createdAt` or `id` -> DENIED (`affectedKeys().hasOnly(...)` + immutability check).
13. **Destructive Counter Reset on Student Analytics**: Unauthenticated `UPDATE /student_analytics/stu-1` lowering `loginCount`, `sessionsCount`, `totalPoints`, or shrinking `completedLessonIds` -> DENIED (monotonic additive guards).
14. **Arbitrary Score Inflation on Student Analytics**: Unauthenticated `UPDATE /student_analytics/stu-1` adding `+50000` points or `+50` sessions in one write -> DENIED (per-write delta cap).
