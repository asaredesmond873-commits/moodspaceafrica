import type { Timestamp } from 'firebase/firestore';

export type AccountType = 'creator' | 'business' | 'community';
export type PostCategory = 'announcement' | 'event' | 'promo';
export type MediaFormat = 'text' | 'photo' | 'video' | 'mix';
export type PostVisibility = 'public' | 'archived';
export type FormFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type VerificationCategory = 'creator' | 'business' | 'organizer' | 'media';
export type VerificationIdType =
  | 'ghana_card'
  | 'business_reg'
  | 'social_handle'
  | 'website_press';

export const ADMIN_EMAIL = 'asaredesmond873@gmail.com';

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
}

export interface FormConfig {
  title: string;
  description: string;
  isOpen: boolean;
  fields: FormField[];
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  bio: string;
  location: string;
  accountType: AccountType;
  avatarUrl: string;
  isPublic: boolean;
  badgeVerified?: boolean;
  verifiedLabel?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface VerifiedBadgeInfo {
  uid: string;
  verifiedLabel: string;
}

export interface FollowRecord {
  followerId: string;
  followingId: string;
  displayName: string;
  avatarUrl: string;
  location: string;
  createdAt: Timestamp | null;
}

export interface VerificationRequest {
  uid: string;
  requesterName: string;
  requesterLocation: string;
  accountType: AccountType;
  legalOrBrandName: string;
  category: VerificationCategory;
  idType: VerificationIdType;
  idReference: string;
  proofLink: string;
  proofImageUrl: string;
  note: string;
  proposedLabel: string;
  status: VerificationStatus;
  reviewNote: string;
  reviewedBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Post {
  id: string;
  authorId: string;
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
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  submissionsCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  createdAt: Timestamp | null;
}

export interface FormSubmission {
  id: string;
  postId: string;
  postAuthorId: string;
  submitterId: string;
  submitterName: string;
  answers: Record<string, string | boolean>;
  createdAt: Timestamp | null;
}

export const SCHEMA_LIMITS = {
  DISPLAY_NAME_MAX: 80,
  BIO_MAX: 500,
  LOCATION_MAX: 100,
  TITLE_MAX: 140,
  CONTENT_MAX: 4000,
  PHOTO_URL_MAX: 450000,
  VIDEO_URL_MAX: 2000,
  AVATAR_URL_MAX: 150000,
  EVENT_DATE_MAX: 60,
  EVENT_LOCATION_MAX: 120,
  PROMO_CODE_MAX: 40,
  FORM_TITLE_MAX: 120,
  FORM_DESC_MAX: 500,
  FORM_FIELDS_MAX: 15,
  FORM_FIELD_LABEL_MAX: 100,
  COMMENT_MAX: 1000,
  VERIFICATION_LEGAL_NAME_MAX: 120,
  VERIFICATION_REF_MAX: 140,
  VERIFICATION_LINK_MAX: 500,
  VERIFICATION_PROOF_IMAGE_MAX: 450000,
  VERIFICATION_NOTE_MAX: 1000,
  VERIFICATION_LABEL_MAX: 60,
  VERIFICATION_REVIEW_NOTE_MAX: 500,
} as const;

export const AFRICAN_CITIES = [
  'Lagos, Nigeria',
  'Abuja, Nigeria',
  'Nairobi, Kenya',
  'Mombasa, Kenya',
  'Accra, Ghana',
  'Kumasi, Ghana',
  'Johannesburg, South Africa',
  'Cape Town, South Africa',
  'Kigali, Rwanda',
  'Addis Ababa, Ethiopia',
  'Cairo, Egypt',
  'Dakar, Senegal',
  'Kampala, Uganda',
  'Dar es Salaam, Tanzania',
  'Abidjan, Côte d’Ivoire',
  'Casablanca, Morocco',
  'Lusaka, Zambia',
  'Harare, Zimbabwe',
  'Douala, Cameroon',
  'Kinshasa, DR Congo',
  'Gaborone, Botswana',
  'Windhoek, Namibia',
  'Tunis, Tunisia',
  'Maputo, Mozambique',
] as const;

export type AfricanRegion =
  | 'All Africa'
  | 'West Africa'
  | 'East Africa'
  | 'Southern Africa'
  | 'North Africa'
  | 'Central Africa';

export const AFRICAN_REGIONS: AfricanRegion[] = [
  'All Africa',
  'West Africa',
  'East Africa',
  'Southern Africa',
  'North Africa',
  'Central Africa',
];

export type GiftType = 'rose' | 'fire' | 'lion';
export type MoMoProvider =
  | 'MTN MoMo'
  | 'M-Pesa'
  | 'Airtel Money'
  | 'Telecel Cash'
  | 'AirtelTigo Money';

export type SubscriptionPlanType = 'creator_fan' | 'creator_pro';

export interface CreatorSubscription {
  id: string;
  subscriberId: string;
  subscriberName: string;
  targetId: string;
  targetName: string;
  planType: SubscriptionPlanType;
  amountGhs: number;
  provider: MoMoProvider;
  maskedPhone: string;
  status: 'active' | 'cancelled';
  expiresAt: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export const SUBSCRIPTION_PLANS = {
  CREATOR_FAN_GHS: 15,
  CREATOR_PRO_GHS: 35,
  DURATION_DAYS: 30,
  DURATION_MS: 30 * 24 * 60 * 60 * 1000,
  PRO_TARGET_ID: 'moodspace_pro',
  PRO_TARGET_NAME: 'MoodSpace Creator Pro',
} as const;

export interface ChallengeVideo {
  id: string;
  roundId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorLocation: string;
  title: string;
  caption: string;
  thumbnailUrl: string;
  mimeType: string;
  durationSeconds: number;
  fileSizeBytes: number;
  chunkCount: number;
  videoReady: boolean;
  isActive: boolean;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  votesCount: number;
  giftsCount: number;
  giftsTotalGhs: number;
  boostedUntil: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChallengeVideoComment {
  id: string;
  videoId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  createdAt: Timestamp | null;
}

export interface ChallengeVideoGift {
  id: string;
  videoId: string;
  senderId: string;
  senderName: string;
  giftType: GiftType;
  amountGhs: number;
  createdAt: Timestamp | null;
}

export interface ChallengeVideoBoost {
  id: string;
  videoId: string;
  payerId: string;
  provider: MoMoProvider;
  maskedPhone: string;
  amountGhs: number;
  boostedUntil: number;
  createdAt: Timestamp | null;
}

export interface ChallengeDailyVote {
  userId: string;
  dateKey: string;
  videoId: string;
  createdAt: Timestamp | null;
}

export interface ChallengeConfig {
  isPublic: boolean;
  sponsorName: string;
  prizeGhs: number;
  winnerVideoId: string;
  winnerName: string;
  winnerLocation: string;
  winnerTitle: string;
  winnerThumbnailUrl: string;
  winnerRoundLabel: string;
  winnerPrizeGhs: number;
  updatedAt: Timestamp | null;
}

export const CHALLENGE_LIMITS = {
  ROUND_DAYS: 14,
  MIN_DURATION_SEC: 30,
  MAX_DURATION_SEC: 90,
  MAX_FILE_BYTES: 15 * 1024 * 1024, // strictly < 15MB (15,728,640 bytes)
  MAX_CHUNKS: 40,
  CHUNK_RAW_BYTES: 460 * 1024, // ~615KB base64 per chunk (< 750KB limit)
  TITLE_MAX: 120,
  CAPTION_MAX: 400,
  COMMENT_MAX: 500,
  THUMBNAIL_MAX: 195000,
  PRIZE_GHS: 300,
  BOOST_COST_GHS: 20,
  BOOST_DURATION_MS: 24 * 60 * 60 * 1000,
  GIFT_PRICES: {
    rose: 2,
    fire: 5,
    lion: 20,
  },
} as const;
