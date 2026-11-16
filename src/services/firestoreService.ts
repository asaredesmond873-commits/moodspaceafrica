import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
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
      location: 'Lagos, Nigeria',
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

export const FEATURED_AFRICAN_FEED: FeaturedPostTemplate[] = [
  {
    category: 'event',
    mediaFormat: 'mix',
    brandLabel: 'Tidal Rave Festival · EchoHouse',
    brandCity: 'Accra, Ghana',
    title: 'Tidal Rave Festival Ghana — La Palm Beach Reel & VIP Wave Pass',
    content:
      'Watch the highlights from Ghana’s iconic beachfront music, fashion, and creator festival at La Palm Royal Beach Hotel. From sunset DJ sets to live performances, food villages, and beach games — lock in early access for the next Tidal Rave edition using the RSVP form.',
    photoUrl: '/src/assets/images/tidal_rave_ghana_1794859059932.jpg',
    videoUrl: '/assets/videos/tidal_rave_aftermovie.mp4',
    eventDate: 'Sat 20 Dec · 15:00 GMT till dawn',
    eventLocation: 'La Palm Royal Beach Hotel, Accra',
    promoCode: 'TIDALWAVE15',
    hasForm: true,
    formConfig: {
      title: 'Tidal Rave Early Wave & VIP Pass',
      description: 'Reserve early-bird beach passes or brand activation booth slots at La Palm Beach.',
      isOpen: true,
      fields: [
        { id: 'full_name', label: 'Full Name', type: 'text', required: true, options: [] },
        { id: 'whatsapp', label: 'Phone / WhatsApp', type: 'tel', required: true, options: [] },
        {
          id: 'pass_type',
          label: 'Pass Selection',
          type: 'select',
          required: true,
          options: ['Early Bird Beach Pass', 'Cabana & VIP Lounge', 'Brand Activation / Vendor Booth'],
        },
        { id: 'updates', label: 'Notify me when lineup drops', type: 'checkbox', required: false, options: [] },
      ],
    },
  },
  {
    category: 'event',
    mediaFormat: 'video',
    brandLabel: 'Africa Tech Festival',
    brandCity: 'Cape Town, South Africa',
    title: 'Africa Tech Festival — Building Africa’s Digital Future & Next Gen Talent',
    content:
      'Watch key moments from the continent’s flagship digital skills and founder showcase. Leaders across engineering, fintech, and youth education share how African builders are scaling AI, cloud, and mobile-first products globally.',
    photoUrl: '/assets/aistudio/99bc11007403730_dbb0dfe7.jpg',
    videoUrl: '/assets/videos/africa_tech_highlights.mp4',
    eventDate: 'On-Demand Recap · Next Summit Nov',
    eventLocation: 'CTICC Cape Town & Livestream',
    promoCode: '',
    hasForm: true,
    formConfig: {
      title: 'Next Gen Talent & Speaker Digest',
      description: 'Sign up for session recordings, skill scholarship alerts, and speaker slides.',
      isOpen: true,
      fields: [
        { id: 'name', label: 'Full Name', type: 'text', required: true, options: [] },
        { id: 'email', label: 'Work or Student Email', type: 'email', required: true, options: [] },
        {
          id: 'track',
          label: 'Primary Track Interest',
          type: 'select',
          required: true,
          options: ['AI & Data Engineering', 'Fintech & Payments', 'Startup Founders & VC'],
        },
      ],
    },
  },
  {
    category: 'promo',
    mediaFormat: 'mix',
    brandLabel: 'Obala Coffee & PayFlow Africa',
    brandCity: 'Lagos, Nigeria',
    title: '30% Tap-to-Pay Cashback Week — Local Roasters & SME Merchant Promo',
    content:
      'PayFlow Africa is partnering with independent coffee roasters, bakeries, and neighborhood boutiques across Lagos, Accra, and Nairobi. Tap with PayFlow at participating counters to unlock 30% instant cashback plus zero merchant settlement fees for 30 days.',
    photoUrl: '/src/assets/images/african_company_promo_1794859060543.jpg',
    videoUrl: '/assets/videos/africa_brand_promos.mp4',
    eventDate: 'Valid all month · Lagos, Accra & Nairobi',
    eventLocation: 'Participating Obala & PayFlow Merchants',
    promoCode: 'PAYFLOW30',
    hasForm: true,
    formConfig: {
      title: 'Claim Cashback or Enroll Your Shop',
      description: 'Customers can claim a digital promo voucher, and business owners can onboard in 24 hours.',
      isOpen: true,
      fields: [
        { id: 'applicant_name', label: 'Full Name or Business Name', type: 'text', required: true, options: [] },
        { id: 'contact', label: 'Email or WhatsApp', type: 'text', required: true, options: [] },
        {
          id: 'role',
          label: 'How are you joining?',
          type: 'select',
          required: true,
          options: ['Customer Voucher Claim', 'Retail / Café Merchant Onboarding'],
        },
      ],
    },
  },
  {
    category: 'promo',
    mediaFormat: 'photo',
    brandLabel: 'Adire & Kente Collective',
    brandCity: 'Accra, Ghana',
    title: '25% Launch Offer — Handwoven Indigo & Raw Linen Capsule',
    content:
      'Hand-dyed in Abeokuta and tailored in Accra for warm coastal evenings and studio days. Enjoy 25% off your first capsule order with Pan-African express courier delivery.',
    photoUrl: '/src/assets/images/showcase_fashion_promo_1794838620670.jpg',
    videoUrl: '',
    eventDate: '',
    eventLocation: 'Accra · Lagos · Pan-African Delivery',
    promoCode: 'MOOD25AFRICA',
    hasForm: true,
    formConfig: {
      title: 'Request Capsule Lookbook & Sizing',
      description: 'Pick your favourite piece and share your city for express delivery quotes.',
      isOpen: true,
      fields: [
        { id: 'buyer_name', label: 'Your Name', type: 'text', required: true, options: [] },
        { id: 'contact_email', label: 'Email Address', type: 'email', required: true, options: [] },
        {
          id: 'piece_interest',
          label: 'Collection Piece',
          type: 'select',
          required: true,
          options: ['Indigo Adire Wrap', 'Tailored Raw Linen Tunic', 'Woven Ceremonial Throw'],
        },
        { id: 'notes', label: 'Custom sizing or delivery city', type: 'textarea', required: false, options: [] },
      ],
    },
  },
  {
    category: 'event',
    mediaFormat: 'photo',
    brandLabel: 'Accra Acoustic & Makers Collective',
    brandCity: 'Accra, Ghana',
    title: 'Osu Courtyard Acoustic & Local Artisans Evening',
    content:
      'An intimate open-air showcase bringing together acoustic vocalists, kora players, small-batch skincare founders, and street-food chefs under warm courtyard lights.',
    photoUrl: '/src/assets/images/showcase_music_festival_1794838619312.jpg',
    videoUrl: '',
    eventDate: 'Friday, 28 Nov · 18:30 GMT',
    eventLocation: 'Osu Cultural Courtyard, Accra',
    promoCode: '',
    hasForm: true,
    formConfig: {
      title: 'Courtyard Evening RSVP',
      description: 'Hold your seat or inquire about setting up a maker table.',
      isOpen: true,
      fields: [
        { id: 'full_name', label: 'Full Name', type: 'text', required: true, options: [] },
        { id: 'whatsapp', label: 'Phone / WhatsApp', type: 'tel', required: true, options: [] },
        {
          id: 'pass_type',
          label: 'Attendance Tier',
          type: 'select',
          required: true,
          options: ['General Courtyard Pass', 'Front Row Acoustic Seat', 'Maker Booth Inquiry'],
        },
      ],
    },
  },
  {
    category: 'announcement',
    mediaFormat: 'mix',
    brandLabel: 'Kilimani & Kigali Builders Network',
    brandCity: 'Nairobi, Kenya',
    title: 'East Africa SME Zero-Fee Logistics & Founders Fellowship Open',
    content:
      'Independent e-commerce brands, agri-tech teams, and creative studios across Kenya and Rwanda can now apply for zero-fee last-mile shipping credits plus weekly mentorship in Kilimani and Kigali.',
    photoUrl: '/src/assets/images/showcase_tech_summit_1794838620227.jpg',
    videoUrl: '',
    eventDate: 'Applications close 15 Dec',
    eventLocation: 'Nairobi · Kigali · Hybrid',
    promoCode: 'KILIMANI2026',
    hasForm: true,
    formConfig: {
      title: 'SME Logistics & Fellowship Form',
      description: 'Quick 3-question application for East African founders and merchants.',
      isOpen: true,
      fields: [
        { id: 'founder_name', label: 'Founder or Company Name', type: 'text', required: true, options: [] },
        { id: 'city', label: 'City & Country', type: 'text', required: true, options: [] },
        { id: 'project_summary', label: 'Describe your product or service', type: 'textarea', required: true, options: [] },
      ],
    },
  },
];

export async function publishStarterShowcasePosts(author: PublicProfile): Promise<void> {
  for (const item of FEATURED_AFRICAN_FEED) {
    await createPost({
      author,
      category: item.category,
      mediaFormat: item.mediaFormat,
      visibility: 'public',
      title: item.title,
      content: item.content,
      photoUrl: item.photoUrl,
      videoUrl: item.videoUrl,
      eventDate: item.eventDate,
      eventLocation: item.eventLocation,
      promoCode: item.promoCode,
      hasForm: item.hasForm,
      formConfig: item.formConfig,
    });
  }
}

export async function seedShowcaseIfFeedEmpty(author: PublicProfile): Promise<boolean> {
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'posts'), where('visibility', '==', 'public'), limit(1))
    );
    if (!existingSnap.empty) {
      return false;
    }
    await publishStarterShowcasePosts(author);
    return true;
  } catch {
    return false;
  }
}
