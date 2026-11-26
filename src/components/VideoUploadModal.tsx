import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Eye,
  Film,
  Lock,
  Trophy,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { uploadChallengeVideo } from '../services/challengeService';
import { CHALLENGE_LIMITS, type ChallengeVideo } from '../types';
import {
  formatDurationSeconds,
  formatFileSizeMb,
  validateChallengeVideoFile,
  type ChallengeRoundInfo,
  type ValidatedVideoMeta,
} from '../utils/challengeMedia';

interface VideoUploadModalProps {
  round: ChallengeRoundInfo;
  existingEntry: ChallengeVideo | null;
  hasCreatorPass: boolean;
  onOpenSubscribe: () => void;
  onClose: () => void;
  onUploaded: (video: ChallengeVideo) => void;
}

export function VideoUploadModal({
  round,
  existingEntry,
  hasCreatorPass,
  onOpenSubscribe,
  onClose,
  onUploaded,
}: VideoUploadModalProps) {
  const { profile, signInWithGoogle } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [meta, setMeta] = useState<ValidatedVideoMeta | null>(null);
  const [validating, setValidating] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    setError(null);
    setMeta(null);
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    if (!picked) return;

    setValidating(true);
    try {
      const checked = await validateChallengeVideoFile(picked);
      setFile(picked);
      setMeta(checked);
      setPreviewUrl(URL.createObjectURL(picked));
      if (!title.trim()) {
        const cleanName = picked.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .slice(0, 80);
        if (cleanName) setTitle(cleanName);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hasCreatorPass) {
      setError('An active $10/month Creator Pass is required to upload a story and enter to win the prize.');
      return;
    }

    if (existingEntry) {
      setError('You have already uploaded your 1 story video for this 14-day round.');
      return;
    }

    let activeProfile = profile;
    if (!activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) return;
    }

    if (!file || !meta) {
      setError('Select a valid 30s to 90s video under 15 MB first.');
      return;
    }

    const finalTitle =
      title.trim() ||
      file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80) ||
      'African Story';

    setUploading(true);
    setProgress(5);
    setProgressStage('Starting upload...');
    try {
      const created = await uploadChallengeVideo(
        round.roundId,
        activeProfile,
        file,
        meta,
        finalTitle,
        '',
        (pct, stage) => {
          setProgress(pct);
          setProgressStage(stage);
        }
      );
      onUploaded(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-upload-title"
    >
      <div className="w-full sm:max-w-lg bg-white border border-[#E7E5E0] rounded-t-2xl sm:rounded-2xl text-[#141413] max-h-[92dvh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-[#E7E5E0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#0E7C5B]">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h2 id="video-upload-title" className="font-display text-base font-bold text-[#141413]">
                Upload African Story ({round.label})
              </h2>
              <p className="text-xs text-[#5E5D59]">Videos only · No descriptions · Just upload</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close upload modal"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-[#5E5D59] hover:text-[#141413] hover:bg-[#FAF9F7] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-[#5E5D59] bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl px-3.5 py-2.5">
            <span>1 story per 14 days</span>
            <span aria-hidden="true">·</span>
            <span>30s to 90s</span>
            <span aria-hidden="true">·</span>
            <span>Under 15 MB</span>
          </div>

          {!hasCreatorPass ? (
            <div className="bg-[#FAF9F7] border border-[#E7E5E0] rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] text-[#0E7C5B] flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-display text-base font-bold text-[#141413]">
                    Subscribe to Post &amp; Enter to Win
                  </h3>
                  <p className="text-xs text-[#5E5D59] leading-relaxed">
                    Free members can watch, like, comment, follow, and vote. Only subscribed Creator Pass members ($10/month via Paystack) can post a story to compete for the prize.
                  </p>
                </div>
              </div>

              <ul className="space-y-2 text-xs text-[#353431] bg-white border border-[#E7E5E0] rounded-xl p-3.5">
                <li className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#0E7C5B] shrink-0" />
                  <span>Post your African story video &amp; enter to win the prize</span>
                </li>
                <li className="flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-[#0E7C5B] shrink-0" />
                  <span>Receive a Verified Creator badge on your profile</span>
                </li>
                <li className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#0E7C5B] shrink-0" />
                  <span>See who viewed your profile</span>
                </li>
              </ul>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-[#5E5D59] bg-white border border-[#E7E5E0] rounded-xl cursor-pointer"
                >
                  Keep Browsing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSubscribe();
                  }}
                  className="flex-[1.5] min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-xl hover:bg-[#095E44] cursor-pointer"
                >
                  Subscribe · $10/mo
                </button>
              </div>
            </div>
          ) : existingEntry ? (
            <div className="bg-[#FAF9F7] border border-[#A7F3D0] rounded-xl p-4 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#0E7C5B] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#141413]">
                    Your {round.label} story is already live
                  </p>
                  <p className="text-xs text-[#5E5D59]">
                    Each storyteller can upload 1 video per 14-day round. Share it so viewers across Africa can watch and vote for your story!
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#E7E5E0] text-xs">
                <span className="font-semibold text-[#141413] truncate pr-3">{existingEntry.title}</span>
                <span className="text-[#0E7C5B] font-semibold tabular-nums shrink-0">
                  {existingEntry.votesCount} votes · {existingEntry.viewsCount} views
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[44px] mt-2 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-xl cursor-pointer"
              >
                Back to Stories
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <label
                htmlFor="challenge-video-file"
                className={`block border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                  meta
                    ? 'border-[#0E7C5B] bg-[#ECFDF5]/40'
                    : 'border-[#D4D1CA] bg-[#FAF9F7] hover:border-[#0E7C5B]'
                }`}
              >
                <input
                  id="challenge-video-file"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/*"
                  onChange={(e) => void handleFileChange(e)}
                  disabled={uploading || validating}
                  className="sr-only"
                />
                {previewUrl && meta ? (
                  <div className="space-y-3">
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      className="w-full max-h-60 rounded-lg bg-black object-contain mx-auto"
                    />
                    <div className="flex items-center justify-center gap-4 text-xs font-medium text-[#0E7C5B]">
                      <span className="flex items-center gap-1">
                        <Film className="w-3.5 h-3.5" />
                        {formatDurationSeconds(meta.durationSeconds)}
                      </span>
                      <span>{formatFileSizeMb(meta.fileSizeBytes)}</span>
                      <span className="underline">Change video</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-5 space-y-2">
                    <Upload className="w-8 h-8 text-[#0E7C5B] mx-auto" />
                    <p className="text-sm font-semibold text-[#141413]">
                      {validating ? 'Checking duration & file size...' : 'Tap to choose your African story video'}
                    </p>
                    <p className="text-xs text-[#5E5D59]">
                      MP4 or WebM · 30s to 90s · Strictly less than 15 MB
                    </p>
                  </div>
                )}
              </label>

              <div className="space-y-1.5">
                <label htmlFor="video-title" className="block text-xs font-semibold text-[#141413]">
                  Story Title
                </label>
                <input
                  id="video-title"
                  type="text"
                  maxLength={CHALLENGE_LIMITS.TITLE_MAX}
                  placeholder="e.g. Morning Markets of Makola / Nairobi Matatu Stories"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={uploading}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-[#E7E5E0] rounded-xl text-base sm:text-sm text-[#141413] placeholder-[#9E9A93] focus:outline-none focus:border-[#0E7C5B]"
                  required
                />
              </div>

              {uploading && (
                <div className="space-y-1.5 bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#141413] font-medium">{progressStage}</span>
                    <span className="text-[#0E7C5B] font-bold tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-2 bg-[#E7E5E0] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0E7C5B] transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={uploading}
                  className="flex-1 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-[#5E5D59] bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl hover:text-[#141413] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || validating || !meta}
                  className="flex-[1.5] min-h-[44px] px-4 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-xl hover:bg-[#095E44] disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? 'Uploading Video...' : 'Upload Story'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
