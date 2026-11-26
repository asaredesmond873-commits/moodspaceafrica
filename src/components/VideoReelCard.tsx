import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bookmark,
  CheckCircle2,
  Crown,
  Flame,
  Flower2,
  Gift,
  Heart,
  MapPin,
  MessageCircle,
  Play,
  Send,
  Share2,
  ThumbsUp,
  Trash2,
  Trophy,
  UserCheck,
  UserPlus,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  addChallengeVideoComment,
  checkUserLikedChallengeVideo,
  deleteChallengeVideo,
  deleteChallengeVideoComment,
  incrementChallengeVideoShare,
  incrementChallengeVideoView,
  loadChallengeVideoChunks,
  sendChallengeGift,
  subscribeChallengeVideoComments,
  toggleChallengeVideoLike,
} from '../services/challengeService';
import type { FollowTargetSummary } from '../services/firestoreService';
import {
  ADMIN_EMAIL,
  CHALLENGE_LIMITS,
  type ChallengeDailyVote,
  type ChallengeVideo,
  type ChallengeVideoComment,
  type GiftType,
  type VerifiedBadgeInfo,
} from '../types';
import {
  formatCompactCount,
  formatDurationSeconds,
  getAfricanRegionFromLocation,
  loadCachedOrRemoteVideoUrl,
} from '../utils/challengeMedia';
import { formatTimestamp } from '../utils/media';

interface VideoReelCardProps {
  video: ChallengeVideo;
  rank?: number;
  dataSaver: boolean;
  dailyVote: ChallengeDailyVote | null;
  verifiedBadges: Record<string, VerifiedBadgeInfo>;
  isFollowing: boolean;
  isSubscribedToCreator: boolean;
  isSaved: boolean;
  onToggleFollow: (target: FollowTargetSummary) => void;
  onSubscribeCreator: (creatorId: string, creatorName: string, location: string) => void;
  onToggleSaved: (videoId: string) => void;
  onVote: (video: ChallengeVideo) => Promise<void>;
  onOpenBoost: (video: ChallengeVideo) => void;
  onViewProfile: (uid: string) => void;
  onNotify: (msg: string) => void;
}

interface FloatingGift {
  id: number;
  type: GiftType;
  label: string;
}

const GIFT_OPTIONS: {
  type: GiftType;
  label: string;
  tierHint: string;
  amount: number;
  accentClass: string;
}[] = [
  {
    type: 'rose',
    label: 'Rose',
    tierHint: 'Starter support',
    amount: CHALLENGE_LIMITS.GIFT_PRICES.rose,
    accentClass: 'text-[#E11D48]',
  },
  {
    type: 'fire',
    label: 'Fire',
    tierHint: 'Hype boost',
    amount: CHALLENGE_LIMITS.GIFT_PRICES.fire,
    accentClass: 'text-[#EA580C]',
  },
  {
    type: 'lion',
    label: 'Lion',
    tierHint: 'Champion gift',
    amount: CHALLENGE_LIMITS.GIFT_PRICES.lion,
    accentClass: 'text-[#D97706]',
  },
];

function GiftGlyph({ type, className = 'w-4 h-4' }: { type: GiftType; className?: string }) {
  if (type === 'rose') return <Flower2 className={`${className} text-[#E11D48]`} />;
  if (type === 'fire') return <Flame className={`${className} text-[#EA580C]`} />;
  return <Trophy className={`${className} text-[#D97706]`} />;
}

export function VideoReelCard({
  video,
  rank,
  dataSaver,
  dailyVote,
  verifiedBadges,
  isFollowing,
  isSubscribedToCreator,
  isSaved,
  onToggleFollow,
  onSubscribeCreator,
  onToggleSaved,
  onVote,
  onOpenBoost,
  onViewProfile,
  onNotify,
}: VideoReelCardProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lowResCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewCountedRef = useRef(false);

  const [videoSrc, setVideoSrc] = useState<string>('');
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [manualLoadRequested, setManualLoadRequested] = useState(false);

  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);
  const [giftTrayOpen, setGiftTrayOpen] = useState(false);
  const [pendingGift, setPendingGift] = useState<(typeof GIFT_OPTIONS)[number] | null>(null);
  const [giftBusy, setGiftBusy] = useState(false);
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<ChallengeVideoComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [deletingVideo, setDeletingVideo] = useState(false);

  const isBoosted = video.boostedUntil > Date.now();
  const badge = verifiedBadges[video.authorId];
  const hasVotedThisVideo = dailyVote?.videoId === video.id;
  const hasUsedDailyVoteElsewhere = Boolean(dailyVote && dailyVote.videoId !== video.id);
  const isOwnVideo = Boolean(user && user.uid === video.authorId);
  const isOwnerOrAdmin =
    Boolean(user) && (user?.uid === video.authorId || user?.email === ADMIN_EMAIL);
  const regionLabel = getAfricanRegionFromLocation(video.authorLocation);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setIsVisible(entry.isIntersecting && entry.intersectionRatio >= 0.6);
      },
      { threshold: [0.2, 0.6] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
      if (dataSaver) {
        setManualLoadRequested(false);
      }
      return;
    }

    const shouldLoad = !dataSaver || manualLoadRequested;
    if (!shouldLoad || videoSrc || loadingVideo) return;

    let cancelled = false;
    setLoadingVideo(true);
    setLoadError(null);
    loadCachedOrRemoteVideoUrl(video.id, video.mimeType, loadChallengeVideoChunks)
      .then((url) => {
        if (!cancelled) setVideoSrc(url);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load video.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVideo(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isVisible, dataSaver, manualLoadRequested, videoSrc, loadingVideo, video.id, video.mimeType]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoSrc) return;

    if (isVisible && (!dataSaver || manualLoadRequested)) {
      el.muted = isMuted;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            setIsPlaying(true);
            if (!viewCountedRef.current) {
              viewCountedRef.current = true;
              void incrementChallengeVideoView(video.id);
            }
          })
          .catch(() => {
            setIsPlaying(false);
          });
      }
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [isVisible, videoSrc, dataSaver, manualLoadRequested, isMuted, video.id]);

  useEffect(() => {
    if (!dataSaver || !isPlaying || !videoSrc) return;
    const el = videoRef.current;
    const canvas = lowResCanvasRef.current;
    if (!el || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastDraw = 0;
    const renderLowRes = (now: number) => {
      if (now - lastDraw >= 55 && el.readyState >= 2) {
        lastDraw = now;
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      }
      if (isPlaying) {
        rafId = window.requestAnimationFrame(renderLowRes);
      }
    };
    rafId = window.requestAnimationFrame(renderLowRes);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [dataSaver, isPlaying, videoSrc]);

  useEffect(() => {
    if (!user) {
      setLiked(false);
      return;
    }
    let active = true;
    checkUserLikedChallengeVideo(video.id, user.uid)
      .then((res) => {
        if (active) setLiked(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, video.id]);

  useEffect(() => {
    if (!commentsOpen) return;
    const unsub = subscribeChallengeVideoComments(video.id, setComments, () => {});
    return () => unsub();
  }, [commentsOpen, video.id]);

  const handleTogglePlay = () => {
    if (dataSaver && !videoSrc) {
      setManualLoadRequested(true);
      return;
    }
    const el = videoRef.current;
    if (!el || !videoSrc) return;
    if (el.paused) {
      el.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  const handleLike = async () => {
    let uid = user?.uid;
    if (!uid) {
      const signed = await signInWithGoogle();
      if (!signed) return;
      uid = signed.uid;
    }
    if (likeBusy) return;
    setLikeBusy(true);
    const prevLiked = liked;
    setLiked(!prevLiked);
    try {
      await toggleChallengeVideoLike(video.id, uid, prevLiked);
    } catch {
      setLiked(prevLiked);
      onNotify('Could not update like.');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleVoteClick = async () => {
    if (voteBusy) return;
    if (hasVotedThisVideo) {
      onNotify('You already gave your free vote to this story today.');
      return;
    }
    if (hasUsedDailyVoteElsewhere) {
      onNotify('You already used your 1 free daily vote today. Come back tomorrow!');
      return;
    }
    setVoteBusy(true);
    try {
      await onVote(video);
    } finally {
      setVoteBusy(false);
    }
  };

  const handleConfirmSendGift = async (opt: (typeof GIFT_OPTIONS)[number]) => {
    let activeProfile = profile;
    if (!user || !activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) return;
    }
    if (giftBusy) return;
    setGiftBusy(true);
    setGiftTrayOpen(false);
    setPendingGift(null);

    const animId = Date.now() + Math.floor(Math.random() * 1000);
    setFloatingGifts((prev) => [
      ...prev,
      { id: animId, type: opt.type, label: opt.label },
    ]);
    window.setTimeout(() => {
      setFloatingGifts((prev) => prev.filter((item) => item.id !== animId));
    }, 1850);

    try {
      await sendChallengeGift(video.id, activeProfile, opt.type);
      onNotify(`Sent ${opt.label} support to ${video.authorName}!`);
    } catch {
      onNotify('Could not send support gift. Please try again.');
    } finally {
      setGiftBusy(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/#video=${video.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${video.title} on MoodSpace Africa`,
          text: `Watch ${video.authorName}'s African story on MoodSpace Africa!`,
          url: shareUrl,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        onNotify('Story link copied!');
      }
      await incrementChallengeVideoShare(video.id);
    } catch {
      // Cancelled share or clipboard fallback
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || commentBusy) return;
    let activeProfile = profile;
    if (!user || !activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) return;
    }
    setCommentBusy(true);
    try {
      await addChallengeVideoComment(video.id, activeProfile, trimmed);
      setCommentText('');
    } catch {
      onNotify('Could not post comment.');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteChallengeVideoComment(video.id, commentId);
    } catch {
      onNotify('Could not delete comment.');
    }
  };

  const handleDeleteVideo = async () => {
    if (deletingVideo) return;
    setDeletingVideo(true);
    try {
      await deleteChallengeVideo(video.id);
      onNotify('Story removed.');
    } catch {
      onNotify('Could not remove story.');
      setDeletingVideo(false);
    }
  };

  return (
    <article
      ref={cardRef}
      id={`video-reel-${video.id}`}
      className="w-full max-w-[440px] mx-auto bg-white border border-[#E7E5E0] rounded-2xl overflow-hidden shadow-xs snap-start"
    >
      {/* Clean Pan-African Story Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-2.5 border-b border-[#E7E5E0]">
        <button
          type="button"
          onClick={() => onViewProfile(video.authorId)}
          className="flex items-center gap-2.5 min-w-0 text-left group cursor-pointer focus-visible:outline-none"
        >
          {video.authorAvatar ? (
            <img
              src={video.authorAvatar}
              alt={video.authorName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-[#E7E5E0] shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#0E7C5B] text-white font-bold text-sm flex items-center justify-center shrink-0">
              {video.authorName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-[#141413] truncate group-hover:underline">
                {video.authorName}
              </span>
              {badge && <BadgeCheck className="w-4 h-4 text-[#0E7C5B] shrink-0" />}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#5E5D59] truncate">
              <MapPin className="w-3 h-3 text-[#0E7C5B] shrink-0" />
              <span className="truncate">{video.authorLocation || regionLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{formatTimestamp(video.createdAt)}</span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isOwnVideo && (
            <>
              <button
                type="button"
                onClick={() =>
                  onSubscribeCreator(
                    video.authorId,
                    video.authorName,
                    video.authorLocation || 'Africa'
                  )
                }
                title={isSubscribedToCreator ? 'Subscribed to storyteller' : 'Subscribe to storyteller'}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  isSubscribedToCreator
                    ? 'bg-[#FEF3C7] border border-[#FCD34D] text-[#92400E]'
                    : 'bg-[#FAF9F7] border border-[#E7E5E0] text-[#141413] hover:border-[#0E7C5B] hover:text-[#0E7C5B]'
                }`}
              >
                <Crown className="w-3 h-3" />
                <span>{isSubscribedToCreator ? 'Subscribed' : 'Subscribe'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onToggleFollow({
                    uid: video.authorId,
                    displayName: video.authorName,
                    avatarUrl: video.authorAvatar,
                    location: video.authorLocation || 'Africa',
                  })
                }
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  isFollowing
                    ? 'bg-[#FAF9F7] border border-[#E7E5E0] text-[#141413] hover:bg-[#F2F0EC]'
                    : 'bg-[#0E7C5B] text-white hover:bg-[#095E44]'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Follow</span>
                  </>
                )}
              </button>
            </>
          )}
          {isOwnerOrAdmin && (
            <button
              type="button"
              onClick={() => void handleDeleteVideo()}
              disabled={deletingVideo}
              aria-label="Delete story"
              className="w-9 h-9 rounded-lg text-[#5E5D59] hover:text-[#B91C1C] hover:bg-[#FEF2F2] flex items-center justify-center cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Vertical 9:16 Video Player */}
      <div className="relative aspect-[9/16] max-h-[68dvh] w-full bg-[#111827] select-none overflow-hidden">
        <video
          ref={videoRef}
          src={videoSrc || undefined}
          poster={video.thumbnailUrl || undefined}
          preload={dataSaver ? 'none' : 'metadata'}
          playsInline
          loop
          muted={isMuted}
          onClick={handleTogglePlay}
          className={`w-full h-full object-cover cursor-pointer ${
            dataSaver && isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        />

        {dataSaver && isPlaying && videoSrc && (
          <canvas
            ref={lowResCanvasRef}
            width={240}
            height={426}
            onClick={handleTogglePlay}
            className="absolute inset-0 w-full h-full object-cover cursor-pointer"
          />
        )}

        {!videoSrc && (
          <div
            onClick={handleTogglePlay}
            className="absolute inset-0 bg-[#111827] flex flex-col items-center justify-center cursor-pointer"
          >
            {video.thumbnailUrl && (
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                className="absolute inset-0 w-full h-full object-cover opacity-85"
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-2 px-5 py-3.5 rounded-2xl bg-black/65 backdrop-blur-xs text-white text-center">
              {loadingVideo ? (
                <span className="text-xs font-semibold">
                  {dataSaver ? 'Loading low-quality stream...' : 'Loading story...'}
                </span>
              ) : loadError ? (
                <span className="text-xs font-medium text-[#FCA5A5]">{loadError}</span>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-[#0E7C5B] text-white flex items-center justify-center shadow-lg">
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  </div>
                  <span className="text-xs font-semibold">
                    {dataSaver ? 'Data Saver: Tap to Play' : 'Tap to Play'}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {videoSrc && !isPlaying && !loadingVideo && (
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label="Play story"
            className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/55 border border-white/25 text-white flex items-center justify-center cursor-pointer"
          >
            <Play className="w-7 h-7 fill-current ml-0.5" />
          </button>
        )}

        {/* Top Overlay: Quiet metrics & Mute + Bookmark */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/65 to-transparent" />
        <div className="absolute top-3 left-3 right-3 z-20 flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 text-[11px] font-medium text-white drop-shadow">
            <div className="flex items-center gap-2 bg-black/45 px-2.5 py-1 rounded-md tabular-nums">
              {rank && rank <= 10 && (
                <>
                  <span
                    className={`font-bold ${
                      rank === 1
                        ? 'text-[#FBBF24]'
                        : rank === 2
                          ? 'text-[#E5E7EB]'
                          : rank === 3
                            ? 'text-[#F59E0B]'
                            : 'text-white'
                    }`}
                  >
                    #{rank}
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>{formatDurationSeconds(video.durationSeconds)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatCompactCount(video.viewsCount)} views</span>
            </div>
            {isBoosted && (
              <span className="inline-flex items-center gap-1 text-[#A7F3D0] text-[11px] font-semibold px-1">
                <Zap className="w-3 h-3 fill-current" />
                Boosted
              </span>
            )}
            {dataSaver && (
              <span className="inline-flex items-center gap-1 text-[#A7F3D0] text-[11px] font-medium px-1">
                <Wifi className="w-3 h-3" />
                Low Quality Mode
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleSaved(video.id)}
              aria-label={isSaved ? 'Remove from saved stories' : 'Save story'}
              className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                isSaved ? 'bg-[#0E7C5B] text-white' : 'bg-black/50 text-white'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (videoRef.current) videoRef.current.muted = nextMuted;
              }}
              aria-label={isMuted ? 'Unmute video' : 'Mute video'}
              className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Floating Gift Burst Animation (Clean icons, zero money overlay) */}
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
          {floatingGifts.map((fg) => (
            <div
              key={fg.id}
              className="animate-gift-float absolute left-1/2 bottom-24 flex items-center gap-2 px-4 py-2 rounded-full bg-white text-[#141413] shadow-xl border border-[#E7E5E0]"
            >
              <GiftGlyph type={fg.type} className="w-5 h-5" />
              <span className="text-xs font-bold text-[#0E7C5B]">+{fg.label} Sent</span>
            </div>
          ))}
        </div>

        {/* Bottom Gradient Scrim + Story Title Only (No Description) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        <div className="absolute bottom-4 left-3.5 right-20 z-20 text-white space-y-0.5">
          <p className="text-[11px] font-medium text-[#A7F3D0]">{regionLabel}</p>
          <h3 className="font-display text-base font-bold leading-snug line-clamp-2 drop-shadow">
            {video.title}
          </h3>
        </div>

        {/* Right-Rail Social Actions */}
        <div className="absolute right-2.5 bottom-4 z-20 flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleLike()}
            aria-label="Like story"
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xs ${
                liked ? 'bg-[#EF4444] text-white' : 'bg-black/50 text-white'
              }`}
            >
              <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
            </div>
            <span className="text-[11px] font-semibold text-white tabular-nums drop-shadow">
              {formatCompactCount(video.likesCount)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label="Open comments"
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-xs text-white flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-white tabular-nums drop-shadow">
              {formatCompactCount(video.commentsCount)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleVoteClick()}
            disabled={voteBusy}
            aria-label={`Vote for ${video.title}`}
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xs ${
                hasVotedThisVideo
                  ? 'bg-[#0E7C5B] text-white'
                  : 'bg-black/50 text-white hover:bg-[#0E7C5B]/80'
              }`}
            >
              {hasVotedThisVideo ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <ThumbsUp className="w-5 h-5" />
              )}
            </div>
            <span className="text-[11px] font-semibold text-white tabular-nums drop-shadow">
              {hasVotedThisVideo ? 'Voted' : 'Vote'} ({formatCompactCount(video.votesCount)})
            </span>
          </button>

          {/* Support Creator Gift Tray */}
          <div className="relative flex flex-col items-center">
            <button
              type="button"
              onClick={() => {
                setGiftTrayOpen((open) => !open);
                setPendingGift(null);
              }}
              aria-label="Support creator with gift"
              className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-xs text-white flex items-center justify-center">
                <Gift className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-white tabular-nums drop-shadow">
                {video.giftsCount > 0 ? formatCompactCount(video.giftsCount) : 'Support'}
              </span>
            </button>

            {giftTrayOpen && (
              <div className="absolute right-14 bottom-0 w-56 bg-white border border-[#E7E5E0] rounded-2xl p-2.5 space-y-1.5 shadow-2xl z-30 text-[#141413]">
                <div className="flex items-center justify-between px-1 pb-1 border-b border-[#E7E5E0]">
                  <span className="text-[11px] font-bold text-[#141413]">
                    {pendingGift ? 'Confirm Support Gift' : 'Support Storyteller'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setGiftTrayOpen(false);
                      setPendingGift(null);
                    }}
                    aria-label="Close support menu"
                    className="text-[#5E5D59] hover:text-[#141413] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {pendingGift ? (
                  <div className="p-2 space-y-2.5 bg-[#FAF9F7] rounded-xl border border-[#E7E5E0]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-bold text-[#141413]">
                        <GiftGlyph type={pendingGift.type} className="w-4 h-4" />
                        {pendingGift.label}
                      </span>
                      <span className="font-bold text-[#0E7C5B] tabular-nums">
                        {pendingGift.amount} GHS
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPendingGift(null)}
                        className="flex-1 min-h-[34px] rounded-lg border border-[#E7E5E0] bg-white text-[11px] font-semibold text-[#5E5D59] cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={giftBusy}
                        onClick={() => void handleConfirmSendGift(pendingGift)}
                        className="flex-[1.5] min-h-[34px] rounded-lg bg-[#0E7C5B] text-white text-[11px] font-semibold hover:bg-[#095E44] cursor-pointer"
                      >
                        Send Gift
                      </button>
                    </div>
                  </div>
                ) : (
                  GIFT_OPTIONS.map((opt) => (
                    <button
                      key={opt.type}
                      type="button"
                      disabled={giftBusy}
                      onClick={() => setPendingGift(opt)}
                      className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#FAF9F7] hover:bg-[#ECFDF5] border border-[#E7E5E0] flex items-center justify-between text-xs font-semibold text-[#141413] cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <GiftGlyph type={opt.type} className="w-4 h-4" />
                        <span>{opt.label}</span>
                      </span>
                      <span className="text-[11px] font-medium text-[#5E5D59]">{opt.tierHint}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleShare()}
            aria-label="Share story"
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-xs text-white flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold text-white tabular-nums drop-shadow">
              {formatCompactCount(video.sharesCount)}
            </span>
          </button>
        </div>

        {/* Comments Drawer */}
        {commentsOpen && (
          <div className="absolute inset-0 z-40 bg-black/45 flex flex-col justify-end">
            <div className="bg-white border-t border-[#E7E5E0] rounded-t-2xl max-h-[75%] flex flex-col text-[#141413]">
              <div className="px-4 py-3 border-b border-[#E7E5E0] flex items-center justify-between">
                <span className="text-xs font-bold text-[#141413]">
                  Comments ({video.commentsCount})
                </span>
                <button
                  type="button"
                  onClick={() => setCommentsOpen(false)}
                  aria-label="Close comments"
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-[#5E5D59] hover:text-[#141413] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {comments.length === 0 ? (
                  <p className="text-xs text-[#5E5D59] text-center py-6">
                    Be the first to comment on {video.authorName}'s story.
                  </p>
                ) : (
                  comments.map((c) => {
                    const canDeleteComment =
                      Boolean(user) &&
                      (user?.uid === c.authorId || user?.uid === video.authorId);
                    return (
                      <div key={c.id} className="flex items-start gap-2.5 text-xs">
                        {c.authorAvatar ? (
                          <img
                            src={c.authorAvatar}
                            alt={c.authorName}
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#0E7C5B] text-white font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {c.authorName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#141413] truncate">
                              {c.authorName}
                            </span>
                            <span className="text-[10px] text-[#5E5D59] shrink-0">
                              {formatTimestamp(c.createdAt)}
                            </span>
                          </div>
                          <p className="text-[#3F3E3B] break-words mt-0.5">{c.text}</p>
                        </div>
                        {canDeleteComment && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteComment(c.id)}
                            aria-label="Delete comment"
                            className="p-1.5 text-[#5E5D59] hover:text-[#B91C1C] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={(e) => void handleAddComment(e)}
                className="p-3 border-t border-[#E7E5E0] flex items-center gap-2 bg-[#FAF9F7]"
              >
                <input
                  type="text"
                  maxLength={CHALLENGE_LIMITS.COMMENT_MAX}
                  placeholder={user ? 'Write a comment...' : 'Sign in to comment...'}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 min-w-0 min-h-[44px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-base sm:text-xs text-[#141413] placeholder-[#9E9A93] focus:outline-none focus:border-[#0E7C5B]"
                />
                <button
                  type="submit"
                  disabled={commentBusy || !commentText.trim()}
                  aria-label="Send comment"
                  className="w-11 h-11 rounded-xl bg-[#0E7C5B] text-white flex items-center justify-center disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Footer: Vote status + Boost Story (price revealed only when opening checkout) */}
      <div className="px-4 py-2.5 bg-white border-t border-[#E7E5E0] flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={() => void handleVoteClick()}
          disabled={voteBusy}
          className={`min-h-[36px] px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
            hasVotedThisVideo
              ? 'bg-[#ECFDF5] text-[#0E7C5B]'
              : 'text-[#5E5D59] hover:bg-[#FAF9F7] hover:text-[#141413]'
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span className="tabular-nums">
            {hasVotedThisVideo ? 'Voted Today' : `Vote (${video.votesCount})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenBoost(video)}
          className="min-h-[36px] px-3 py-1 rounded-lg border border-[#E7E5E0] bg-[#FAF9F7] hover:border-[#0E7C5B] hover:text-[#0E7C5B] text-[#141413] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
        >
          <Zap className="w-3.5 h-3.5 text-[#0E7C5B]" />
          <span>{isBoosted ? 'Boosted · 24h' : 'Boost Story'}</span>
        </button>
      </div>
    </article>
  );
}
