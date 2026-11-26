import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Film,
  Flame,
  Search,
  SlidersHorizontal,
  ThumbsUp,
  TrendingUp,
  Trophy,
  Upload,
  Users,
  Video,
  Wifi,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  castDailyVote,
  fetchMyDailyVote,
  saveChallengeConfig,
  subscribeChallengeConfig,
  subscribePublicProfilesList,
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
  type PublicProfile,
  type VerifiedBadgeInfo,
} from '../types';
import {
  computeCreatorSupportScore,
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
  mode?: 'home' | 'following';
  verifiedBadges: Record<string, VerifiedBadgeInfo>;
  followingIds: Set<string>;
  hasCreatorPass: boolean;
  savedVideoIds: Set<string>;
  onToggleFollow: (target: FollowTargetSummary) => void;
  onToggleSaved: (videoId: string) => void;
  onOpenSubscribe: () => void;
  onOpenDashboardLeaderboard: () => void;
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
  mode = 'home',
  verifiedBadges,
  followingIds,
  hasCreatorPass,
  savedVideoIds,
  onToggleFollow,
  onToggleSaved,
  onOpenSubscribe,
  onOpenDashboardLeaderboard,
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
  const [publicProfiles, setPublicProfiles] = useState<PublicProfile[]>([]);

  const [dataSaver, setDataSaver] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DATA_SAVER_STORAGE_KEY) === 'true';
  });

  const [feedScope, setFeedScope] = useState<'for_you' | 'following' | 'saved'>(
    mode === 'following' ? 'following' : 'for_you'
  );
  const [feedSort, setFeedSort] = useState<'trending' | 'latest'>('trending');
  const [selectedRegion, setSelectedRegion] = useState<AfricanRegion>('All Africa');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [streak, setStreak] = useState<SupporterStreakState>(() => readSupporterStreak());
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const isAdmin = Boolean(user?.email === ADMIN_EMAIL);

  useEffect(() => {
    setFeedScope(mode === 'following' ? 'following' : 'for_you');
  }, [mode]);

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
    if (mode !== 'following') return;
    const unsubProfiles = subscribePublicProfilesList(setPublicProfiles, () => {});
    return () => unsubProfiles();
  }, [mode]);

  useEffect(() => {
    if (!user) {
      setDailyVote(null);
      if (mode === 'home' && feedScope !== 'for_you') {
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
  }, [user, feedScope, mode]);

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

  // Following & Saved scopes pull across all rounds so friends' and bookmarked stories stay visible
  const effectiveScope = mode === 'following' ? 'following' : feedScope;
  const baseVideoList = effectiveScope === 'for_you' ? roundVideos : allVideos;

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = baseVideoList.filter((v) => {
      if (effectiveScope === 'following' && !followingIds.has(v.authorId)) {
        return false;
      }
      if (effectiveScope === 'saved' && !savedVideoIds.has(v.id)) {
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
      sorted.sort((a, b) => computeCreatorSupportScore(b) - computeCreatorSupportScore(a));
    } else {
      sorted.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    }
    return sorted;
  }, [baseVideoList, effectiveScope, feedSort, followingIds, savedVideoIds, selectedRegion, searchQuery]);

  const suggestedFriends = useMemo(() => {
    const byUid = new Map<
      string,
      {
        uid: string;
        displayName: string;
        avatarUrl: string;
        location: string;
        score: number;
      }
    >();

    for (const v of allVideos) {
      if (user && v.authorId === user.uid) continue;
      const score = computeCreatorSupportScore(v);
      const prev = byUid.get(v.authorId);
      if (!prev || score > prev.score) {
        byUid.set(v.authorId, {
          uid: v.authorId,
          displayName: v.authorName,
          avatarUrl: v.authorAvatar,
          location: v.authorLocation || 'Africa',
          score,
        });
      }
    }

    for (const p of publicProfiles) {
      if (user && p.uid === user.uid) continue;
      if (!byUid.has(p.uid)) {
        byUid.set(p.uid, {
          uid: p.uid,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          location: p.location || 'Africa',
          score: 0,
        });
      }
    }

    return Array.from(byUid.values())
      .sort((a, b) => {
        const aFollowed = followingIds.has(a.uid) ? 1 : 0;
        const bFollowed = followingIds.has(b.uid) ? 1 : 0;
        if (aFollowed !== bFollowed) return aFollowed - bFollowed;
        return b.score - a.score;
      })
      .slice(0, 12);
  }, [allVideos, publicProfiles, user, followingIds]);

  const top10Leaderboard = useMemo(() => {
    const ranked = [...roundVideos].sort((a, b) => {
      const scoreDiff = computeCreatorSupportScore(b) - computeCreatorSupportScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      if (b.votesCount !== a.votesCount) return b.votesCount - a.votesCount;
      return b.viewsCount - a.viewsCount;
    });
    return ranked.slice(0, 10);
  }, [roundVideos]);

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

  const hasActiveFilter = selectedRegion !== 'All Africa' || searchQuery.trim().length > 0 || feedSort !== 'trending';

  return (
    <div className="min-h-screen bg-[#FAF9F7] text-[#141413]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-24 md:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Primary Column: Clean TikTok-Style Feed */}
          <div className="lg:col-span-7 space-y-4">
            {mode === 'following' ? (
              /* Friendly Following / Friends Header + Discover Creators */
              <div className="max-w-[440px] mx-auto space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h1 className="font-display text-xl sm:text-2xl font-bold text-[#141413]">
                      Following &amp; Friends
                    </h1>
                    <p className="text-xs text-[#5E5D59]">
                      Stories from people you follow across Africa
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleDataSaver}
                    aria-pressed={dataSaver}
                    title="Toggle Data Saver"
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      dataSaver
                        ? 'bg-[#ECFDF5] border-[#0E7C5B] text-[#0E7C5B]'
                        : 'bg-white border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>{dataSaver ? 'Data Saver ON' : 'Data Saver'}</span>
                  </button>
                </div>

                {suggestedFriends.length > 0 && (
                  <section
                    aria-label="Friends and Creators to Follow"
                    className="bg-white border border-[#E7E5E0] rounded-2xl p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#141413] inline-flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#0E7C5B]" />
                        Find Friends &amp; Storytellers
                      </span>
                      <span className="text-[11px] text-[#5E5D59] tabular-nums">
                        {followingIds.size} following
                      </span>
                    </div>

                    <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
                      {suggestedFriends.map((creator) => {
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
                              className={`w-full min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
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
              </div>
            ) : (
              /* Friendly, Uncluttered TikTok-Style Feed Top Bar */
              <div className="max-w-[440px] mx-auto space-y-2.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-5">
                    <button
                      type="button"
                      onClick={() => setFeedScope('for_you')}
                      className={`py-1.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                        feedScope === 'for_you'
                          ? 'border-[#141413] text-[#141413]'
                          : 'border-transparent text-[#5E5D59] hover:text-[#141413]'
                      }`}
                    >
                      For You
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSelectProtectedScope('following')}
                      className={`py-1.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                        feedScope === 'following'
                          ? 'border-[#141413] text-[#141413]'
                          : 'border-transparent text-[#5E5D59] hover:text-[#141413]'
                      }`}
                    >
                      Following
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={toggleDataSaver}
                      aria-pressed={dataSaver}
                      title={dataSaver ? 'Data Saver ON' : 'Data Saver OFF'}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        dataSaver
                          ? 'bg-[#ECFDF5] border-[#0E7C5B] text-[#0E7C5B]'
                          : 'bg-white border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
                      }`}
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{dataSaver ? 'Saver ON' : 'Data Saver'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFilters((p) => !p)}
                      aria-expanded={showFilters}
                      aria-label="Search and filter stories"
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        showFilters || hasActiveFilter
                          ? 'bg-[#141413] border-[#141413] text-white'
                          : 'bg-white border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Filter</span>
                    </button>
                  </div>
                </div>

                {/* Expandable Compact Filter Drawer (Hidden by Default) */}
                {showFilters && (
                  <div className="bg-white border border-[#E7E5E0] rounded-2xl p-3.5 space-y-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-[#5E5D59] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search stories, creators, or cities..."
                        aria-label="Search African stories"
                        className="w-full min-h-[40px] pl-9 pr-8 py-1.5 bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl text-sm text-[#141413] placeholder-[#9E9A93] focus:outline-none focus:border-[#0E7C5B]"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#5E5D59] hover:text-[#141413] cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {AFRICAN_REGIONS.map((region) => {
                        const active = selectedRegion === region;
                        return (
                          <button
                            key={region}
                            type="button"
                            onClick={() => setSelectedRegion(region)}
                            className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              active
                                ? 'bg-[#0E7C5B] text-white'
                                : 'bg-[#FAF9F7] border border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
                            }`}
                          >
                            {region}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#F0EEE9]">
                      <div className="inline-flex items-center gap-1">
                        {[
                          { id: 'trending' as const, label: 'Trending', Icon: TrendingUp },
                          { id: 'latest' as const, label: 'Latest', Icon: Clock },
                        ].map(({ id, label, Icon }) => {
                          const active = feedSort === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setFeedSort(id)}
                              className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
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

                      <button
                        type="button"
                        onClick={() => void handleSelectProtectedScope('saved')}
                        className={`text-xs font-semibold px-2 py-1 rounded-lg cursor-pointer ${
                          feedScope === 'saved'
                            ? 'bg-[#141413] text-white'
                            : 'text-[#0E7C5B] hover:underline'
                        }`}
                      >
                        Saved ({savedVideoIds.size})
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Vertical Video Reel Feed */}
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
                    {effectiveScope === 'saved'
                      ? 'No saved stories yet'
                      : effectiveScope === 'following'
                        ? 'No stories from friends you follow yet'
                        : searchQuery || selectedRegion !== 'All Africa'
                          ? 'No matching stories found'
                          : 'No stories uploaded yet in this round'}
                  </h2>
                  <p className="text-sm text-[#5E5D59]">
                    {effectiveScope === 'saved'
                      ? 'Tap the bookmark icon on any story video to save it here.'
                      : effectiveScope === 'following'
                        ? 'Follow storytellers above or switch to For You to watch African stories.'
                        : 'Share a 30s–90s video under 15 MB telling an African story.'}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2.5 flex-wrap">
                  {effectiveScope !== 'for_you' || selectedRegion !== 'All Africa' || searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFeedScope('for_you');
                        setSelectedRegion('All Africa');
                        setSearchQuery('');
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold cursor-pointer"
                    >
                      Explore For You
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
                  isSaved={savedVideoIds.has(video.id)}
                  onToggleFollow={onToggleFollow}
                  onToggleSaved={onToggleSaved}
                  onVote={handleVote}
                  onViewProfile={onViewProfile}
                  onNotify={onNotify}
                />
              ))
            )}
          </div>

          {/* Calm Desktop Sidebar (Hidden on Mobile so Mobile Feed is Pure TikTok-Style) */}
          <aside className="hidden lg:block lg:col-span-5 space-y-5 lg:sticky lg:top-20">
            <section
              aria-label="Round Countdown and Daily Vote"
              className="bg-white border border-[#E7E5E0] rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#5E5D59]">
                    {round.label} Storyteller Reward
                  </p>
                  <p className="font-display text-xl font-bold text-[#141413]">
                    Round Champion Award
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
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

              <div className="pt-2 border-t border-[#E7E5E0] space-y-2 text-xs text-[#5E5D59]">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="w-3.5 h-3.5 text-[#0E7C5B] shrink-0" />
                  <span>
                    {dailyVote
                      ? 'Today’s 1 free daily vote is used.'
                      : 'You have 1 free vote today to support a story.'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#141413]">
                    <Flame className="w-3.5 h-3.5 text-[#D97706]" />
                    {streak.count > 0 ? `${streak.count}-day supporter streak` : 'Daily supporter streak'}
                  </span>
                  <span className="text-[11px] font-semibold text-[#0E7C5B]">
                    {dailyVote ? 'Active today' : 'Vote to build'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onOpenDashboardLeaderboard}
                  className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-[#E7E5E0] bg-[#FAF9F7] text-xs font-semibold text-[#141413] hover:border-[#0E7C5B] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Award className="w-3.5 h-3.5 text-[#0E7C5B]" />
                  <span>Top 10 Leaderboard</span>
                </button>
                {hasCreatorPass ? (
                  <span className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-semibold text-[#0E7C5B] inline-flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Creator Pass Active</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenSubscribe}
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold hover:bg-[#095E44] cursor-pointer"
                  >
                    Subscribe ($10/mo)
                  </button>
                )}
              </div>
            </section>

            <WinnerSpotlightCard
              config={config}
              roundVideos={roundVideos}
              isAdmin={isAdmin}
              dataSaver={dataSaver}
              onSelectWinner={handleSelectWinner}
            />
          </aside>
        </div>
      </div>

      {uploadModalOpen && (
        <VideoUploadModal
          round={round}
          existingEntry={myRoundEntry}
          hasCreatorPass={hasCreatorPass}
          onOpenSubscribe={onOpenSubscribe}
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
