import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
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
  type FormConfig,
  type FormSubmission,
  type MediaFormat,
  type Post,
  type PostCategory,
  type PostComment,
  type PostVisibility,
  type PublicProfile,
  SCHEMA_LIMITS,
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

export async function ensureUserProfile(user: User): Promise<PublicProfile> {
  const publicPath = `publicProfiles/${user.uid}`;
  const privatePath = `userPrivate/${user.uid}`;

  try {
    const publicRef = doc(db, 'publicProfiles', user.uid);
    const publicSnap = await getDoc(publicRef);

    const privateRef = doc(db, 'userPrivate', user.uid);
    const privateSnap = await getDoc(privateRef);

    if (!privateSnap.exists()) {
      await setDoc(privateRef, {
        uid: user.uid,
        email: clampString(user.email || '', 200),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (publicSnap.exists()) {
      return publicSnap.data() as PublicProfile;
    }

    const initialProfile = {
      uid: user.uid,
      displayName: clampString(user.displayName || 'MoodSpace Member', SCHEMA_LIMITS.DISPLAY_NAME_MAX),
      bio: '',
      location: 'Accra, Ghana',
      accountType: 'creator' as AccountType,
      avatarUrl: clampString(user.photoURL || '', SCHEMA_LIMITS.AVATAR_URL_MAX),
      isPublic: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(publicRef, initialProfile);
    const createdSnap = await getDoc(publicRef);
    return (createdSnap.exists() ? createdSnap.data() : initialProfile) as PublicProfile;
  } catch (error) {
    return handleFirestoreError(error, OperationType.WRITE, `${publicPath} | ${privatePath}`);
  }
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
        likesCount: Math.max(0, post.likesCount - 1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(likeRef, {
        userId: uid,
        postId: post.id,
        createdAt: serverTimestamp(),
      });
      batch.update(postRef, {
        likesCount: post.likesCount + 1,
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
      sharesCount: post.sharesCount + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribePostComments(
  postId: string,
  onData: (comments: PostComment[]) => void,
  onError?: (err: Error) => void
) {
  const path = `posts/${postId}/comments`;
  const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as PostComment));
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
      commentsCount: post.commentsCount + 1,
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
      commentsCount: Math.max(0, post.commentsCount - 1),
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
      submissionsCount: post.submissionsCount + 1,
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

export interface FeaturedPostTemplate {
  category: PostCategory;
  mediaFormat: MediaFormat;
  title: string;
  content: string;
  photoUrl: string;
  videoUrl: string;
  eventDate: string;
  eventLocation: string;
  promoCode: string;
  brandLabel: string;
  brandCity: string;
  hasForm: boolean;
  formConfig: FormConfig;
}

export const TIDAL_RAVE_POSTER_PATH = '/assets/aistudio/99bc11007403730_f92625d8.jpg';
export const TIDAL_RAVE_GENUINE_TITLE = 'Tidal Rave Ghana 2026 — Rave Takeover by Davido';
const TIDAL_RAVE_GENUINE_CONTENT =
  "Africa's Biggest Beach Festival returns to La Palm Royal Beach Hotel for the Rave Takeover by Davido! #NoRaverLeftBehind\n\nGet your tickets now: dial *714*20# or visit www.tidalravefestival.com for more info.\n\nPowered by São.";

const OLD_AUTO_SEEDED_TITLES = new Set([
  'Tidal Rave Festival Ghana — La Palm Beach Reel & VIP Wave Pass',
  'Africa Tech Festival — Building Africa’s Digital Future & Next Gen Talent',
  '30% Tap-to-Pay Cashback Week — Local Roasters & SME Merchant Promo',
  '25% Launch Offer — Handwoven Indigo & Raw Linen Capsule',
  'Osu Courtyard Acoustic & Local Artisans Evening',
  'East Africa SME Zero-Fee Logistics & Founders Fellowship Open',
]);

function isAccidentalAutoSeededPost(post: Post): boolean {
  if (OLD_AUTO_SEEDED_TITLES.has(post.title)) return true;
  if (
    post.title === TIDAL_RAVE_GENUINE_TITLE &&
    post.content === TIDAL_RAVE_GENUINE_CONTENT
  ) {
    return true;
  }
  return false;
}

export const FEATURED_AFRICAN_FEED: FeaturedPostTemplate[] = [
  {
    category: 'event',
    mediaFormat: 'photo',
    brandLabel: 'Tidal Rave Ghana · EchoHouse',
    brandCity: 'Accra, Ghana',
    title: TIDAL_RAVE_GENUINE_TITLE,
    content: TIDAL_RAVE_GENUINE_CONTENT,
    photoUrl: TIDAL_RAVE_POSTER_PATH,
    videoUrl: '',
    eventDate: 'Sat, 14 Nov 2026 · 12:00 PM',
    eventLocation: 'La Palm Royal Beach Hotel, Accra',
    promoCode: '',
    hasForm: false,
    formConfig: {
      title: '',
      description: '',
      isOpen: false,
      fields: [],
    },
  },
];

export async function cleanupAccidentalAutoSeededPosts(uid: string): Promise<number> {
  const storageKey = `moodspace_cleanup_autoseed_v3_${uid}`;
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

