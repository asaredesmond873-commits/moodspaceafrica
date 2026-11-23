# Security Specification — MoodSpace Africa

## 1. Data Invariants
1. **PII Isolation (Split Collection)**: Public creator profiles (`/publicProfiles/{userId}`) contain zero PII (`email`, `phone`, `address`). Private PII (`/userPrivate/{userId}`) and private saved bookmarks (`/userPrivate/{userId}/savedPosts/{postId}`) are strictly readable and writable only by the owner (`request.auth.uid == userId`).
2. **Identity Integrity**: Every write to `/publicProfiles/{userId}`, `/userPrivate/{userId}`, `/userPrivate/{userId}/savedPosts/{postId}`, `/verificationRequests/{userId}`, `/posts/{postId}`, `/posts/{postId}/likes/{userId}`, `/posts/{postId}/comments/{commentId}`, and `/posts/{postId}/submissions/{submissionId}` requires `request.auth != null`, `request.auth.token.email_verified == true`, and checks that the owner/author/submitter UID matches `request.auth.uid` (or `isAdmin()` for verification moderation).
3. **Immutable Ownership & Temporal Integrity**: `createdAt`, `id`, and `authorId` / `uid` / `submitterId` / `postAuthorId` are immutable after creation. All `createdAt` and `updatedAt` timestamps must equal `request.time`.
4. **Master Gate & Atomic Engagement Counts**: Likes, comments, and form submissions require parent `/posts/{postId}` existence, and atomic updates to `likesCount`, `commentsCount`, and `submissionsCount` are verified via `getAfter` / `existsAfter` and exact `+1` / `-1` deltas. Saved bookmarks require parent `/posts/{postId}` existence on create.
5. **Form Submission Privacy**: Form submissions (`/posts/{postId}/submissions/{submissionId}`) can ONLY be read (`get` and `list`) by the post creator (`resource.data.postAuthorId == request.auth.uid`) or the original submitter (`resource.data.submitterId == request.auth.uid`). Submissions can only be created when `hasForm == true` and `formConfig.isOpen == true` on the parent post.
6. **Verification Privilege Separation & Admin Bootstrapping**:
   - Users can never self-assign `badgeVerified: true` on `/publicProfiles/{userId}` (`create` forces `false`; owner `update` `affectedKeys()` excludes `badgeVerified` and `verifiedLabel`).
   - Only the verified bootstrapped admin (`request.auth.token.email_verified == true && request.auth.token.email == 'asaredesmond873@gmail.com'`) can approve or reject `/verificationRequests/{userId}` and update `badgeVerified` / `verifiedLabel` on `/publicProfiles/{userId}`.
   - Submitted verification proofs (`/verificationRequests/{userId}`) contain sensitive identity references and are readable (`get` and `list`) strictly by the applicant (`uid == request.auth.uid`) and the bootstrapped admin.
7. **Path & Size Poisoning Guards**: All document IDs are validated against `^[a-zA-Z0-9_\-]+$` and bounded to `<= 128` characters. Every string field and array field (`formConfig.fields <= 15`) has explicit `.size()` bounds.
8. **Bidirectional Follow Atomicity & Anti-Self-Follow**: Writes to `/publicProfiles/{targetUid}/followers/{followerUid}` and `/publicProfiles/{followerUid}/following/{targetUid}` are strictly authorized only for `request.auth.uid == followerUid`, forbid `followerUid == targetUid`, require both public profiles to exist, and enforce cross-subcollection `existsAfter` / `!existsAfter` atomicity.

## 2. "Dirty Dozen+" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Verification Escalation on Profile Create**: Creating `/publicProfiles/{uid}` with `badgeVerified: true` -> Blocked by `create` check requiring `badgeVerified == false`.
2. **Self-Verification Escalation on Profile Update**: Profile owner updating `/publicProfiles/{uid}` to set `badgeVerified: true` -> Blocked by owner `affectedKeys().hasOnly(...)` whitelist.
3. **Non-Admin Verification Approval Spoof**: Non-admin user updating `/verificationRequests/{targetUid}` to `status: 'approved'` -> Blocked by `isAdmin()` check.
4. **Unverified Admin Email Spoof**: User with `email_verified == false` attempting admin write -> Blocked by `isAdmin()` requiring `isVerified()`.
5. **Verification Proof Snooping**: User B attempting `get` or `list` on `/verificationRequests/{userA}` -> Blocked by `isOwner(userId) || isAdmin()`.
6. **Bookmark Snooping / Dangling Bookmark**: User B reading `/userPrivate/{userA}/savedPosts/{postId}`, or User A bookmarking a nonexistent `postId` -> Blocked by `isOwner(userId)` and `exists(.../posts/$(postId))`.
7. **PII Blanket Read Attempt**: User B attempting `get` or `list` on `/userPrivate/{userA}` -> Blocked by `isOwner(userId)`.
8. **Identity Spoofing on Post Create**: User B creating `/posts/{postId}` with `authorId: userA` -> Blocked by `data.authorId == request.auth.uid`.
9. **Post Counter Tampering on Create**: Creating `/posts/{postId}` with `likesCount: 9999` -> Blocked by `data.likesCount == 0`.
10. **Author Self-Inflation of Likes**: Post author updating `likesCount` directly without a matching atomic `/likes/{uid}` write -> Blocked by `existsAfter(...)` and `+1`/`-1` check.
11. **Closed Form Submission Attack**: Submitting a response to `/posts/{postId}/submissions/{subId}` when `formConfig.isOpen == false` -> Blocked by parent `get()` check.
12. **Comment Moderation Hijack**: User C attempting to delete User B's comment on User A's post -> Blocked by `existing().authorId == request.auth.uid || get(...post...).data.authorId == request.auth.uid`.
13. **Self-Follow or Asymmetric Follow Spoof**: User A creating `/publicProfiles/{userA}/followers/{userA}` or creating `/publicProfiles/{userB}/followers/{userA}` without atomically creating `/publicProfiles/{userA}/following/{userB}` -> Blocked by `followerId != userId` and `existsAfter(...)` cross-check.

