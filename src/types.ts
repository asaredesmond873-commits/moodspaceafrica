import type { Timestamp } from 'firebase/firestore';

export type AccountType = 'creator' | 'business' | 'community';
export type PostCategory = 'announcement' | 'event' | 'promo';
export type MediaFormat = 'text' | 'photo' | 'video' | 'mix';
export type PostVisibility = 'public' | 'archived';
export type FormFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox';

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
} as const;

export const AFRICAN_CITIES = [
  'Lagos, Nigeria',
  'Nairobi, Kenya',
  'Accra, Ghana',
  'Johannesburg, South Africa',
  'Cape Town, South Africa',
  'Kigali, Rwanda',
  'Addis Ababa, Ethiopia',
  'Cairo, Egypt',
  'Dakar, Senegal',
  'Kampala, Uganda',
  'Dar es Salaam, Tanzania',
  'Casablanca, Morocco',
  'Abidjan, Côte d’Ivoire',
  'Lusaka, Zambia',
  'Harare, Zimbabwe',
] as const;
