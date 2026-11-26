import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  CHALLENGE_LIMITS,
  type ChallengeConfig,
  type ChallengeDailyVote,
  type ChallengeVideo,
  type ChallengeVideoComment,
  type CreatorSubscription,
  type GiftType,
  type MoMoProvider,
  type PublicProfile,
  SCHEMA_LIMITS,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanType,
} from '../types';
import {
  cacheUploadedVideoBlob,
  encodeFileIntoBase64Chunks,
  getTodayUtcDateKey,
  type ValidatedVideoMeta,
} from '../utils/challengeMedia';
import { generateSafeId } from '../utils/media';

const DEFAULT_CONFIG: ChallengeConfig = {
  isPublic: true,
  sponsorName: 'Community',
  prizeGhs: CHALLENGE_LIMITS.PRIZE_GHS,
  winnerVideoId: '',
  winnerName: 'Ama Serwaa',
  winnerLocation: 'Accra, Ghana',
  winnerTitle: 'Voices Along the Coast — Pan-African Rhythm',
  winnerThumbnailUrl: '',
  winnerRoundLabel: 'Previous Round',
  winnerPrizeGhs: CHALLENGE_LIMITS.PRIZE_GHS,
  updatedAt: null,
};

function clamp(str: string, max: number): string {
  return (str || '').trim().slice(0, max);
}

function maskMobileNumber(rawPhone: string): string {
  const cleaned = rawPhone.replace(/\s+/g, '').trim();
  if (cleaned.length <= 4) return cleaned;
  return `${cleaned.slice(0, 3)}****${cleaned.slice(-3)}`;
}

export function subscribeChallengeConfig(
  onUpdate: (config: ChallengeConfig) => void
): () => void {
  const ref = doc(db, 'challengeConfig', 'current');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onUpdate({
          ...DEFAULT_CONFIG,
          ...(snap.data() as Partial<ChallengeConfig>),
        });
      } else {
        onUpdate(DEFAULT_CONFIG);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'challengeConfig/current');
    }
  );
}

export async function saveChallengeConfig(
  nextConfig: Omit<ChallengeConfig, 'isPublic' | 'updatedAt'>
): Promise<void> {
  const path = 'challengeConfig/current';
  try {
    await setDoc(doc(db, 'challengeConfig', 'current'), {
      isPublic: true,
      sponsorName: clamp(nextConfig.sponsorName, 80) || 'Community',
      prizeGhs: Math.max(0, Math.round(nextConfig.prizeGhs)),
      winnerVideoId: clamp(nextConfig.winnerVideoId, 128),
      winnerName: clamp(nextConfig.winnerName, 80),
      winnerLocation: clamp(nextConfig.winnerLocation, 100),
      winnerTitle: clamp(nextConfig.winnerTitle, 120),
      winnerThumbnailUrl: (nextConfig.winnerThumbnailUrl || '').slice(0, 200000),
      winnerRoundLabel: clamp(nextConfig.winnerRoundLabel, 60),
      winnerPrizeGhs: Math.max(0, Math.round(nextConfig.winnerPrizeGhs)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeChallengeVideos(
  roundId: string,
  onUpdate: (videos: ChallengeVideo[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'challengeVideos';
  const q = query(collection(db, path), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as ChallengeVideo)
        .filter((v) => v.roundId === roundId && v.videoReady === true);

      const now = Date.now();
      list.sort((a, b) => {
        const aBoosted = a.boostedUntil > now ? 1 : 0;
        const bBoosted = b.boostedUntil > now ? 1 : 0;
        if (aBoosted !== bBoosted) return bBoosted - aBoosted;
        if (aBoosted && bBoosted && a.boostedUntil !== b.boostedUntil) {
          return b.boostedUntil - a.boostedUntil;
        }
        const aTime = a.createdAt ? a.createdAt.toMillis() : 0;
        const bTime = b.createdAt ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      });
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeAllChallengeVideos(
  onUpdate: (videos: ChallengeVideo[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'challengeVideos';
  const q = query(collection(db, path), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as ChallengeVideo)
        .filter((v) => v.videoReady === true)
        .sort((a, b) => {
          const aTime = a.createdAt ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function fetchUserRoundVideo(
  roundId: string,
  uid: string
): Promise<ChallengeVideo | null> {
  const videoId = `${roundId}__${uid}`;
  const path = `challengeVideos/${videoId}`;
  try {
    const snap = await getDoc(doc(db, 'challengeVideos', videoId));
    if (!snap.exists()) return null;
    const data = snap.data() as ChallengeVideo;
    return data.videoReady ? data : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function uploadChallengeVideo(
  roundId: string,
  author: PublicProfile,
  file: File,
  meta: ValidatedVideoMeta,
  title: string,
  caption = '',
  onProgress?: (percent: number, stage: string) => void
): Promise<ChallengeVideo> {
  const videoId = `${roundId}__${author.uid}`;
  const videoPath = `challengeVideos/${videoId}`;

  onProgress?.(10, 'Checking round entry...');
  const videoRef = doc(db, 'challengeVideos', videoId);
  const existingSnap = await getDoc(videoRef);
  if (existingSnap.exists()) {
    const existingData = existingSnap.data() as ChallengeVideo;
    if (existingData.videoReady) {
      throw new Error('You already uploaded your 1 video for this 14-day round.');
    }
    await deleteChallengeVideo(videoId);
  }

  onProgress?.(20, 'Preparing video segments...');
  const chunks = await encodeFileIntoBase64Chunks(file);

  const payload = {
    id: videoId,
    roundId,
    authorId: author.uid,
    authorName: clamp(author.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Storyteller',
    authorAvatar: (author.avatarUrl || '').slice(0, SCHEMA_LIMITS.AVATAR_URL_MAX),
    authorLocation: clamp(author.location || 'Africa', SCHEMA_LIMITS.LOCATION_MAX),
    title: clamp(title, CHALLENGE_LIMITS.TITLE_MAX),
    caption: clamp(caption, CHALLENGE_LIMITS.CAPTION_MAX),
    thumbnailUrl: (meta.thumbnailUrl || '').slice(0, CHALLENGE_LIMITS.THUMBNAIL_MAX),
    mimeType: clamp(meta.mimeType, 60) || 'video/mp4',
    durationSeconds: meta.durationSeconds,
    fileSizeBytes: meta.fileSizeBytes,
    chunkCount: chunks.length,
    videoReady: false,
    isActive: true,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    votesCount: 0,
    giftsCount: 0,
    giftsTotalGhs: 0,
    boostedUntil: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    onProgress?.(30, 'Registering story...');
    await setDoc(videoRef, payload);

    const BATCH_SIZE = 3;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const end = Math.min(i + BATCH_SIZE, chunks.length);
      for (let j = i; j < end; j += 1) {
        const chunkId = `chunk_${String(j).padStart(3, '0')}`;
        const chunkRef = doc(db, 'challengeVideos', videoId, 'chunks', chunkId);
        batch.set(chunkRef, {
          videoId,
          authorId: author.uid,
          index: j,
          data: chunks[j],
        });
      }
      await batch.commit();
      const pct = 30 + Math.round((end / chunks.length) * 62);
      onProgress?.(pct, `Uploading segment ${end} of ${chunks.length}...`);
    }

    onProgress?.(96, 'Publishing story to MoodSpace...');
    await updateDoc(videoRef, {
      videoReady: true,
      updatedAt: serverTimestamp(),
    });

    await cacheUploadedVideoBlob(videoId, file);
    onProgress?.(100, 'Story is live!');

    const saved = await getDoc(videoRef);
    return saved.data() as ChallengeVideo;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, videoPath);
  }
}

export async function deleteChallengeVideo(videoId: string): Promise<void> {
  const path = `challengeVideos/${videoId}`;
  try {
    const chunksSnap = await getDocs(
      query(
        collection(db, 'challengeVideos', videoId, 'chunks'),
        where('videoId', '==', videoId)
      )
    );
    for (const chunkDoc of chunksSnap.docs) {
      await deleteDoc(chunkDoc.ref);
    }
    await deleteDoc(doc(db, 'challengeVideos', videoId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function loadChallengeVideoChunks(videoId: string): Promise<string[]> {
  const path = `challengeVideos/${videoId}/chunks`;
  try {
    const q = query(collection(db, 'challengeVideos', videoId, 'chunks'), where('videoId', '==', videoId));
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index);
    return items.map((item) => item.data);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function checkUserLikedChallengeVideo(
  videoId: string,
  userId: string
): Promise<boolean> {
  const path = `challengeVideos/${videoId}/likes/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'challengeVideos', videoId, 'likes', userId));
    return snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function toggleChallengeVideoLike(
  videoId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<void> {
  const path = `challengeVideos/${videoId}/likes/${userId}`;
  try {
    const batch = writeBatch(db);
    const likeRef = doc(db, 'challengeVideos', videoId, 'likes', userId);
    const videoRef = doc(db, 'challengeVideos', videoId);

    if (currentlyLiked) {
      batch.delete(likeRef);
      batch.update(videoRef, {
        likesCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(likeRef, {
        userId,
        videoId,
        createdAt: serverTimestamp(),
      });
      batch.update(videoRef, {
        likesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeChallengeVideoComments(
  videoId: string,
  onUpdate: (comments: ChallengeVideoComment[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = `challengeVideos/${videoId}/comments`;
  const q = query(
    collection(db, 'challengeVideos', videoId, 'comments'),
    where('videoId', '==', videoId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as ChallengeVideoComment);
      list.sort((a, b) => {
        const aMs = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const bMs = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return aMs - bMs;
      });
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function addChallengeVideoComment(
  videoId: string,
  author: PublicProfile,
  text: string
): Promise<void> {
  const commentId = generateSafeId('vcmt');
  const path = `challengeVideos/${videoId}/comments/${commentId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'challengeVideos', videoId, 'comments', commentId), {
      id: commentId,
      videoId,
      authorId: author.uid,
      authorName: clamp(author.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Member',
      authorAvatar: (author.avatarUrl || '').slice(0, SCHEMA_LIMITS.AVATAR_URL_MAX),
      text: clamp(text, CHALLENGE_LIMITS.COMMENT_MAX),
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'challengeVideos', videoId), {
      commentsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteChallengeVideoComment(
  videoId: string,
  commentId: string
): Promise<void> {
  const path = `challengeVideos/${videoId}/comments/${commentId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'challengeVideos', videoId, 'comments', commentId));
    batch.update(doc(db, 'challengeVideos', videoId), {
      commentsCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function incrementChallengeVideoShare(videoId: string): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  const path = `challengeVideos/${videoId}`;
  try {
    await updateDoc(doc(db, 'challengeVideos', videoId), {
      sharesCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function incrementChallengeVideoView(videoId: string): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  try {
    await updateDoc(doc(db, 'challengeVideos', videoId), {
      viewsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Silent background view telemetry skip on contention
  }
}

export async function fetchMyDailyVote(
  userId: string,
  dateKey = getTodayUtcDateKey()
): Promise<ChallengeDailyVote | null> {
  const voteId = `${userId}__${dateKey}`;
  const path = `challengeDailyVotes/${voteId}`;
  try {
    const snap = await getDoc(doc(db, 'challengeDailyVotes', voteId));
    return snap.exists() ? (snap.data() as ChallengeDailyVote) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function castDailyVote(
  userId: string,
  videoId: string
): Promise<ChallengeDailyVote> {
  const dateKey = getTodayUtcDateKey();
  const voteId = `${userId}__${dateKey}`;
  const path = `challengeDailyVotes/${voteId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'challengeDailyVotes', voteId), {
      userId,
      dateKey,
      videoId,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'challengeVideos', videoId), {
      votesCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    return {
      userId,
      dateKey,
      videoId,
      createdAt: null,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function sendChallengeGift(
  videoId: string,
  sender: PublicProfile,
  giftType: GiftType
): Promise<number> {
  const amountGhs = CHALLENGE_LIMITS.GIFT_PRICES[giftType];
  const giftId = generateSafeId('gift');
  const path = `challengeVideos/${videoId}/gifts/${giftId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'challengeVideos', videoId, 'gifts', giftId), {
      id: giftId,
      videoId,
      senderId: sender.uid,
      senderName: clamp(sender.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Supporter',
      giftType,
      amountGhs,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'challengeVideos', videoId), {
      giftsCount: increment(1),
      giftsTotalGhs: increment(amountGhs),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return amountGhs;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function activateChallengeBoost(
  videoId: string,
  payerId: string,
  provider: MoMoProvider,
  rawPhone: string
): Promise<number> {
  const boostId = generateSafeId('boost');
  const path = `challengeVideos/${videoId}/boosts/${boostId}`;
  const boostedUntil = Date.now() + CHALLENGE_LIMITS.BOOST_DURATION_MS;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'challengeVideos', videoId, 'boosts', boostId), {
      id: boostId,
      videoId,
      payerId,
      provider,
      maskedPhone: maskMobileNumber(rawPhone),
      amountGhs: CHALLENGE_LIMITS.BOOST_COST_GHS,
      boostedUntil,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'challengeVideos', videoId), {
      boostedUntil,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return boostedUntil;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- Saved Videos (Bookmarks) ---

export function subscribeSavedVideoIds(
  uid: string,
  onUpdate: (savedIds: Set<string>) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = `userPrivate/${uid}/savedVideos`;
  const q = query(collection(db, 'userPrivate', uid, 'savedVideos'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const next = new Set<string>();
      snap.docs.forEach((d) => next.add(d.id));
      onUpdate(next);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function toggleSavedVideo(
  videoId: string,
  uid: string,
  currentlySaved: boolean
): Promise<void> {
  const path = `userPrivate/${uid}/savedVideos/${videoId}`;
  try {
    const ref = doc(db, 'userPrivate', uid, 'savedVideos', videoId);
    if (currentlySaved) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        userId: uid,
        videoId,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- Creator & Pro Subscriptions ---

export function subscribeMySubscriptions(
  uid: string,
  onUpdate: (subs: CreatorSubscription[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'creatorSubscriptions';
  const q = query(collection(db, path), where('subscriberId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as CreatorSubscription)
        .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeCreatorSubscribers(
  creatorUid: string,
  onUpdate: (subs: CreatorSubscription[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'creatorSubscriptions';
  const q = query(collection(db, path), where('targetId', '==', creatorUid));
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const list = snap.docs
        .map((d) => d.data() as CreatorSubscription)
        .filter((s) => s.status === 'active' && s.expiresAt > now)
        .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function upsertCreatorSubscription(input: {
  subscriber: PublicProfile;
  targetId: string;
  targetName: string;
  planType: SubscriptionPlanType;
  provider: MoMoProvider;
  rawPhone: string;
}): Promise<CreatorSubscription> {
  const subId = `${input.subscriber.uid}__${input.targetId}`;
  const path = `creatorSubscriptions/${subId}`;
  const amountGhs =
    input.planType === 'creator_pro'
      ? SUBSCRIPTION_PLANS.CREATOR_PRO_GHS
      : SUBSCRIPTION_PLANS.CREATOR_FAN_GHS;
  const expiresAt = Date.now() + SUBSCRIPTION_PLANS.DURATION_MS;
  const maskedPhone = maskMobileNumber(input.rawPhone);

  try {
    const ref = doc(db, 'creatorSubscriptions', subId);
    const existing = await getDoc(ref);

    if (existing.exists()) {
      await updateDoc(ref, {
        status: 'active',
        provider: input.provider,
        maskedPhone,
        expiresAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: subId,
        subscriberId: input.subscriber.uid,
        subscriberName: clamp(input.subscriber.displayName, 80) || 'Member',
        targetId: clamp(input.targetId, 128),
        targetName: clamp(input.targetName, 80) || 'Storyteller',
        planType: input.planType,
        amountGhs,
        provider: input.provider,
        maskedPhone,
        status: 'active',
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const updated = await getDoc(ref);
    return updated.data() as CreatorSubscription;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function cancelCreatorSubscription(subId: string): Promise<void> {
  const path = `creatorSubscriptions/${subId}`;
  try {
    await updateDoc(doc(db, 'creatorSubscriptions', subId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// Fetch public storytellers list (for Subscriptions directory)
export function subscribePublicProfilesList(
  onUpdate: (profiles: PublicProfile[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = 'publicProfiles';
  const q = query(collection(db, path), where('isPublic', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as PublicProfile)
        .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}
