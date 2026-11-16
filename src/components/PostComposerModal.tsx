import { ImagePlus, X } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { createPost, updatePost } from '../services/firestoreService';
import {
  type FormConfig,
  type MediaFormat,
  type Post,
  type PostCategory,
  type PostVisibility,
  SCHEMA_LIMITS,
} from '../types';
import { compressImageFile } from '../utils/media';
import { FormBuilder } from './FormBuilder';

interface PostComposerModalProps {
  isOpen: boolean;
  editingPost: Post | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const DEFAULT_FORM_CONFIG: FormConfig = {
  title: '',
  description: '',
  isOpen: true,
  fields: [],
};

export function PostComposerModal({
  isOpen,
  editingPost,
  onClose,
  onSaved,
}: PostComposerModalProps) {
  const { profile } = useAuth();
  const [category, setCategory] = useState<PostCategory>('announcement');
  const [mediaFormat, setMediaFormat] = useState<MediaFormat>('text');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [hasForm, setHasForm] = useState(false);
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingPost) {
      setCategory(editingPost.category);
      setMediaFormat(editingPost.mediaFormat);
      setVisibility(editingPost.visibility);
      setTitle(editingPost.title);
      setContent(editingPost.content);
      setPhotoUrl(editingPost.photoUrl);
      setVideoUrl(editingPost.videoUrl);
      setEventDate(editingPost.eventDate);
      setEventLocation(editingPost.eventLocation);
      setPromoCode(editingPost.promoCode);
      setHasForm(editingPost.hasForm);
      setFormConfig(
        editingPost.formConfig?.fields
          ? editingPost.formConfig
          : DEFAULT_FORM_CONFIG
      );
    } else {
      setCategory('announcement');
      setMediaFormat('text');
      setVisibility('public');
      setTitle('');
      setContent('');
      setPhotoUrl('');
      setVideoUrl('');
      setEventDate('');
      setEventLocation('');
      setPromoCode('');
      setHasForm(false);
      setFormConfig(DEFAULT_FORM_CONFIG);
    }
    setErrorMsg(null);
  }, [isOpen, editingPost]);

  if (!isOpen || !profile) return null;

  const showPhotoField = mediaFormat === 'photo' || mediaFormat === 'mix';
  const showVideoField = mediaFormat === 'video' || mediaFormat === 'mix';

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setErrorMsg(null);
    try {
      const compressed = await compressImageFile(file, 1080, 320000);
      setPhotoUrl(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not process image.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg('Please enter a clear headline for your post.');
      return;
    }
    if (!content.trim()) {
      setErrorMsg('Please add your announcement, event, or promo details.');
      return;
    }
    if (mediaFormat === 'photo' && !photoUrl.trim()) {
      setErrorMsg('Please add a photo or switch media format to Text or Mix.');
      return;
    }
    if (mediaFormat === 'video' && !videoUrl.trim()) {
      setErrorMsg('Please enter a video link (MP4, YouTube, or Vimeo) or switch media format.');
      return;
    }
    if (hasForm) {
      if (formConfig.fields.length === 0) {
        setErrorMsg('Please add at least one question to your custom form, or choose "No Form".');
        return;
      }
      if (formConfig.fields.some((f) => !f.label.trim())) {
        setErrorMsg('Please enter a question for every row in your custom form.');
        return;
      }
      if (
        formConfig.fields.some(
          (f) => f.type === 'select' && f.options.map((o) => o.trim()).filter(Boolean).length === 0
        )
      ) {
        setErrorMsg('Please add at least one choice for every dropdown question.');
        return;
      }
    }

    setSaving(true);
    try {
      const cleanPhoto = showPhotoField ? photoUrl.trim() : '';
      const cleanVideo = showVideoField ? videoUrl.trim() : '';
      const cleanForm: FormConfig = hasForm
        ? formConfig
        : { title: '', description: '', isOpen: false, fields: [] };

      if (editingPost) {
        await updatePost(editingPost.id, {
          authorName: profile.displayName,
          authorAvatar: profile.avatarUrl,
          authorLocation: profile.location,
          category,
          mediaFormat,
          visibility,
          title,
          content,
          photoUrl: cleanPhoto,
          videoUrl: cleanVideo,
          eventDate: category === 'event' || mediaFormat === 'mix' ? eventDate : '',
          eventLocation: category === 'event' || mediaFormat === 'mix' ? eventLocation : '',
          promoCode: category === 'promo' || mediaFormat === 'mix' ? promoCode : '',
          hasForm,
          formConfig: cleanForm,
        });
        onSaved('Post and form settings updated');
      } else {
        await createPost({
          author: profile,
          category,
          mediaFormat,
          visibility,
          title,
          content,
          photoUrl: cleanPhoto,
          videoUrl: cleanVideo,
          eventDate: category === 'event' || mediaFormat === 'mix' ? eventDate : '',
          eventLocation: category === 'event' || mediaFormat === 'mix' ? eventLocation : '',
          promoCode: category === 'promo' || mediaFormat === 'mix' ? promoCode : '',
          hasForm,
          formConfig: cleanForm,
        });
        onSaved('Your post is live on MoodSpace Africa');
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save your post.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-title"
    >
      <div className="w-full max-w-2xl bg-white border border-[#E7E5E0] rounded-2xl shadow-xl my-6 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E7E5E0]">
          <div>
            <h2 id="composer-title" className="font-display text-xl font-bold text-[#141413]">
              {editingPost ? 'Edit Post & Form' : 'Publish to MoodSpace Africa'}
            </h2>
            <p className="text-xs text-[#5E5D59] mt-0.5">
              Posting as {profile.displayName} · {profile.location}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="p-2 text-[#5E5D59] hover:text-[#141413] rounded-lg hover:bg-[#FAF9F7] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Category & Media Format Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-[#5E5D59] mb-2">
                Post Category
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#FAF9F7] border border-[#E7E5E0] rounded-lg">
                {(['announcement', 'event', 'promo'] as PostCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold capitalize rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      category === cat
                        ? 'bg-[#141413] text-white'
                        : 'text-[#5E5D59] hover:text-[#141413]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#5E5D59] mb-2">
                Media Format
              </span>
              <div className="flex items-center gap-1 p-1 bg-[#FAF9F7] border border-[#E7E5E0] rounded-lg">
                {(['text', 'photo', 'video', 'mix'] as MediaFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setMediaFormat(fmt)}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold capitalize rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      mediaFormat === fmt
                        ? 'bg-[#0E7C5B] text-white'
                        : 'text-[#5E5D59] hover:text-[#141413]'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Headline & Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#5E5D59]">Headline</label>
              <span className="text-[11px] font-mono text-[#5E5D59] tabular-nums">
                {title.length}/{SCHEMA_LIMITS.TITLE_MAX}
              </span>
            </div>
            <input
              type="text"
              required
              maxLength={SCHEMA_LIMITS.TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Osu Night Market & Accra Makers Pop-Up"
              className="w-full px-3.5 py-2.5 text-sm border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#5E5D59]">Details &amp; Story</label>
              <span className="text-[11px] font-mono text-[#5E5D59] tabular-nums">
                {content.length}/{SCHEMA_LIMITS.CONTENT_MAX}
              </span>
            </div>
            <textarea
              rows={4}
              required
              maxLength={SCHEMA_LIMITS.CONTENT_MAX}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share what is happening in Ghana or across Africa, and how people can join..."
              className="w-full px-3.5 py-2.5 text-sm border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
            />
          </div>

          {/* Conditional Event / Promo Metadata */}
          {(category === 'event' || mediaFormat === 'mix') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#5E5D59] mb-1">
                  Event Date &amp; Time
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.EVENT_DATE_MAX}
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  placeholder="e.g. Sat 28 Nov · 16:00 GMT"
                  className="w-full px-3 py-2 text-sm border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5E5D59] mb-1">
                  Venue / City or Link
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.EVENT_LOCATION_MAX}
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="e.g. Osu, Accra or Kumasi City Mall"
                  className="w-full px-3 py-2 text-sm border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                />
              </div>
            </div>
          )}

          {(category === 'promo' || mediaFormat === 'mix') && (
            <div>
              <label className="block text-xs font-semibold text-[#5E5D59] mb-1">
                Promo Code or Offer Tag (optional)
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.PROMO_CODE_MAX}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="e.g. ACCRAVIP20"
                className="w-full px-3 py-2 text-sm font-mono border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
              />
            </div>
          )}

          {/* Photo Input */}
          {showPhotoField && (
            <div className="p-4 border border-[#E7E5E0] rounded-xl bg-[#FAF9F7] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#141413]">Photo Media</span>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#141413] bg-white border border-[#D4D1CA] rounded-lg hover:border-[#0E7C5B] cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5" />
                  {uploadingPhoto ? 'Optimizing...' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <input
                type="text"
                maxLength={SCHEMA_LIMITS.PHOTO_URL_MAX}
                value={photoUrl.startsWith('data:') ? '' : photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="Paste an image URL (https://...) or upload a photo above"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
              />

              {photoUrl && (
                <div className="relative rounded-lg overflow-hidden border border-[#E7E5E0] bg-white">
                  <img
                    src={photoUrl}
                    alt="Selected preview"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-56 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl('')}
                    className="absolute top-2 right-2 px-2.5 py-1 text-xs font-semibold bg-black/70 text-white rounded-md hover:bg-black cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Video Input */}
          {showVideoField && (
            <div className="p-4 border border-[#E7E5E0] rounded-xl bg-[#FAF9F7] space-y-2">
              <label className="block text-xs font-semibold text-[#141413]">
                Video URL (YouTube, Vimeo, or direct MP4/WebM)
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.VIDEO_URL_MAX}
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://.../video.mp4"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
              />
            </div>
          )}

          {/* Adjustable Form Builder */}
          <FormBuilder
            hasForm={hasForm}
            onToggleHasForm={setHasForm}
            formConfig={formConfig}
            onChange={setFormConfig}
          />

          {/* Visibility */}
          <div className="flex items-center justify-between pt-2 border-t border-[#E7E5E0]">
            <label className="text-xs font-semibold text-[#5E5D59]">
              Feed Visibility
            </label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as PostVisibility)}
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
            >
              <option value="public">Public on Feed</option>
              <option value="archived">Archived (Dashboard Only)</option>
            </select>
          </div>

          {errorMsg && (
            <p className="text-sm text-[#B91C1C] bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#5E5D59] hover:text-[#141413] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-60 cursor-pointer"
            >
              {saving
                ? 'Saving...'
                : editingPost
                  ? 'Save Changes'
                  : 'Publish Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
