# BORINA TV — Firestore Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **PII Isolation**: Documents in `users/{userId}` contain email addresses and account statuses and may ONLY be read by the document owner (`request.auth.uid == userId`) or a verified Admin.
2. **RBAC Privilege Lock**: Users can NEVER self-assign `role: 'admin'` or mutate their own `role` or `status` fields.
3. **Payment & Subscription Integrity**:
   - Users may only create `payments` with `status == 'pending'`, `userId == request.auth.uid`, and `verifiedBy == ''`.
   - Users can NEVER transition a payment to `'paid'`, `'failed'`, `'expired'`, or `'refunded'`, nor alter `amountKhr`, `plan`, or `orderRef`.
   - Users can NEVER create or modify `subscriptions` directly; only Admin (or verified server-side confirmation) activates, extends, or suspends Premium access.
4. **Community Upload Moderation**:
   - Creators must confirm distribution rights (`rightsConfirmed == true`) and can only create `series` and `episodes` with `status == 'pending'` and `isPremium == false`.
   - Unapproved (`pending`, `rejected`, `changes_requested`) series and episodes are invisible to public visitors and other non-owner users.
   - Creators can only edit or delete their own content (`creatorId == request.auth.uid`).
5. **Immutable Audit Trail**: `audit_logs` can only be appended by verified Admins and can never be updated or deleted.
6. **Temporal & Volumetric Integrity**: Every string field has an explicit `.size()` ceiling, every document ID is validated with `isValidId()`, and every `createdAt`/`updatedAt` timestamp must equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Self-Assigned Admin Role (`users`)**: `{ "uid": "u1", "email": "attacker@x.com", "displayName": "Attacker", "role": "admin", "status": "active" }`
2. **Shadow Field Injection (`users`)**: Update `users/u1` adding ghost key `{ "isPremium": true, "displayName": "X" }`
3. **PII Blanket Read (`users`)**: User `u2` attempting `getDoc(doc(db, 'users', 'u1'))` or `getDocs(collection(db, 'users'))`
4. **Payment Status Self-Approval (`payments`)**: User `u1` updating own payment `{ "status": "paid", "verifiedBy": "u1" }`
5. **Payment Amount Tampering (`payments`)**: User `u1` updating own pending payment `{ "amountKhr": 100 }`
6. **Subscription Self-Activation (`subscriptions`)**: User `u1` creating `{ "userId": "u1", "plan": "yearly", "status": "active", "amountKhr": 100000, "currency": "KHR" }`
7. **Bypassing Upload Moderation (`series`)**: Creator `c1` creating series with `{ "status": "approved", "isPremium": true, "featured": true }`
8. **Missing Copyright Confirmation (`series`)**: Creator `c1` creating series with `{ "rightsConfirmed": false, "status": "pending" }`
9. **Cross-Creator Hijack (`series`)**: Creator `c2` updating or deleting a series owned by `c1`
10. **Orphaned Episode Injection (`episodes`)**: Creator `c1` creating an episode referencing a non-existent `seriesId: "fake_series_999"`
11. **Unverified Admin Email Spoof (`site_settings`)**: Authenticated token with `email: "ren58791@gmail.com"` and `email_verified: false` updating `monthlyPriceKhr`
12. **Audit Log Tampering (`audit_logs`)**: Any user (including Admin) attempting `update` or `delete` on an existing `audit_logs/{logId}` document
