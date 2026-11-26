import type { User } from 'firebase/auth';
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
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  type AccountType,
  type FollowRecord,
  type FormConfig,
  type FormSubmission,
  type MediaFormat,
  type Post,
  type PostCategory,
  type PostComment,
  type PostVisibility,
  type ProfileViewRecord,
  type PublicProfile,
  SCHEMA_LIMITS,
  type VerificationCategory,
  type VerificationIdType,
  type VerificationRequest,
  type VerifiedBadgeInfo,
} from '../types';
import { generateSafeId } from '../utils/media';

function clampString(val: string, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

function sanitizeFormConfig(config: FormConfig): FormConfig {
  return {
    title: clampString(config.title, SCHEMA_LIMITS.FORM_TITLE_MAX),
    description: clampString(config.description, SCHEMA_LIMITS.FORM_DESC_MAX),
    isOpen: Boolean(config.isOpen),
    fields: (config.fields || []).slice(0, SCHEMA_LIMITS.FORM_FIELDS_MAX).map((field) => ({
      id: (field.id || generateSafeId('fld')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
      label: clampString(field.label, SCHEMA_LIMITS.FORM_FIELD_LABEL_MAX) || 'Untitled Field',
      type: field.type,
      required: Boolean(field.required),
      options: (field.options || [])
        .map((opt) => opt.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 20),
    })),
  };
}

const inFlightProfiles = new Map<string, Promise<PublicProfile>>();

export function ensureUserProfile(user: User): Promise<PublicProfile> {
  const existing = inFlightProfiles.get(user.uid);
  if (existing) {
    return existing;
  }

  const task = (async (): Promise<PublicProfile> => {
    const publicPath = `publicProfiles/${user.uid}`;
    const privatePath = `userPrivate/${user.uid}`;

    try {
      const publicRef = doc(db, 'publicProfiles', user.uid);
      const privateRef = doc(db, 'userPrivate', user.uid);

      const [publicSnap, privateSnap] = await Promise.all([
        getDoc(publicRef),
        getDoc(privateRef),
      ]);

      const needsPrivate = !privateSnap.exists();
      const needsPublic = !publicSnap.exists();

      if (!needsPrivate && !needsPublic) {
        return publicSnap.data() as PublicProfile;
      }

      const fallbackName =
        user.displayName || user.email?.split('@')[0] || 'MoodSpace Member';
      const initialProfile: PublicProfile = {
        uid: user.uid,
        displayName: clampString(fallbackName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'MoodSpace Member',
        bio: '',
        location: 'Africa',
        accountType: 'creator',
        avatarUrl: clampString(user.photoURL || '', SCHEMA_LIMITS.AVATAR_URL_MAX),
        isPublic: true,
        badgeVerified: false,
        verifiedLabel: '',
        createdAt: null,
        updatedAt: null,
      };

      const batch = writeBatch(db);
      if (needsPrivate) {
        batch.set(privateRef, {
          uid: user.uid,
          email: clampString(user.email || '', 200),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (needsPublic) {
        batch.set(publicRef, {
          uid: initialProfile.uid,
          displayName: initialProfile.displayName,
          bio: initialProfile.bio,
          location: initialProfile.location,
          accountType: initialProfile.accountType,
          avatarUrl: initialProfile.avatarUrl,
          isPublic: true,
          badgeVerified: false,
          verifiedLabel: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      if (publicSnap.exists()) {
        return publicSnap.data() as PublicProfile;
      }
      return initialProfile;
    } catch (error) {
      return handleFirestoreError(error, OperationType.WRITE, `${publicPath} | ${privatePath}`);
    }
  })();

  inFlightProfiles.set(user.uid, task);
  void task.finally(() => {
    if (inFlightProfiles.get(user.uid) === task) {
      inFlightProfiles.delete(user.uid);
    }
  });

  return task;
}

export async function updateUserProfile(
  uid: string,
  updates: {
    displayName: string;
    bio: string;
    location: string;
    accountType: AccountType;
    avatarUrl: string;
  }
): Promise<void> {
  const path = `publicProfiles/${uid}`;
  try {
    await updateDoc(doc(db, 'publicProfiles', uid), {
      displayName: clampString(updates.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Creator',
      bio: clampString(updates.bio, SCHEMA_LIMITS.BIO_MAX),
      location: clampString(updates.location, SCHEMA_LIMITS.LOCATION_MAX),
      accountType: updates.accountType,
      avatarUrl: clampString(updates.avatarUrl, SCHEMA_LIMITS.AVATAR_URL_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeVerifiedProfiles(
  onData: (badgesByUid: Record<string, VerifiedBadgeInfo>) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'publicProfiles'), where('isPublic', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, VerifiedBadgeInfo> = {};
      snapshot.docs.forEach((d) => {
        const profile = d.data() as PublicProfile;
        if (profile.badgeVerified) {
          map[profile.uid] = {
            uid: profile.uid,
            verifiedLabel: profile.verifiedLabel || 'Verified',
          };
        }
      });
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'publicProfiles');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribePublicProfile(
  uid: string,
  onData: (profile: PublicProfile | null) => void,
  onError?: (err: Error) => void
) {
  const path = `publicProfiles/${uid}`;
  return onSnapshot(
    doc(db, 'publicProfiles', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as PublicProfile) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMyFollowingIds(
  uid: string,
  onData: (followingIds: Set<string>) => void,
  onError?: (err: Error) => void
) {
  const path = `publicProfiles/${uid}/following`;
  const q = query(collection(db, 'publicProfiles', uid, 'following'), where('followerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const next = new Set<string>();
      snap.docs.forEach((d) => next.add(d.id));
      onData(next);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeProfileFollowers(
  uid: string,
  onData: (followers: FollowRecord[]) => void,
  onError?: (err: Error) => void
) {
  const path = `publicProfiles/${uid}/followers`;
  const q = query(collection(db, 'publicProfiles', uid, 'followers'), where('followingId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => d.data() as FollowRecord)
        .sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeProfileFollowing(
  uid: string,
  onData: (following: FollowRecord[]) => void,
  onError?: (err: Error) => void
) {
  const path = `publicProfiles/${uid}/following`;
  const q = query(collection(db, 'publicProfiles', uid, 'following'), where('followerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => d.data() as FollowRecord)
        .sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()));
      onData(rows);
    },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch (wrapped) {
          if (onError && wrapped instanceof Error) {
            onError(wrapped);
          }
        }
      }
    );
}

export async function recordProfileView(
  targetUid: string,
  viewer: PublicProfile
): Promise<void> {
  if (!targetUid || !viewer.uid || targetUid === viewer.uid) return;
  try {
    await setDoc(doc(db, 'publicProfiles', targetUid, 'profileViews', viewer.uid), {
      profileUid: targetUid,
      viewerId: viewer.uid,
      viewerName: clampString(viewer.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Member',
      viewerAvatar: clampString(viewer.avatarUrl, SCHEMA_LIMITS.AVATAR_URL_MAX),
      viewerLocation: clampString(viewer.location || 'Africa', SCHEMA_LIMITS.LOCATION_MAX),
      viewedAt: serverTimestamp(),
    });
  } catch {
    // Silent background view record
  }
}

export function subscribeMyProfileViewers(
  uid: string,
  onData: (views: ProfileViewRecord[]) => void,
  onError?: (err: Error) => void
) {
  const path = `publicProfiles/${uid}/profileViews`;
  const q = query(collection(db, 'publicProfiles', uid, 'profileViews'), where('profileUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => d.data() as ProfileViewRecord)
        .sort((a, b) => (b.viewedAt?.toMillis() ?? Date.now()) - (a.viewedAt?.toMillis() ?? Date.now()));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export interface FollowTargetSummary {
  uid: string;
  displayName: string;
  avatarUrl: string;
  location: string;
}

export async function toggleFollowUser(
  myProfile: PublicProfile,
  target: FollowTargetSummary,
  currentlyFollowing: boolean
): Promise<void> {
  if (!myProfile.uid || !target.uid || myProfile.uid === target.uid) {
    return;
  }

  const path = `publicProfiles/${target.uid}/followers/${myProfile.uid}`;
  try {
    const batch = writeBatch(db);
    const followerRef = doc(db, 'publicProfiles', target.uid, 'followers', myProfile.uid);
    const followingRef = doc(db, 'publicProfiles', myProfile.uid, 'following', target.uid);

    if (currentlyFollowing) {
      batch.delete(followerRef);
      batch.delete(followingRef);
    } else {
      batch.set(followerRef, {
        followerId: myProfile.uid,
        followingId: target.uid,
        displayName: clampString(myProfile.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Member',
        avatarUrl: clampString(myProfile.avatarUrl, SCHEMA_LIMITS.AVATAR_URL_MAX),
        location: clampString(myProfile.location, SCHEMA_LIMITS.LOCATION_MAX),
        createdAt: serverTimestamp(),
      });
      batch.set(followingRef, {
        followerId: myProfile.uid,
        followingId: target.uid,
        displayName: clampString(target.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Member',
        avatarUrl: clampString(target.avatarUrl, SCHEMA_LIMITS.AVATAR_URL_MAX),
        location: clampString(target.location, SCHEMA_LIMITS.LOCATION_MAX),
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePublicPosts(
  onData: (posts: Post[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'posts'), where('visibility', '==', 'public'));

  return onSnapshot(
    q,
    (snapshot) => {
      const posts = snapshot.docs
        .map((d) => d.data() as Post)
        .filter((post) => !isAccidentalAutoSeededPost(post))
        .sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()));
      onData(posts);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeUserPosts(
  uid: string,
  onData: (posts: Post[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, 'posts'), where('authorId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const posts = snapshot.docs
        .map((d) => d.data() as Post)
        .sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()));
      onData(posts);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'posts');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export interface CreatePostInput {
  author: PublicProfile;
  category: PostCategory;
  mediaFormat: MediaFormat;
  visibility: PostVisibility;
  title: string;
  content: string;
  photoUrl: string;
  videoUrl: string;
  eventDate: string;
  eventLocation: string;
  promoCode: string;
  hasForm: boolean;
  formConfig: FormConfig;
}

export async function createPost(input: CreatePostInput): Promise<string> {
  const postId = generateSafeId('post');
  const path = `posts/${postId}`;

  try {
    const cleanForm = sanitizeFormConfig(input.formConfig);
    await setDoc(doc(db, 'posts', postId), {
      id: postId,
      authorId: input.author.uid,
      authorName: clampString(input.author.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Creator',
      authorAvatar: clampString(input.author.avatarUrl, SCHEMA_LIMITS.AVATAR_URL_MAX),
      authorLocation: clampString(input.author.location, SCHEMA_LIMITS.LOCATION_MAX),
      category: input.category,
      mediaFormat: input.mediaFormat,
      visibility: input.visibility,
      title: clampString(input.title, SCHEMA_LIMITS.TITLE_MAX),
      content: clampString(input.content, SCHEMA_LIMITS.CONTENT_MAX),
      photoUrl: clampString(input.photoUrl, SCHEMA_LIMITS.PHOTO_URL_MAX),
      videoUrl: clampString(input.videoUrl, SCHEMA_LIMITS.VIDEO_URL_MAX),
      eventDate: clampString(input.eventDate, SCHEMA_LIMITS.EVENT_DATE_MAX),
      eventLocation: clampString(input.eventLocation, SCHEMA_LIMITS.EVENT_LOCATION_MAX),
      promoCode: clampString(input.promoCode, SCHEMA_LIMITS.PROMO_CODE_MAX),
      hasForm: Boolean(input.hasForm),
      formConfig: cleanForm,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      submissionsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return postId;
  } catch (error) {
    return handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePost(
  postId: string,
  updates: {
    authorName: string;
    authorAvatar: string;
    authorLocation: string;
    category: PostCategory;
    mediaFormat: MediaFormat;
    visibility: PostVisibility;
    title: string;
    content: string;
    photoUrl: string;
    videoUrl: string;
    eventDate: string;
    eventLocation: string;
    promoCode: string;
    hasForm: boolean;
    formConfig: FormConfig;
  }
): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), {
      authorName: clampString(updates.authorName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Creator',
      authorAvatar: clampString(updates.authorAvatar, SCHEMA_LIMITS.AVATAR_URL_MAX),
      authorLocation: clampString(updates.authorLocation, SCHEMA_LIMITS.LOCATION_MAX),
      category: updates.category,
      mediaFormat: updates.mediaFormat,
      visibility: updates.visibility,
      title: clampString(updates.title, SCHEMA_LIMITS.TITLE_MAX),
      content: clampString(updates.content, SCHEMA_LIMITS.CONTENT_MAX),
      photoUrl: clampString(updates.photoUrl, SCHEMA_LIMITS.PHOTO_URL_MAX),
      videoUrl: clampString(updates.videoUrl, SCHEMA_LIMITS.VIDEO_URL_MAX),
      eventDate: clampString(updates.eventDate, SCHEMA_LIMITS.EVENT_DATE_MAX),
      eventLocation: clampString(updates.eventLocation, SCHEMA_LIMITS.EVENT_LOCATION_MAX),
      promoCode: clampString(updates.promoCode, SCHEMA_LIMITS.PROMO_CODE_MAX),
      hasForm: Boolean(updates.hasForm),
      formConfig: sanitizeFormConfig(updates.formConfig),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function togglePostFormOpen(post: Post): Promise<void> {
  const path = `posts/${post.id}`;
  try {
    await updateDoc(doc(db, 'posts', post.id), {
      formConfig: {
        ...post.formConfig,
        isOpen: !post.formConfig.isOpen,
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function togglePostVisibility(post: Post): Promise<void> {
  const path = `posts/${post.id}`;
  try {
    await updateDoc(doc(db, 'posts', post.id), {
      visibility: post.visibility === 'public' ? 'archived' : 'public',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePost(postId: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await deleteDoc(doc(db, 'posts', postId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function checkUserLikedPost(postId: string, uid: string): Promise<boolean> {
  const path = `posts/${postId}/likes/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'posts', postId, 'likes', uid));
    return snap.exists();
  } catch (error) {
    return handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function togglePostLike(post: Post, uid: string, currentlyLiked: boolean): Promise<void> {
  const path = `posts/${post.id}/likes/${uid}`;
  try {
    const batch = writeBatch(db);
    const postRef = doc(db, 'posts', post.id);
    const likeRef = doc(db, 'posts', post.id, 'likes', uid);

    if (currentlyLiked) {
      batch.delete(likeRef);
      batch.update(postRef, {
        likesCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(likeRef, {
        userId: uid,
        postId: post.id,
        createdAt: serverTimestamp(),
      });
      batch.update(postRef, {
        likesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function incrementPostShare(post: Post): Promise<void> {
  const path = `posts/${post.id}`;
  try {
    await updateDoc(doc(db, 'posts', post.id), {
      sharesCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeSavedPostIds(
  uid: string,
  onData: (savedIds: Set<string>) => void,
  onError?: (err: Error) => void
) {
  const path = `userPrivate/${uid}/savedPosts`;
  const q = query(collection(db, 'userPrivate', uid, 'savedPosts'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const next = new Set<string>();
      snap.docs.forEach((d) => next.add(d.id));
      onData(next);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function toggleSavedPost(
  postId: string,
  uid: string,
  currentlySaved: boolean
): Promise<void> {
  const path = `userPrivate/${uid}/savedPosts/${postId}`;
  try {
    const ref = doc(db, 'userPrivate', uid, 'savedPosts', postId);
    if (currentlySaved) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        userId: uid,
        postId,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePostComments(
  postId: string,
  onData: (comments: PostComment[]) => void,
  onError?: (err: Error) => void
) {
  const path = `posts/${postId}/comments`;
  const q = query(collection(db, 'posts', postId, 'comments'), where('postId', '==', postId));
  return onSnapshot(
    q,
    (snap) => {
      const sorted = snap.docs
        .map((d) => d.data() as PostComment)
        .sort((a, b) => (a.createdAt?.toMillis() ?? Date.now()) - (b.createdAt?.toMillis() ?? Date.now()));
      onData(sorted);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function addPostComment(
  post: Post,
  author: PublicProfile,
  text: string
): Promise<void> {
  const commentId = generateSafeId('cmt');
  const path = `posts/${post.id}/comments/${commentId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'posts', post.id, 'comments', commentId), {
      id: commentId,
      postId: post.id,
      authorId: author.uid,
      authorName: clampString(author.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Member',
      authorAvatar: clampString(author.avatarUrl, SCHEMA_LIMITS.AVATAR_URL_MAX),
      text: clampString(text, SCHEMA_LIMITS.COMMENT_MAX),
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'posts', post.id), {
      commentsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deletePostComment(post: Post, commentId: string): Promise<void> {
  const path = `posts/${post.id}/comments/${commentId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'posts', post.id, 'comments', commentId));
    batch.update(doc(db, 'posts', post.id), {
      commentsCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function submitPostForm(
  post: Post,
  submitter: PublicProfile,
  answers: Record<string, string | boolean>
): Promise<void> {
  const submissionId = generateSafeId('sub');
  const path = `posts/${post.id}/submissions/${submissionId}`;

  const cleanAnswers: Record<string, string | boolean> = {};
  Object.entries(answers)
    .slice(0, SCHEMA_LIMITS.FORM_FIELDS_MAX)
    .forEach(([key, val]) => {
      if (typeof val === 'boolean') {
        cleanAnswers[key] = val;
      } else {
        cleanAnswers[key] = String(val ?? '').trim().slice(0, 1000);
      }
    });

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'posts', post.id, 'submissions', submissionId), {
      id: submissionId,
      postId: post.id,
      postAuthorId: post.authorId,
      submitterId: submitter.uid,
      submitterName: clampString(submitter.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Guest',
      answers: cleanAnswers,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'posts', post.id), {
      submissionsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchPostSubmissions(
  postId: string,
  authorUid: string
): Promise<FormSubmission[]> {
  const path = `posts/${postId}/submissions`;
  try {
    const q = query(
      collection(db, 'posts', postId, 'submissions'),
      where('postAuthorId', '==', authorUid)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as FormSubmission);
    return list.sort((a, b) => {
      const ta = a.createdAt?.toMillis() ?? 0;
      const tb = b.createdAt?.toMillis() ?? 0;
      return tb - ta;
    });
  } catch (error) {
    return handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteFormSubmission(postId: string, submissionId: string): Promise<void> {
  const path = `posts/${postId}/submissions/${submissionId}`;
  try {
    await deleteDoc(doc(db, 'posts', postId, 'submissions', submissionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Identity Verification Requests & Admin Approval ---

export function subscribeMyVerificationRequest(
  uid: string,
  onData: (req: VerificationRequest | null) => void,
  onError?: (err: Error) => void
) {
  const path = `verificationRequests/${uid}`;
  return onSnapshot(
    doc(db, 'verificationRequests', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as VerificationRequest) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export interface SubmitVerificationInput {
  legalOrBrandName: string;
  category: VerificationCategory;
  idType: VerificationIdType;
  idReference: string;
  proofLink: string;
  proofImageUrl: string;
  note: string;
  proposedLabel: string;
}

export async function submitVerificationRequest(
  profile: PublicProfile,
  input: SubmitVerificationInput
): Promise<void> {
  const path = `verificationRequests/${profile.uid}`;
  try {
    const ref = doc(db, 'verificationRequests', profile.uid);
    const existingSnap = await getDoc(ref);

    const sharedFields = {
      requesterName: clampString(profile.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) || 'Member',
      requesterLocation: clampString(profile.location, SCHEMA_LIMITS.LOCATION_MAX),
      accountType: profile.accountType,
      legalOrBrandName: clampString(input.legalOrBrandName, SCHEMA_LIMITS.VERIFICATION_LEGAL_NAME_MAX),
      category: input.category,
      idType: input.idType,
      idReference: clampString(input.idReference, SCHEMA_LIMITS.VERIFICATION_REF_MAX),
      proofLink: clampString(input.proofLink, SCHEMA_LIMITS.VERIFICATION_LINK_MAX),
      proofImageUrl: clampString(input.proofImageUrl, SCHEMA_LIMITS.VERIFICATION_PROOF_IMAGE_MAX),
      note: clampString(input.note, SCHEMA_LIMITS.VERIFICATION_NOTE_MAX),
      proposedLabel: clampString(input.proposedLabel, SCHEMA_LIMITS.VERIFICATION_LABEL_MAX),
      status: 'pending' as const,
      reviewNote: '',
      reviewedBy: '',
      updatedAt: serverTimestamp(),
    };

    if (existingSnap.exists()) {
      await updateDoc(ref, sharedFields);
    } else {
      await setDoc(ref, {
        uid: profile.uid,
        ...sharedFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeAllVerificationRequests(
  onData: (requests: VerificationRequest[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'verificationRequests';
  return onSnapshot(
    collection(db, 'verificationRequests'),
    (snap) => {
      const rank = { pending: 0, rejected: 1, approved: 2 } as const;
      const list = snap.docs
        .map((d) => d.data() as VerificationRequest)
        .sort((a, b) => {
          const rDiff = rank[a.status] - rank[b.status];
          if (rDiff !== 0) return rDiff;
          return (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0);
        });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function reviewVerificationRequest(
  targetUid: string,
  adminEmail: string,
  decision: 'approved' | 'rejected',
  verifiedLabel: string,
  reviewNote: string
): Promise<void> {
  const path = `verificationRequests/${targetUid} | publicProfiles/${targetUid}`;
  try {
    const cleanLabel = clampString(verifiedLabel, SCHEMA_LIMITS.VERIFICATION_LABEL_MAX) || 'Verified';
    const cleanNote = clampString(reviewNote, SCHEMA_LIMITS.VERIFICATION_REVIEW_NOTE_MAX);

    const batch = writeBatch(db);
    batch.update(doc(db, 'verificationRequests', targetUid), {
      status: decision,
      proposedLabel: cleanLabel,
      reviewNote: cleanNote,
      reviewedBy: clampString(adminEmail, 200),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'publicProfiles', targetUid), {
      badgeVerified: decision === 'approved',
      verifiedLabel: decision === 'approved' ? cleanLabel : '',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Cleanup helper for any leftover posts from earlier auto-seeding builds
const OLD_AUTO_SEEDED_TITLES = new Set([
  'Tidal Rave Festival Ghana — La Palm Beach Reel & VIP Wave Pass',
  'Africa Tech Festival — Building Africa’s Digital Future & Next Gen Talent',
  '30% Tap-to-Pay Cashback Week — Local Roasters & SME Merchant Promo',
  '25% Launch Offer — Handwoven Indigo & Raw Linen Capsule',
  'Osu Courtyard Acoustic & Local Artisans Evening',
  'East Africa SME Zero-Fee Logistics & Founders Fellowship Open',
]);

const LEGACY_TIDAL_TITLE = 'Tidal Rave Ghana 2026 — Rave Takeover by Davido';
const LEGACY_TIDAL_CONTENT =
  "Africa's Biggest Beach Festival returns to La Palm Royal Beach Hotel for the Rave Takeover by Davido! #NoRaverLeftBehind\n\nGet your tickets now: dial *714*20# or visit www.tidalravefestival.com for more info.\n\nPowered by São.";

function isAccidentalAutoSeededPost(post: Post): boolean {
  if (OLD_AUTO_SEEDED_TITLES.has(post.title)) return true;
  if (post.title === LEGACY_TIDAL_TITLE && post.content === LEGACY_TIDAL_CONTENT) {
    return true;
  }
  return false;
}

export async function cleanupAccidentalAutoSeededPosts(uid: string): Promise<number> {
  const storageKey = `moodspace_cleanup_autoseed_v4_${uid}`;
  if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey)) {
    return 0;
  }

  try {
    const mySnap = await getDocs(
      query(collection(db, 'posts'), where('authorId', '==', uid))
    );

    let deleted = 0;
    for (const snapDoc of mySnap.docs) {
      const post = snapDoc.data() as Post;
      if (isAccidentalAutoSeededPost(post)) {
        await deleteDoc(doc(db, 'posts', snapDoc.id));
        deleted += 1;
      }
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, '1');
    }
    return deleted;
  } catch (error) {
    return handleFirestoreError(error, OperationType.WRITE, 'posts');
  }
}
