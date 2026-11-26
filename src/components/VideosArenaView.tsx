import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Bookmark,
  Clock,
  Crown,
  Eye,
  Film,
  Flame,
  Globe2,
  Medal,
  Search,
  ThumbsUp,
  TrendingUp,
  Trophy,
  Upload,
  Users,
  Video,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  castDailyVote,
  fetchMyDailyVote,
  saveChallengeConfig,
  subscribeChallengeConfig,
} from '../services/challengeService';
import type { FollowTargetSummary } from '../services/firestoreService';
import {
  ADMIN_EMAIL,
  AFRICAN_REGIONS,
  CHALLENGE_LIMITS,
  type AfricanRegion,
  type ChallengeConfig,
  type ChallengeDailyVote,
  type ChallengeVideo,
  type VerifiedBadgeInfo,
} from '../types';
import {
  computeCreatorSupportScore,
  formatCompactCount,
  getAfricanRegionFromLocation,
  getCountdownParts,
  getCurrentChallengeRound,
  getTodayUtcDateKey,
} from '../utils/challengeMedia';
import {
  readSupporterStreak,
  recordSupporterActivity,
  type SupporterStreakState,
} from '../utils/streak';
import { VideoReelCard } from './VideoReelCard';
import { VideoUploadModal } from './VideoUploadModal';
import { WinnerSpotlightCard } from './WinnerSpotlightCard';

interface VideosArenaViewProps {
  roundVideos: ChallengeVideo[];
  allVideos: ChallengeVideo[];
  videosLoading: boolean;
  initialViewMode?: 'stories' | 'leaderboard';
  verifiedBadges: Record<string, VerifiedBadgeInfo>;
  followingIds: Set<string>;
  subscribedTargetIds: Set<string>;
  hasProSubscription: boolean;
  savedVideoIds: Set<string>;
  onToggleFollow: (target: FollowTargetSummary) => void;
  onToggleSaved: (videoId: string) => void;
  onOpenBoost: (video: ChallengeVideo) => void;
  onSubscribeCreator: (creatorId: string, creatorName: string, location: string) => void;
  onOpenSubscriptionsPage: () => void;
  onViewProfile: (uid: string) => void;
  onNotify: (msg: string) => void;
  uploadRequestedNonce?: number;
}

const DATA_SAVER_STORAGE_KEY = 'moodspace_africa_data_saver_v1';

const DEFAULT_ARENA_CONFIG: ChallengeConfig = {
  isPublic: true,
  sponsorName: 'Community',
  prizeGhs: CHALLENGE_LIMITS.PRIZE_GHS,
  winnerVideoId: '',
  winnerName: 'Ama Serwaa',
  winnerLocation: 'Accra, Ghana',
  winnerTitle: 'Voices Along the Coast — Pan-African Rhythm',
  winnerThumbnailUrl: '',
  winnerRoundLabel: 'Last Round',
  winnerPrizeGhs: CHALLENGE_LIMITS.PRIZE_GHS,
  updatedAt: null,
};

export function VideosArenaView({
  roundVideos,
  allVideos,
  videosLoading,
  initialViewMode = 'stories',
  verifiedBadges,
  followingIds,
  subscribedTargetIds,
  hasProSubscription,
  savedVideoIds,
  onToggleFollow,
  onToggleSaved,
  onOpenBoost,
  onSubscribeCreator,
  onOpenSubscriptionsPage,
  onViewProfile,
  onNotify,
  uploadRequestedNonce = 0,
}: VideosArenaViewProps) {
  const { user, signInWithGoogle } = useAuth();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const round = useMemo(() => getCurrentChallengeRound(nowMs), [Math.floor(nowMs / 60000)]);
  const countdown = useMemo(() => getCountdownParts(round.endMs, nowMs), [round.endMs, nowMs]);

  const [config, setConfig] = useState<ChallengeConfig>(DEFAULT_ARENA_CONFIG);
  const [dailyVote, setDailyVote] = useState<ChallengeDailyVote | null>(null);

  const [dataSaver, setDataSaver] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DATA_SAVER_STORAGE_KEY) === 'true';
  });

  const [feedScope, setFeedScope] = useState<'for_you' | 'following' | 'saved'>('for_you');
  const [feedSort, setFeedSort] = useState<'trending' | 'boosted' | 'latest'>('trending');
  const [selectedRegion, setSelectedRegion] = useState<AfricanRegion>('All Africa');
  const [searchQuery, setSearchQuery] = useState('');
  const [streak, setStreak] = useState<SupporterStreakState>(() => readSupporterStreak());
  const [mobilePanel, setMobilePanel] = useState<'feed' | 'leaderboard' | 'rewards'>(
    initialViewMode === 'leaderboard' ? 'leaderboard' : 'feed'
  );
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const isAdmin = Boolean(user?.email === ADMIN_EMAIL);

  useEffect(() => {
    if (initialViewMode === 'leaderboard') {
      setMobilePanel('leaderboard');
    } else {
      setMobilePanel('feed');
    }
  }, [initialViewMode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (uploadRequestedNonce > 0) {
      setUploadModalOpen(true);
    }
  }, [uploadRequestedNonce]);

  useEffect(() => {
    const unsubConfig = subscribeChallengeConfig(setConfig);
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    if (!user) {
      setDailyVote(null);
      if (feedScope === 'following' || feedScope === 'saved') {
        setFeedScope('for_you');
      }
      return;
    }
    const dateKey = getTodayUtcDateKey();
    fetchMyDailyVote(user.uid, dateKey)
      .then((vote) => {
        setDailyVote(vote);
        if (vote) {
          setStreak(recordSupporterActivity(dateKey));
        }
      })
      .catch(() => setDailyVote(null));
  }, [user, feedScope]);

  useEffect(() => {
    if (videosLoading || typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#video=')) return;
    const targetId = hash.replace('#video=', '').trim();
    if (!targetId) return;
    const el = document.getElementById(`video-reel-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [videosLoading, roundVideos.length]);

  const myRoundEntry = useMemo(
    () => (user ? roundVideos.find((v) => v.authorId === user.uid) ?? null : null),
    [roundVideos, user]
  );

  // Saved scope searches across all active rounds so bookmarks stay accessible
  const baseVideoList = feedScope === 'saved' ? allVideos : roundVideos;

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = baseVideoList.filter((v) => {
      if (feedScope === 'following' && !followingIds.has(v.authorId)) {
        return false;
      }
      if (feedScope === 'saved' && !savedVideoIds.has(v.id)) {
        return false;
      }
      if (selectedRegion !== 'All Africa') {
        if (getAfricanRegionFromLocation(v.authorLocation) !== selectedRegion) {
          return false;
        }
      }
      if (!q) return true;
      return (
        v.title.toLowerCase().includes(q) ||
        v.authorName.toLowerCase().includes(q) ||
        v.authorLocation.toLowerCase().includes(q)
      );
    });

    const sorted = [...matched];
    if (feedSort === 'trending') {
      sorted.sort((a, b) => computeCreatorSupportScore(b, nowMs) - computeCreatorSupportScore(a, nowMs));
    } else if (feedSort === 'boosted') {
      sorted.sort((a, b) => {
        const aActive = a.boostedUntil > nowMs ? 1 : 0;
        const bActive = b.boostedUntil > nowMs ? 1 : 0;
        if (bActive !== aActive) return bActive - aActive;
        if (b.boostedUntil !== a.boostedUntil) return b.boostedUntil - a.boostedUntil;
        return b.viewsCount - a.viewsCount;
      });
    } else {
      sorted.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    }
    return sorted;
  }, [baseVideoList, feedScope, feedSort, followingIds, savedVideoIds, selectedRegion, searchQuery, nowMs]);

  const risingStorytellers = useMemo(() => {
    const map = new Map<
      string,
      {
        uid: string;
        displayName: string;
        avatarUrl: string;
        location: string;
        region: string;
        score: number;
        videoId: string;
      }
    >();

    for (const v of allVideos) {
      if (user && v.authorId === user.uid) continue;
      const score = computeCreatorSupportScore(v, nowMs);
      const existing = map.get(v.authorId);
      if (!existing) {
        map.set(v.authorId, {
          uid: v.authorId,
          displayName: v.authorName,
          avatarUrl: v.authorAvatar,
          location: v.authorLocation || 'Africa',
          region: getAfricanRegionFromLocation(v.authorLocation),
          score,
          videoId: v.id,
        });
      } else if (score > existing.score) {
        existing.score = score;
      }
    }

    return Array.from(map.values())
      .sort((a, b) => {
        const aFollowed = followingIds.has(a.uid) ? 1 : 0;
        const bFollowed = followingIds.has(b.uid) ? 1 : 0;
        if (aFollowed !== bFollowed) return aFollowed - bFollowed;
        return b.score - a.score;
      })
      .slice(0, 8);
  }, [allVideos, user, followingIds, nowMs]);

  const top10Leaderboard = useMemo(() => {
    const ranked = [...roundVideos].sort((a, b) => {
      const scoreDiff = computeCreatorSupportScore(b, nowMs) - computeCreatorSupportScore(a, nowMs);
      if (scoreDiff !== 0) return scoreDiff;
      if (b.votesCount !== a.votesCount) return b.votesCount - a.votesCount;
      return b.viewsCount - a.viewsCount;
    });
    return ranked.slice(0, 10);
  }, [roundVideos, nowMs]);

  const rankLookup = useMemo(() => {
    const map = new Map<string, number>();
    top10Leaderboard.forEach((v, idx) => {
      map.set(v.id, idx + 1);
    });
    return map;
  }, [top10Leaderboard]);

  const toggleDataSaver = () => {
    setDataSaver((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DATA_SAVER_STORAGE_KEY, String(next));
      }
      onNotify(
        next
          ? 'Data Saver ON — stories load in low quality on tap.'
          : 'Data Saver OFF — standard video quality restored.'
      );
      return next;
    });
  };

  const handleOpenUpload = async () => {
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
    }
    setUploadModalOpen(true);
  };

  const handleSelectProtectedScope = async (scope: 'following' | 'saved') => {
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
    }
    setFeedScope(scope);
    setMobilePanel('feed');
  };

  const handleVote = async (video: ChallengeVideo) => {
    let uid = user?.uid;
    if (!uid) {
      const signed = await signInWithGoogle();
      if (!signed) return;
      uid = signed.uid;
    }

    try {
      const savedVote = await castDailyVote(uid, video.id);
      setDailyVote(savedVote);
      setStreak(recordSupporterActivity(getTodayUtcDateKey()));
      onNotify(`Free daily vote counted for ${video.authorName}!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('PERMISSION_DENIED')) {
        onNotify('You already used your 1 free vote for today.');
      } else {
        onNotify('Could not submit vote. Please try again.');
      }
    }
  };

  const handleSelectWinner = async (video: ChallengeVideo) => {
    if (!isAdmin) return;
    try {
      await saveChallengeConfig({
        sponsorName: config.sponsorName || 'Community',
        prizeGhs: CHALLENGE_LIMITS.PRIZE_GHS,
        winnerVideoId: video.id,
        winnerName: video.authorName,
        winnerLocation: video.authorLocation || 'Africa',
        winnerTitle: video.title,
        winnerThumbnailUrl: video.thumbnailUrl,
        winnerRoundLabel: round.label,
        winnerPrizeGhs: CHALLENGE_LIMITS.PRIZE_GHS,
      });
      onNotify(`${video.authorName} crowned as this round's Champion!`);
    } catch {
      onNotify('Could not save winner spotlight.');
    }
  };

  const jumpToVideo = (videoId: string) => {
    setFeedScope('for_you');
    setSelectedRegion('All Africa');
    setSearchQuery('');
    setMobilePanel('feed');
    window.setTimeout(() => {
      const el = document.getElementById(`video-reel-${videoId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  };

  const isLeaderboardPrimary = initialViewMode === 'leaderboard';

  return (
    <div className="min-h-screen bg-[#FAF9F7] text-[#141413]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-6">
        {/* Top Social Header + Search + Actions */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141413]">
                {isLeaderboardPrimary ? 'Top African Storytellers' : 'African Stories'}
              </h1>
              <p className="text-sm text-[#5E5D59]">
                {isLeaderboardPrimary
                  ? 'Ranked by community votes, gifts, story boosts, and engagement across Africa.'
                  : 'Real stories from every corner of Africa. Watch, vote, support creators, and boost standout clips.'}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={toggleDataSaver}
                aria-pressed={dataSaver}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                  dataSaver
                    ? 'bg-[#ECFDF5] border-[#0E7C5B] text-[#0E7C5B]'
                    : 'bg-white border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
                }`}
              >
                <Wifi className="w-4 h-4 shrink-0" />
                <span>Data Saver: {dataSaver ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenSubscriptionsPage}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E7E5E0] bg-white text-xs font-semibold text-[#141413] hover:border-[#0E7C5B] hover:text-[#0E7C5B] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Crown className="w-4 h-4 text-[#D97706]" />
                <span>{hasProSubscription ? 'Pro Active' : 'Subscriptions'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleOpenUpload()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold flex items-center gap-2 hover:bg-[#095E44] cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span>{myRoundEntry ? 'My Round Story' : 'Upload Story'}</span>
              </button>
            </div>
          </div>

          {!isLeaderboardPrimary && (
            <>
              {/* Search & Feed Scope Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#5E5D59] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search stories, creators, or African cities..."
                    aria-label="Search African stories"
                    className="w-full min-h-[44px] pl-10 pr-9 py-2 bg-white border border-[#E7E5E0] rounded-xl text-base sm:text-sm text-[#141413] placeholder-[#9E9A93] focus:outline-none focus:border-[#0E7C5B]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#5E5D59] hover:text-[#141413] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <div className="inline-flex items-center p-1 bg-white border border-[#E7E5E0] rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setFeedScope('for_you');
                        setMobilePanel('feed');
                      }}
                      className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        feedScope === 'for_you'
                          ? 'bg-[#141413] text-white'
                          : 'text-[#5E5D59] hover:text-[#141413]'
                      }`}
                    >
                      For You
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSelectProtectedScope('following')}
                      className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                        feedScope === 'following'
                          ? 'bg-[#141413] text-white'
                          : 'text-[#5E5D59] hover:text-[#141413]'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Following</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSelectProtectedScope('saved')}
                      className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                        feedScope === 'saved'
                          ? 'bg-[#141413] text-white'
                          : 'text-[#5E5D59] hover:text-[#141413]'
                      }`}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Saved</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Pan-African Region Filter + Feed Sort Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <Globe2 className="w-4 h-4 text-[#0E7C5B] shrink-0" />
                  {AFRICAN_REGIONS.map((region) => {
                    const active = selectedRegion === region;
                    return (
                      <button
                        key={region}
                        type="button"
                        onClick={() => setSelectedRegion(region)}
                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#0E7C5B] text-white'
                            : 'bg-white border border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
                        }`}
                      >
                        {region}
                      </button>
                    );
                  })}
                </div>

                <div
                  role="group"
                  aria-label="Sort African stories"
                  className="inline-flex items-center gap-1 p-1 bg-white border border-[#E7E5E0] rounded-xl self-start sm:self-auto shrink-0"
                >
                  {[
                    { id: 'trending' as const, label: 'Trending', Icon: TrendingUp },
                    { id: 'boosted' as const, label: 'Boosted', Icon: Zap },
                    { id: 'latest' as const, label: 'Latest', Icon: Clock },
                  ].map(({ id, label, Icon }) => {
                    const active = feedSort === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFeedSort(id)}
                        className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#ECFDF5] text-[#0E7C5B]'
                            : 'text-[#5E5D59] hover:text-[#141413]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Mobile Panel Switcher (< lg) */}
        {!isLeaderboardPrimary && (
          <div className="flex lg:hidden items-center gap-1.5 bg-white border border-[#E7E5E0] rounded-xl p-1">
            {[
              { id: 'feed' as const, label: `Stories (${filteredVideos.length})` },
              { id: 'leaderboard' as const, label: 'Top 10' },
              { id: 'rewards' as const, label: 'Rewards & Winner' },
            ].map((tab) => {
              const active = mobilePanel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobilePanel(tab.id)}
                  className={`flex-1 min-h-[44px] px-2 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active ? 'bg-[#0E7C5B] text-white' : 'text-[#5E5D59] hover:text-[#141413]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Primary Column: Vertical African Stories Feed (or Leaderboard primary when on Leaderboard view) */}
          {!isLeaderboardPrimary ? (
            <div
              className={`lg:col-span-7 space-y-6 ${
                mobilePanel === 'feed' ? 'block' : 'hidden lg:block'
              }`}
            >
              {/* Instant Upload Prompt */}
              <div className="max-w-[440px] mx-auto bg-white border border-[#E7E5E0] rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#ECFDF5] text-[#0E7C5B] flex items-center justify-center shrink-0">
                    <Video className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#141413] truncate">
                      {myRoundEntry
                        ? `Your ${round.label} story is live`
                        : 'Tell an African story (30s–90s)'}
                    </p>
                    <p className="text-xs text-[#5E5D59] truncate">
                      Video only · Under 15 MB · 1 upload per 14 days
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleOpenUpload()}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold hover:bg-[#095E44] shrink-0 cursor-pointer"
                >
                  {myRoundEntry ? 'View Status' : 'Upload'}
                </button>
              </div>

              {/* Rising African Storytellers Discovery Strip */}
              {feedScope === 'for_you' && risingStorytellers.length > 0 && (
                <section
                  aria-label="Rising African Storytellers"
                  className="max-w-[440px] mx-auto bg-white border border-[#E7E5E0] rounded-2xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-[#0E7C5B]" />
                      <h2 className="text-xs font-bold text-[#141413] uppercase tracking-wide">
                        Rising Voices Across Africa
                      </h2>
                    </div>
                    <span className="text-[11px] text-[#5E5D59]">Discover &amp; Follow</span>
                  </div>

                  <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
                    {risingStorytellers.map((creator) => {
                      const isFollowingCreator = followingIds.has(creator.uid);
                      const verified = verifiedBadges[creator.uid];
                      return (
                        <div
                          key={creator.uid}
                          className="w-36 shrink-0 rounded-xl bg-[#FAF9F7] border border-[#E7E5E0] p-2.5 flex flex-col justify-between gap-2"
                        >
                          <button
                            type="button"
                            onClick={() => onViewProfile(creator.uid)}
                            className="flex flex-col items-start gap-1.5 text-left cursor-pointer group"
                          >
                            {creator.avatarUrl ? (
                              <img
                                src={creator.avatarUrl}
                                alt={creator.displayName}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-full object-cover border border-[#E7E5E0]"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-[#141413] text-white text-xs font-bold flex items-center justify-center">
                                {creator.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="w-full min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-[#141413] truncate group-hover:underline">
                                  {creator.displayName}
                                </span>
                                {verified && (
                                  <BadgeCheck className="w-3.5 h-3.5 fill-[#0E7C5B] text-white shrink-0" />
                                )}
                              </div>
                              <p className="text-[11px] text-[#5E5D59] truncate">
                                {creator.location}
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onToggleFollow({
                                uid: creator.uid,
                                displayName: creator.displayName,
                                avatarUrl: creator.avatarUrl,
                                location: creator.location,
                              })
                            }
                            className={`w-full min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                              isFollowingCreator
                                ? 'bg-white border border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
                                : 'bg-[#0E7C5B] text-white hover:bg-[#095E44]'
                            }`}
                          >
                            {isFollowingCreator ? 'Following' : 'Follow'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {videosLoading ? (
                <div className="max-w-[440px] mx-auto aspect-[9/16] max-h-[65dvh] rounded-2xl bg-white border border-[#E7E5E0] flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <Film className="w-8 h-8 text-[#0E7C5B] animate-pulse" />
                  <p className="text-sm font-medium text-[#5E5D59]">Loading African stories...</p>
                </div>
              ) : filteredVideos.length === 0 ? (
                <div className="max-w-[440px] mx-auto rounded-2xl bg-white border border-[#E7E5E0] p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#0E7C5B] flex items-center justify-center mx-auto">
                    <Video className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="font-display text-lg font-bold text-[#141413]">
                      {feedScope === 'saved'
                        ? 'No saved stories yet'
                        : feedScope === 'following'
                          ? 'No stories from creators you follow yet'
                          : searchQuery || selectedRegion !== 'All Africa'
                            ? 'No matching stories found'
                            : 'No African stories uploaded yet in this round'}
                    </h2>
                    <p className="text-sm text-[#5E5D59]">
                      {feedScope === 'saved'
                        ? 'Tap the bookmark icon on any story video to save it here.'
                        : feedScope === 'following'
                          ? 'Explore For You to follow storytellers from across Africa.'
                          : 'Share a 30s–90s video (<15 MB) telling an African story.'}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2.5 flex-wrap">
                    {feedScope !== 'for_you' || selectedRegion !== 'All Africa' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFeedScope('for_you');
                          setSelectedRegion('All Africa');
                          setSearchQuery('');
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold cursor-pointer"
                      >
                        Browse All Africa
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleOpenUpload()}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Upload First Story</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                filteredVideos.map((video) => (
                  <VideoReelCard
                    key={video.id}
                    video={video}
                    rank={rankLookup.get(video.id)}
                    dataSaver={dataSaver}
                    dailyVote={dailyVote}
                    verifiedBadges={verifiedBadges}
                    isFollowing={followingIds.has(video.authorId)}
                    isSubscribedToCreator={subscribedTargetIds.has(video.authorId)}
                    isSaved={savedVideoIds.has(video.id)}
                    onToggleFollow={onToggleFollow}
                    onSubscribeCreator={onSubscribeCreator}
                    onToggleSaved={onToggleSaved}
                    onVote={handleVote}
                    onOpenBoost={onOpenBoost}
                    onViewProfile={onViewProfile}
                    onNotify={onNotify}
                  />
                ))
              )}
            </div>
          ) : (
            /* Full Leaderboard View when Leaderboard nav tab is selected */
            <div className="lg:col-span-7 space-y-5">
              <section
                aria-label="Top 10 African Storytellers"
                className="bg-white border border-[#E7E5E0] rounded-2xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#E7E5E0] pb-3.5">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-[#0E7C5B]" />
                    <h2 className="font-display text-lg font-bold text-[#141413]">
                      {round.label} Top 10 Leaderboard
                    </h2>
                  </div>
                  <span className="text-xs text-[#5E5D59]">Support, Boosts, Votes &amp; Views</span>
                </div>

                {top10Leaderboard.length === 0 ? (
                  <p className="text-sm text-[#5E5D59] py-6 text-center">
                    No stories posted yet in {round.label}.
                  </p>
                ) : (
                  <ol className="space-y-2.5">
                    {top10Leaderboard.map((item, idx) => {
                      const rank = idx + 1;
                      const badgeStyle =
                        rank === 1
                          ? 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]'
                          : rank === 2
                            ? 'bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]'
                            : rank === 3
                              ? 'bg-[#FFEDD5] text-[#9A3412] border-[#FDBA74]'
                              : 'bg-[#FAF9F7] text-[#5E5D59] border-[#E7E5E0]';

                      const tierLabel =
                        rank === 1
                          ? 'Gold'
                          : rank === 2
                            ? 'Silver'
                            : rank === 3
                              ? 'Bronze'
                              : `#${rank}`;

                      const isBoosted = item.boostedUntil > nowMs;

                      return (
                        <li
                          key={item.id}
                          className="p-3 rounded-xl bg-[#FAF9F7] border border-[#E7E5E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-11 h-11 rounded-xl border flex flex-col items-center justify-center shrink-0 font-bold text-[11px] leading-tight ${badgeStyle}`}
                            >
                              {rank <= 3 ? <Medal className="w-3.5 h-3.5" /> : null}
                              <span className="tabular-nums">{tierLabel}</span>
                            </div>

                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt={item.title}
                                className="w-11 h-14 rounded-lg object-cover border border-[#E7E5E0] shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-14 rounded-lg bg-white border border-[#E7E5E0] flex items-center justify-center text-[#0E7C5B] shrink-0">
                                <Film className="w-4 h-4" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onViewProfile(item.authorId)}
                                className="text-left group cursor-pointer"
                              >
                                <p className="text-sm font-bold text-[#141413] truncate group-hover:underline">
                                  {item.title}
                                </p>
                                <p className="text-xs text-[#5E5D59] truncate">
                                  {item.authorName} · {item.authorLocation || 'Africa'}
                                </p>
                              </button>
                              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-[#5E5D59] tabular-nums">
                                <span>{formatCompactCount(item.votesCount)} votes</span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {item.giftsCount} {item.giftsCount === 1 ? 'gift' : 'gifts'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{formatCompactCount(item.viewsCount)} views</span>
                                {isBoosted && (
                                  <span className="inline-flex items-center gap-0.5 text-[#0E7C5B] font-semibold">
                                    <Flame className="w-3 h-3" />
                                    Boosted
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onViewProfile(item.authorId)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white border border-[#E7E5E0] text-xs font-semibold text-[#141413] hover:border-[#0E7C5B] hover:text-[#0E7C5B] shrink-0 cursor-pointer"
                          >
                            View Creator
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          )}

          {/* Right Rail: Round Reward, Countdown, Winner Spotlight, & Compact Top 10 */}
          <aside className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
            {/* Round Reward & Countdown Card (NO "Sponsored by") */}
            <section
              aria-label="Round Reward and Countdown"
              className={`bg-white border border-[#E7E5E0] rounded-2xl p-4 sm:p-5 space-y-4 ${
                isLeaderboardPrimary || mobilePanel === 'rewards' ? 'block' : 'hidden lg:block'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#5E5D59]">
                    {round.label} Storyteller Reward
                  </p>
                  <p className="font-display text-xl sm:text-2xl font-bold text-[#141413]">
                    Round Champion Award
                  </p>
                  <p className="text-xs text-[#5E5D59]">
                    Winner picked from community support &amp; story boosts
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#5E5D59]">
                  <Clock className="w-3.5 h-3.5 text-[#0E7C5B]" />
                  <span>Next Winner Announcement</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Days', value: String(countdown.days).padStart(2, '0') },
                    { label: 'Hours', value: String(countdown.hours).padStart(2, '0') },
                    { label: 'Mins', value: String(countdown.minutes).padStart(2, '0') },
                    { label: 'Secs', value: String(countdown.seconds).padStart(2, '0') },
                  ].map((unit) => (
                    <div
                      key={unit.label}
                      className="bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl py-2 px-1"
                    >
                      <div className="font-display text-lg font-bold text-[#141413] tabular-nums leading-none">
                        {unit.value}
                      </div>
                      <div className="text-[10px] text-[#5E5D59] mt-1 font-medium">
                        {unit.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#E7E5E0] space-y-2 text-xs text-[#5E5D59]">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="w-3.5 h-3.5 text-[#0E7C5B] shrink-0" />
                  <span>
                    {dailyVote
                      ? 'Today’s 1 free daily vote is used. Resets tomorrow.'
                      : 'You have 1 free vote today to support an African story.'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 text-[#141413] font-semibold">
                    <Flame className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                    <span>
                      {streak.count > 0
                        ? `${streak.count}-day supporter streak`
                        : 'Start a daily supporter streak'}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#0E7C5B] font-semibold">
                    {dailyVote ? 'Active today' : 'Vote to keep'}
                  </span>
                </div>
              </div>
            </section>

            {/* Previous Winner Spotlight */}
            <div
              className={
                isLeaderboardPrimary || mobilePanel === 'rewards' ? 'block' : 'hidden lg:block'
              }
            >
              <WinnerSpotlightCard
                config={config}
                roundVideos={roundVideos}
                isAdmin={isAdmin}
                dataSaver={dataSaver}
                onSelectWinner={handleSelectWinner}
              />
            </div>

            {/* Compact Top 10 Rail (only when Stories feed is primary) */}
            {!isLeaderboardPrimary && (
              <section
                aria-label="Top 10 Leaderboard"
                className={`bg-white border border-[#E7E5E0] rounded-2xl p-4 sm:p-5 space-y-3.5 ${
                  mobilePanel === 'leaderboard' ? 'block' : 'hidden lg:block'
                }`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#E7E5E0] pb-3">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-[#0E7C5B]" />
                    <h2 className="font-display text-base font-bold text-[#141413]">
                      Top 10 Storytellers
                    </h2>
                  </div>
                  <span className="text-xs text-[#5E5D59]">Support &amp; Views</span>
                </div>

                {top10Leaderboard.length === 0 ? (
                  <p className="text-xs text-[#5E5D59] py-4 text-center">
                    No stories posted yet in {round.label}.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {top10Leaderboard.map((item, idx) => {
                      const rank = idx + 1;
                      const badgeStyle =
                        rank === 1
                          ? 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]'
                          : rank === 2
                            ? 'bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]'
                            : rank === 3
                              ? 'bg-[#FFEDD5] text-[#9A3412] border-[#FDBA74]'
                              : 'bg-[#FAF9F7] text-[#5E5D59] border-[#E7E5E0]';

                      const tierLabel =
                        rank === 1
                          ? 'Gold'
                          : rank === 2
                            ? 'Silver'
                            : rank === 3
                              ? 'Bronze'
                              : `#${rank}`;

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => jumpToVideo(item.id)}
                            className="w-full min-h-[56px] p-2.5 rounded-xl bg-[#FAF9F7] hover:bg-[#F2F0EC] border border-[#E7E5E0] flex items-center gap-3 text-left transition-colors cursor-pointer"
                          >
                            <div
                              className={`w-10 h-10 rounded-xl border flex flex-col items-center justify-center shrink-0 font-bold text-[11px] leading-tight ${badgeStyle}`}
                            >
                              {rank <= 3 ? <Medal className="w-3.5 h-3.5" /> : null}
                              <span className="tabular-nums">{tierLabel}</span>
                            </div>

                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt={item.title}
                                className="w-10 h-12 rounded-lg object-cover border border-[#E7E5E0] shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-12 rounded-lg bg-white border border-[#E7E5E0] flex items-center justify-center text-[#0E7C5B] shrink-0">
                                <Film className="w-4 h-4" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#141413] truncate">
                                {item.title}
                              </p>
                              <p className="text-xs text-[#5E5D59] truncate">
                                {item.authorName} · {item.authorLocation || 'Africa'}
                              </p>
                            </div>

                            <div className="text-right shrink-0 space-y-0.5">
                              <p className="text-xs font-bold text-[#0E7C5B] tabular-nums">
                                {formatCompactCount(item.votesCount)} votes
                              </p>
                              <p className="text-[11px] text-[#5E5D59] tabular-nums flex items-center justify-end gap-1">
                                <Eye className="w-3 h-3" />
                                {formatCompactCount(item.viewsCount)}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>

      {uploadModalOpen && (
        <VideoUploadModal
          round={round}
          existingEntry={myRoundEntry}
          hasProSubscription={hasProSubscription}
          onOpenSubscriptions={onOpenSubscriptionsPage}
          onClose={() => setUploadModalOpen(false)}
          onUploaded={(created) => {
            setUploadModalOpen(false);
            onNotify(`"${created.title}" is now live across Africa!`);
          }}
        />
      )}
    </div>
  );
}
