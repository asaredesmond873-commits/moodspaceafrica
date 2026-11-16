# Security Specification — MoodSpace Africa

## 1. Data Invariants
1. **PII Isolation (Split Collection)**: Public creator profiles (`/publicProfiles/{userId}`) contain zero PII (`email`, `phone`, `address`). Private PII (`/userPrivate/{userId}`) is strictly readable and writable only by the owner (`request.auth.uid == userId`).
2. **Identity Integrity**: Every write to `/publicProfiles/{userId}`, `/userPrivate/{userId}`, `/posts/{postId}`, `/posts/{postId}/likes/{userId}`, `/posts/{postId}/comments/{commentId}`, and `/posts/{postId}/submissions/{submissionId}` requires `request.auth != null`, `request.auth.token.email_verified == true`, and checks that the owner/author/submitter UID matches `request.auth.uid`.
3. **Immutable Ownership & Temporal Integrity**: `createdAt`, `id`, and `authorId` / `uid` / `submitterId` / `postAuthorId` are immutable after creation. All `createdAt` and `updatedAt` timestamps must equal `request.time`.
4. **Master Gate & Atomic Engagement Counts**: Likes, comments, and form submissions require parent `/posts/{postId}` existence, and atomic updates to `likesCount`, `commentsCount`, and `submissionsCount` are verified via `getAfter` / `existsAfter` and exact `+1` / `-1` deltas.
5. **Form Submission Privacy**: Form submissions (`/posts/{postId}/submissions/{submissionId}`) can ONLY be read (`get` and `list`) by the post creator (`resource.data.postAuthorId == request.auth.uid`) or the original submitter (`resource.data.submitterId == request.auth.uid`). Submissions can only be created when `hasForm == true` and `formConfig.isOpen == true` on the parent post.
6. **Path & Size Poisoning Guards**: All document IDs are validated against `^[a-zA-Z0-9_\-]+$` and bounded to `<= 128` characters. Every string field and array field (`formConfig.fields <= 15`) has explicit `.size()` bounds.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Field Injection on Profile Create**: Creating `/publicProfiles/{uid}` with an extra ghost field `{ isVerified: true }` -> Blocked by `keys().hasOnly(...)`.
2. **Email Spoofing / Unverified Token Write**: Attempting to create `/posts/{postId}` with `request.auth.token.email_verified == false` -> Blocked by `isVerified()`.
3. **PII Blanket Read Attempt**: User B attempting `get` or `list` on `/userPrivate/{userA}` -> Blocked by `isOwner(userId)`.
4. **Identity Spoofing on Post Create**: User B creating `/posts/{postId}` with `authorId: userA` -> Blocked by `data.authorId == request.auth.uid`.
5. **Post Counter Tampering on Create**: Creating `/posts/{postId}` with `likesCount: 9999` -> Blocked by `data.likesCount == 0`.
6. **Author Self-Inflation of Likes**: Post author updating `likesCount` directly without a matching atomic `/likes/{uid}` write -> Blocked by `existsAfter(...)` and `+1`/`-1` check.
7. **Unauthorized Post Content Edit**: User B attempting to update `title` or `formConfig` on User A's post -> Blocked by `existing().authorId == request.auth.uid`.
8. **ID Poisoning Attack**: Writing a document with a 1500-char ID or invalid characters (`../admin`) -> Blocked by `isValidId()`.
9. **Client Timestamp Forgery**: Creating a post with `createdAt` backdated to 2020 -> Blocked by `incoming().createdAt == request.time`.
10. **Closed Form Submission Attack**: Submitting a response to `/posts/{postId}/submissions/{subId}` when `formConfig.isOpen == false` -> Blocked by parent `get()` check.
11. **Submission Snooping (List / Get)**: User C attempting to list `/posts/{postId}/submissions` belonging to Creator A -> Blocked by `resource.data.postAuthorId == request.auth.uid || resource.data.submitterId == request.auth.uid`.
12. **Comment Moderation Hijack**: User C attempting to delete User B's comment on User A's post -> Blocked by `existing().authorId == request.auth.uid || get(...post...).data.authorId == request.auth.uid`.
