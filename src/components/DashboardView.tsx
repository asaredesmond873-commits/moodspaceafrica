import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Bookmark,
  CheckCircle2,
  Eye,
  Film,
  Flame,
  Globe2,
  Heart,
  Lock,
  LogOut,
  MapPin,
  Medal,
  ShieldCheck,
  ThumbsUp,
  Trash2,
  Trophy,
  Upload,
  UserCheck,
  Video,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  deleteChallengeVideo,
  saveChallengeConfig,
  subscribeChallengeConfig,
} from '../services/challengeService';
import {
  reviewVerificationRequest,
  submitVerificationRequest,
  subscribeAllVerificationRequests,
  subscribeMyVerificationRequest,
  updateUserProfile,
} from '../services/firestoreService';
import {
  ADMIN_EMAIL,
  AFRICAN_CITIES,
  AFRICAN_REGIONS,
  CHALLENGE_LIMITS,
  CURRENCY_SYMBOLS,
  type AccountType,
  type ChallengeConfig,
  type ChallengeVideo,
  type CreatorSubscription,
  type ProfileViewRecord,
  type VerificationCategory,
  type VerificationIdType,
  type VerificationRequest,
} from '../types';
import {
  computeCreatorSupportScore,
  formatCompactCount,
  formatDurationSeconds,
  formatLocalCurrencyPrice,
  getAfricanRegionFromLocation,
  getCurrentChallengeRound,
} from '../utils/challengeMedia';
import { compressImageFile, formatFullDate, formatTimestamp } from '../utils/media';
import { readSupporterStreak } from '../utils/streak';
import { WinnerSpotlightCard } from './WinnerSpotlightCard';

export type DashboardTab =
  | 'overview'
  | 'stories'
  | 'leaderboard'
  | 'saved'
  | 'membership'
  | 'verification'
  | 'winner_admin'
  | 'profile';

interface DashboardViewProps {
  allVideos: ChallengeVideo[];
  roundVideos: ChallengeVideo[];
  savedVideoIds: Set<string>;
  activePass: CreatorSubscription | null;
  hasCreatorPass: boolean;
  profileViewers: ProfileViewRecord[];
  followingCount: number;
  initialTab?: DashboardTab;
  tabNonce?: number;
  onUploadStory: () => void;
  onToggleSaved: (videoId: string) => void;
  onOpenSubscribe: () => void;
  onCancelPass: () => Promise<void>;
  onJumpToStory: (videoId: string) => void;
  onViewProfile: (uid: string) => void;
  onNotify: (message: string) => void;
}

const DEFAULT_CONFIG: ChallengeConfig = {
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

export function DashboardView({
  allVideos,
  roundVideos,
  savedVideoIds,
  activePass,
  hasCreatorPass,
  profileViewers,
  followingCount,
  initialTab = 'overview',
  tabNonce = 0,
  onUploadStory,
  onToggleSaved,
  onOpenSubscribe,
  onCancelPass,
  onJumpToStory,
  onViewProfile,
  onNotify,
}: DashboardViewProps) {
  const { user, profile, authReady, authBusy, signInWithGoogle, logout, setLocalProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [challengeConfig, setChallengeConfig] = useState<ChallengeConfig>(DEFAULT_CONFIG);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [crowningVideoId, setCrowningVideoId] = useState<string | null>(null);
  const [cancellingPass, setCancellingPass] = useState(false);

  // Profile & Region state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('Lagos, Nigeria');
  const [accountType, setAccountType] = useState<AccountType>('creator');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Verification state
  const [myVerification, setMyVerification] = useState<VerificationRequest | null>(null);
  const [allVerifications, setAllVerifications] = useState<VerificationRequest[]>([]);
  const [legalOrBrandName, setLegalOrBrandName] = useState('');
  const [verCategory, setVerCategory] = useState<VerificationCategory>('creator');
  const [idType, setIdType] = useState<VerificationIdType>('ghana_card');
  const [idReference, setIdReference] = useState('');
  const [proofLink, setProofLink] = useState('');
  const [proofImageUrl, setProofImageUrl] = useState('');
  const [proposedLabel, setProposedLabel] = useState('Verified Storyteller');
  const [verNote, setVerNote] = useState('');
  const [verSubmitting, setVerSubmitting] = useState(false);
  const [reviewingUid, setReviewingUid] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [adminLabels, setAdminLabels] = useState<Record<string, string>>({});

  const isAdmin = Boolean(user?.email === ADMIN_EMAIL);
  const round = useMemo(() => getCurrentChallengeRound(), []);

  useEffect(() => {
    if (tabNonce > 0) {
      setActiveTab(initialTab);
    }
  }, [tabNonce, initialTab]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setBio(profile.bio || '');
    setLocation(profile.location || 'Lagos, Nigeria');
    setAccountType(profile.accountType || 'creator');
    setAvatarUrl(profile.avatarUrl || '');
  }, [profile]);

  useEffect(() => {
    if (!user) {
      setMyVerification(null);
      setAllVerifications([]);
      return;
    }

    const unsubConfig = subscribeChallengeConfig(setChallengeConfig);
    const unsubVer = subscribeMyVerificationRequest(
      user.uid,
      (req) => {
        setMyVerification(req);
        if (req) {
          setLegalOrBrandName(req.legalOrBrandName);
          setVerCategory(req.category);
          setIdType(req.idType);
          setIdReference(req.idReference);
          setProofLink(req.proofLink);
          setProofImageUrl(req.proofImageUrl);
          setProposedLabel(req.proposedLabel || 'Verified Storyteller');
          setVerNote(req.note);
        }
      },
      () => {}
    );

    let unsubAllVer: (() => void) | null = null;
    if (user.email === ADMIN_EMAIL) {
      unsubAllVer = subscribeAllVerificationRequests(setAllVerifications, () => {});
    }

    return () => {
      unsubConfig();
      unsubVer();
      if (unsubAllVer) unsubAllVer();
    };
  }, [user]);

  const myStories = useMemo(
    () => (user ? allVideos.filter((v) => v.authorId === user.uid) : []),
    [allVideos, user]
  );

  const savedStories = useMemo(
    () => allVideos.filter((v) => savedVideoIds.has(v.id)),
    [allVideos, savedVideoIds]
  );

  const myStats = useMemo(() => {
    return myStories.reduce(
      (acc, v) => {
        acc.views += v.viewsCount;
        acc.likes += v.likesCount;
        acc.comments += v.commentsCount;
        acc.shares += v.sharesCount;
        acc.votes += v.votesCount;
        return acc;
      },
      { views: 0, likes: 0, comments: 0, shares: 0, votes: 0 }
    );
  }, [myStories]);

  const supporterStreak = useMemo(() => readSupporterStreak(), []);

  const regionalReach = useMemo(() => {
    const regions = AFRICAN_REGIONS.filter((r) => r !== 'All Africa');
    const counts = new Map<string, number>();
    regions.forEach((r) => counts.set(r, 0));
    allVideos.forEach((v) => {
      const reg = getAfricanRegionFromLocation(v.authorLocation);
      counts.set(reg, (counts.get(reg) ?? 0) + 1);
    });
    const total = Math.max(1, allVideos.length);
    return regions.map((region) => {
      const count = counts.get(region) ?? 0;
      const pct = Math.round((count / total) * 100);
      return { region, count, pct };
    });
  }, [allVideos]);

  const adminSortedRoundStories = useMemo(() => {
    return [...roundVideos].sort(
      (a, b) => computeCreatorSupportScore(b) - computeCreatorSupportScore(a)
    );
  }, [roundVideos]);

  const top10Leaderboard = useMemo(
    () => adminSortedRoundStories.slice(0, 10),
    [adminSortedRoundStories]
  );

  const handleDeleteStory = async (videoId: string) => {
    setDeletingVideoId(videoId);
    try {
      await deleteChallengeVideo(videoId);
      onNotify('Story deleted.');
    } catch {
      onNotify('Could not delete story.');
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleCrownWinner = async (video: ChallengeVideo) => {
    if (!isAdmin) return;
    setCrowningVideoId(video.id);
    try {
      await saveChallengeConfig({
        sponsorName: challengeConfig.sponsorName || 'Community',
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
      onNotify('Could not save winner selection.');
    } finally {
      setCrowningVideoId(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !user) return;
    setProfileSaving(true);
    try {
      await updateUserProfile(user.uid, {
        displayName: displayName.trim() || profile.displayName,
        bio: bio.trim(),
        location: location.trim() || 'Africa',
        accountType,
        avatarUrl,
      });
      setLocalProfile({
        ...profile,
        displayName: displayName.trim() || profile.displayName,
        bio: bio.trim(),
        location: location.trim() || 'Africa',
        accountType,
        avatarUrl,
      });
      onNotify('Profile & African region saved.');
    } catch {
      onNotify('Could not save profile changes.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 480, 140000);
      setAvatarUrl(compressed);
      onNotify('Avatar image ready. Click Save Profile to publish.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not process image.');
    }
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 1000, 420000);
      setProofImageUrl(compressed);
      onNotify('Verification document attached.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not process document image.');
    }
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!legalOrBrandName.trim() || !idReference.trim()) {
      onNotify('Enter your full name / studio name and ID reference.');
      return;
    }
    setVerSubmitting(true);
    try {
      await submitVerificationRequest(profile, {
        legalOrBrandName,
        category: verCategory,
        idType,
        idReference,
        proofLink,
        proofImageUrl,
        note: verNote,
        proposedLabel: proposedLabel.trim() || 'Verified Storyteller',
      });
      onNotify('Verification application submitted for review.');
    } catch {
      onNotify('Could not submit verification request.');
    } finally {
      setVerSubmitting(false);
    }
  };

  const handleAdminDecision = async (req: VerificationRequest, decision: 'approved' | 'rejected') => {
    if (!user?.email) return;
    setReviewingUid(req.uid);
    try {
      await reviewVerificationRequest(
        req.uid,
        user.email,
        decision,
        adminLabels[req.uid] || req.proposedLabel || 'Verified Storyteller',
        adminNotes[req.uid] || ''
      );
      onNotify(`Verification ${decision} for ${req.requesterName}.`);
    } catch {
      onNotify('Could not update verification decision.');
    } finally {
      setReviewingUid(null);
    }
  };

  if (!authReady) {
    return (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center text-sm text-[#5E5D59]">
        Loading Creator Studio...
      </main>
    );
  }

  if (!user || !profile) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#0E7C5B] flex items-center justify-center mx-auto">
            <Video className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#141413]">
            Sign in to your Creator Studio
          </h1>
          <p className="text-sm text-[#5E5D59]">
            Watch African video stories, track votes and leaderboard standings, manage your $10/month Creator Pass, and see who viewed your profile.
          </p>
          <button
            type="button"
            disabled={authBusy}
            onClick={() => void signInWithGoogle()}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold hover:bg-[#095E44] disabled:opacity-60 cursor-pointer"
          >
            {authBusy ? 'Signing In...' : 'Sign In with Google'}
          </button>
        </div>
      </main>
    );
  }

  const tabs: { id: DashboardTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'stories', label: 'My Stories', count: myStories.length },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'saved', label: 'Saved', count: savedStories.length },
    {
      id: 'membership',
      label: 'Creator Pass & Views',
      count: hasCreatorPass ? profileViewers.length : undefined,
    },
    { id: 'verification', label: 'Verification' },
    ...(isAdmin
      ? [{ id: 'winner_admin' as const, label: 'Winner & Approvals', count: roundVideos.length }]
      : []),
    { id: 'profile', label: 'Profile & Region' },
  ];

  const myRegion = getAfricanRegionFromLocation(profile.location);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-16 space-y-6">
      {/* Studio Top Bar */}
      <header className="bg-white border border-[#E7E5E0] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover border border-[#E7E5E0] shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#141413] text-white font-bold flex items-center justify-center shrink-0">
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="font-display text-lg sm:text-xl font-bold text-[#141413] truncate">
                {profile.displayName}
              </h1>
              {profile.badgeVerified && (
                <BadgeCheck className="w-4 h-4 fill-[#0E7C5B] text-white shrink-0" />
              )}
              {hasCreatorPass && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#0E7C5B] text-[11px] font-semibold">
                  Creator Pass Active
                </span>
              )}
            </div>
            <p className="text-xs text-[#5E5D59] flex items-center gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-[#0E7C5B] shrink-0" />
              <span>{profile.location || myRegion}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onViewProfile(profile.uid)}
                className="text-[#0E7C5B] font-semibold hover:underline cursor-pointer"
              >
                Public Profile
              </button>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={onUploadStory}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#095E44] cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Story</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[#E7E5E0] bg-[#FAF9F7] text-xs font-semibold text-[#5E5D59] hover:text-[#141413] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Studio Tab Strip */}
      <nav
        aria-label="Dashboard sections"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#141413] text-white'
                  : 'bg-white border border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="font-mono text-[11px] opacity-80">{tab.count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E7E5E0] rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-[#5E5D59]">
                <span>Story Views</span>
                <Eye className="w-4 h-4 text-[#0E7C5B]" />
              </div>
              <p className="font-display text-2xl font-bold text-[#141413] tabular-nums">
                {formatCompactCount(myStats.views)}
              </p>
              <p className="text-[11px] text-[#5E5D59]">
                Across {myStories.length} uploaded {myStories.length === 1 ? 'story' : 'stories'}
              </p>
            </div>

            <div className="bg-white border border-[#E7E5E0] rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-[#5E5D59]">
                <span>Community Votes</span>
                <ThumbsUp className="w-4 h-4 text-[#0E7C5B]" />
              </div>
              <p className="font-display text-2xl font-bold text-[#141413] tabular-nums">
                {formatCompactCount(myStats.votes)}
              </p>
              <p className="text-[11px] text-[#5E5D59]">
                Daily supporter votes received
              </p>
            </div>

            <div className="bg-white border border-[#E7E5E0] rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-[#5E5D59]">
                <span>Engagement</span>
                <Heart className="w-4 h-4 text-[#EF4444]" />
              </div>
              <p className="font-display text-2xl font-bold text-[#141413] tabular-nums">
                {formatCompactCount(myStats.likes + myStats.comments + myStats.shares)}
              </p>
              <p className="text-[11px] text-[#5E5D59]">
                {myStats.likes} likes · {myStats.comments} comments · {myStats.shares} shares
              </p>
            </div>

            <div className="bg-white border border-[#E7E5E0] rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-[#5E5D59]">
                <span>Profile Views</span>
                <UserCheck className="w-4 h-4 text-[#0E7C5B]" />
              </div>
              {hasCreatorPass ? (
                <>
                  <p className="font-display text-2xl font-bold text-[#0E7C5B] tabular-nums">
                    {profileViewers.length}
                  </p>
                  <p className="text-[11px] text-[#5E5D59]">
                    {followingCount} following ·{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('membership')}
                      className="text-[#0E7C5B] font-semibold hover:underline cursor-pointer"
                    >
                      See viewers
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-bold text-[#141413] flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-[#5E5D59]" />
                    <span>Creator Pass</span>
                  </p>
                  <p className="text-[11px] text-[#5E5D59]">
                    <button
                      type="button"
                      onClick={onOpenSubscribe}
                      className="text-[#0E7C5B] font-semibold hover:underline cursor-pointer"
                    >
                      Subscribe
                    </button>{' '}
                    to see who viewed
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Pan-African Regional Reach & Supporter Streak */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="lg:col-span-2 bg-white border border-[#E7E5E0] rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-[#0E7C5B]" />
                  <h2 className="font-display text-sm font-bold text-[#141413]">
                    Continental Story Reach Across Africa
                  </h2>
                </div>
                <span className="text-[11px] text-[#5E5D59] tabular-nums">
                  {allVideos.length} live {allVideos.length === 1 ? 'story' : 'stories'}
                </span>
              </div>

              <div className="space-y-2.5">
                {regionalReach.map((item) => (
                  <div key={item.region} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#141413]">{item.region}</span>
                      <span className="text-[#5E5D59] tabular-nums">
                        {item.count} {item.count === 1 ? 'story' : 'stories'} ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F0EEE9] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0E7C5B] transition-all"
                        style={{ width: `${Math.max(item.pct, item.count > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-[#E7E5E0] rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[#D97706]" />
                  <h2 className="font-display text-sm font-bold text-[#141413]">
                    Daily Supporter Streak
                  </h2>
                </div>
                <p className="font-display text-3xl font-bold text-[#141413] tabular-nums">
                  {supporterStreak.count} {supporterStreak.count === 1 ? 'day' : 'days'}
                </p>
                <p className="text-xs text-[#5E5D59] leading-relaxed">
                  Use your free daily vote on Stories each day to build your supporter streak and help pick each round’s champion.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('membership')}
                  className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-[#E7E5E0] bg-[#FAF9F7] text-xs font-semibold text-[#141413] hover:border-[#0E7C5B] cursor-pointer"
                >
                  Creator Pass
                </button>
                <button
                  type="button"
                  onClick={onUploadStory}
                  className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold hover:bg-[#095E44] cursor-pointer"
                >
                  Post Story
                </button>
              </div>
            </section>
          </div>

          {/* Story Performance Table */}
          <section className="bg-white border border-[#E7E5E0] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E7E5E0] flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-[#141413]">
                  Your Story Performance
                </h2>
                <p className="text-xs text-[#5E5D59]">
                  Votes, views, likes, comments, and shares count toward round winner selection.
                </p>
              </div>
              <button
                type="button"
                onClick={onUploadStory}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold hover:bg-[#095E44] cursor-pointer"
              >
                Upload Story
              </button>
            </div>

            {myStories.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Video className="w-8 h-8 text-[#0E7C5B] mx-auto" />
                <p className="text-sm font-semibold text-[#141413]">No video stories uploaded yet</p>
                <p className="text-xs text-[#5E5D59]">
                  {hasCreatorPass
                    ? 'Upload a 30s–90s video under 15 MB to enter the prize round.'
                    : 'Subscribe to the Creator Pass in your Profile to upload a video and enter the prize round.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F7] border-b border-[#E7E5E0] text-[#5E5D59]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Story</th>
                      <th className="py-3 px-3 font-semibold">Views</th>
                      <th className="py-3 px-3 font-semibold">Likes / Cmts / Shares</th>
                      <th className="py-3 px-3 font-semibold">Votes</th>
                      <th className="py-3 px-3 font-semibold">Score</th>
                      <th className="py-3 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EEE9]">
                    {myStories.map((story) => (
                      <tr key={story.id} className="hover:bg-[#FAF9F7]">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3 min-w-[200px]">
                            {story.thumbnailUrl ? (
                              <img
                                src={story.thumbnailUrl}
                                alt={story.title}
                                className="w-10 h-12 rounded-lg object-cover border border-[#E7E5E0] shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-12 rounded-lg bg-[#FAF9F7] border border-[#E7E5E0] flex items-center justify-center shrink-0">
                                <Film className="w-4 h-4 text-[#0E7C5B]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-[#141413] truncate max-w-[220px]">
                                {story.title}
                              </p>
                              <p className="text-[11px] text-[#5E5D59]">
                                {story.roundId.replace('_', ' ')} ·{' '}
                                {formatDurationSeconds(story.durationSeconds)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold tabular-nums text-[#141413]">
                          {formatCompactCount(story.viewsCount)}
                        </td>
                        <td className="py-3 px-3 tabular-nums text-[#5E5D59]">
                          {story.likesCount} / {story.commentsCount} / {story.sharesCount}
                        </td>
                        <td className="py-3 px-3 tabular-nums font-semibold text-[#0E7C5B]">
                          {story.votesCount} votes
                        </td>
                        <td className="py-3 px-3 tabular-nums font-mono text-[#141413]">
                          {computeCreatorSupportScore(story)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onJumpToStory(story.id)}
                            className="min-h-[34px] px-3 py-1 rounded-lg border border-[#E7E5E0] bg-white hover:border-[#0E7C5B] hover:text-[#0E7C5B] font-semibold cursor-pointer whitespace-nowrap"
                          >
                            View in Feed
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB: MY STORIES */}
      {activeTab === 'stories' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[#141413]">
              My Uploaded Video Stories ({myStories.length})
            </h2>
            <button
              type="button"
              onClick={onUploadStory}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Story</span>
            </button>
          </div>

          {myStories.length === 0 ? (
            <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center space-y-3">
              <Video className="w-8 h-8 text-[#0E7C5B] mx-auto" />
              <p className="text-sm font-semibold text-[#141413]">
                You haven’t posted a story video yet
              </p>
              <button
                type="button"
                onClick={onUploadStory}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold cursor-pointer"
              >
                Upload First African Story
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myStories.map((story) => (
                <article
                  key={story.id}
                  className="bg-white border border-[#E7E5E0] rounded-2xl p-4 flex gap-4"
                >
                  <div className="w-24 aspect-[9/14] rounded-xl overflow-hidden bg-[#111827] shrink-0 flex items-center justify-center">
                    {story.thumbnailUrl ? (
                      <img
                        src={story.thumbnailUrl}
                        alt={story.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-6 h-6 text-white/60" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-sm font-bold text-[#141413] line-clamp-2">
                          {story.title}
                        </h3>
                        <button
                          type="button"
                          disabled={deletingVideoId === story.id}
                          onClick={() => void handleDeleteStory(story.id)}
                          aria-label="Delete story"
                          className="p-1.5 text-[#5E5D59] hover:text-[#B91C1C] cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-[11px] text-[#5E5D59]">
                        {story.roundId.replace('_', ' ')} · {formatTimestamp(story.createdAt)}
                      </p>
                      <div className="flex flex-wrap gap-3 pt-1 text-xs text-[#3F3E3B] tabular-nums">
                        <span>{formatCompactCount(story.viewsCount)} views</span>
                        <span>{story.votesCount} votes</span>
                        <span className="text-[#0E7C5B] font-semibold">
                          {story.likesCount} likes
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onJumpToStory(story.id)}
                        className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold cursor-pointer"
                      >
                        View in Feed
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB: SAVED STORIES */}
      {activeTab === 'saved' && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-bold text-[#141413]">
            Saved African Stories ({savedStories.length})
          </h2>
          {savedStories.length === 0 ? (
            <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center space-y-2">
              <Bookmark className="w-7 h-7 text-[#0E7C5B] mx-auto" />
              <p className="text-sm font-semibold text-[#141413]">No saved stories yet</p>
              <p className="text-xs text-[#5E5D59]">
                Tap the bookmark icon on any story video in the feed to save it here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedStories.map((story) => (
                <article
                  key={story.id}
                  className="bg-white border border-[#E7E5E0] rounded-2xl overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-[16/10] bg-[#111827] flex items-center justify-center">
                    {story.thumbnailUrl ? (
                      <img
                        src={story.thumbnailUrl}
                        alt={story.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-7 h-7 text-white/60" />
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <h3 className="font-display text-sm font-bold text-[#141413] line-clamp-2">
                        {story.title}
                      </h3>
                      <p className="text-xs text-[#5E5D59] mt-0.5">
                        {story.authorName} · {story.authorLocation || 'Africa'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-[#F0EEE9]">
                      <button
                        type="button"
                        onClick={() => onJumpToStory(story.id)}
                        className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold cursor-pointer"
                      >
                        Watch Story
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleSaved(story.id)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#E7E5E0] bg-[#FAF9F7] text-xs font-semibold text-[#5E5D59] hover:text-[#B91C1C] cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB: CREATOR PASS & PROFILE VIEWS */}
      {activeTab === 'membership' && (
        <div className="space-y-6">
          <section className="bg-white border border-[#E7E5E0] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-5 h-5 text-[#0E7C5B]" />
                <h2 className="font-display text-base font-bold text-[#141413]">
                  MoodSpace Creator Pass · $10 / month
                </h2>
              </div>
              {hasCreatorPass && activePass ? (
                <div className="space-y-1 text-xs text-[#5E5D59]">
                  <p className="text-[#0E7C5B] font-semibold">
                    Active via Paystack ·{' '}
                    {formatLocalCurrencyPrice(
                      activePass.localAmount,
                      CURRENCY_SYMBOLS[activePass.currency],
                      activePass.currency
                    )}{' '}
                    ({activePass.currency}) · {activePass.country}
                  </p>
                  <p>
                    Valid until {new Date(activePass.expiresAt).toLocaleDateString()} · Ref:{' '}
                    <span className="font-mono">{activePass.paystackReference}</span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#5E5D59]">
                  Powered by Paystack across Africa (auto-converts to GHS, NGN, KES, ZAR, or USD). Unlock posting videos to win round prizes, a Verified Creator badge, and seeing who viewed your profile.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {hasCreatorPass ? (
                <button
                  type="button"
                  disabled={cancellingPass}
                  onClick={() => {
                    setCancellingPass(true);
                    void onCancelPass().finally(() => setCancellingPass(false));
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-[#FECACA] bg-white text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-60 cursor-pointer"
                >
                  {cancellingPass ? 'Cancelling...' : 'Cancel Membership'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenSubscribe}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold hover:bg-[#095E44] cursor-pointer"
                >
                  Subscribe
                </button>
              )}
            </div>
          </section>

          <section className="bg-white border border-[#E7E5E0] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#141413]">
                  Who Viewed Your Profile{hasCreatorPass ? ` (${profileViewers.length})` : ''}
                </h3>
                <p className="text-xs text-[#5E5D59]">
                  See storytellers and viewers across Africa who visited your profile
                </p>
              </div>
              <Eye className="w-5 h-5 text-[#0E7C5B]" />
            </div>

            {!hasCreatorPass ? (
              <div className="py-8 text-center space-y-3">
                <Lock className="w-7 h-7 text-[#5E5D59] mx-auto" />
                <p className="text-xs text-[#5E5D59] max-w-sm mx-auto">
                  Subscribe to the $10/month Creator Pass to see everyone who viewed your profile, enter story rounds to win prizes, and carry a Verified Creator badge.
                </p>
                <button
                  type="button"
                  onClick={onOpenSubscribe}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold hover:bg-[#095E44] cursor-pointer"
                >
                  Subscribe
                </button>
              </div>
            ) : profileViewers.length === 0 ? (
              <p className="text-xs text-[#5E5D59] py-6 text-center">
                No profile visits recorded yet. Post a story video so viewers across Africa discover you!
              </p>
            ) : (
              <ul className="divide-y divide-[#F0EEE9]">
                {profileViewers.map((viewer) => (
                  <li
                    key={viewer.viewerId}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => onViewProfile(viewer.viewerId)}
                      className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
                    >
                      {viewer.viewerAvatar ? (
                        <img
                          src={viewer.viewerAvatar}
                          alt={viewer.viewerName}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover border border-[#E7E5E0] shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#141413] text-white font-bold flex items-center justify-center shrink-0">
                          {viewer.viewerName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-[#141413] group-hover:text-[#0E7C5B] truncate">
                          {viewer.viewerName}
                        </p>
                        <p className="text-[11px] text-[#5E5D59] truncate">
                          {viewer.viewerLocation || 'Africa'} · Viewed {formatTimestamp(viewer.viewedAt)}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onViewProfile(viewer.viewerId)}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-[#E7E5E0] bg-[#FAF9F7] text-xs font-semibold text-[#141413] hover:border-[#0E7C5B] shrink-0 cursor-pointer"
                    >
                      View Profile
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* TAB: VERIFICATION */}
      {activeTab === 'verification' && (
        <section className="bg-white border border-[#E7E5E0] rounded-2xl p-5 sm:p-6 space-y-5 max-w-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#141413]">
                Creator Verification Across Africa
              </h2>
              <p className="text-xs text-[#5E5D59]">
                Earn a verified badge on your African stories and public storyteller profile.
              </p>
            </div>
            <ShieldCheck className="w-6 h-6 text-[#0E7C5B] shrink-0" />
          </div>

          {myVerification && (
            <div className="bg-[#FAF9F7] border border-[#E7E5E0] rounded-xl p-4 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#141413]">Current Application Status</span>
                <span
                  className={`px-2 py-0.5 rounded font-semibold uppercase ${
                    myVerification.status === 'approved'
                      ? 'bg-[#ECFDF5] text-[#0E7C5B]'
                      : myVerification.status === 'rejected'
                        ? 'bg-[#FEF2F2] text-[#B91C1C]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                  }`}
                >
                  {myVerification.status}
                </span>
              </div>
              {myVerification.reviewNote && (
                <p className="text-[#5E5D59]">Review note: {myVerification.reviewNote}</p>
              )}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmitVerification(e)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#141413]">
                  Legal Name or Studio Name
                </label>
                <input
                  type="text"
                  value={legalOrBrandName}
                  onChange={(e) => setLegalOrBrandName(e.target.value)}
                  placeholder="Full name or collective"
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#141413]">
                  Storyteller Category
                </label>
                <select
                  value={verCategory}
                  onChange={(e) => setVerCategory(e.target.value as VerificationCategory)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                >
                  <option value="creator">Independent Storyteller</option>
                  <option value="media">Media / Film Studio</option>
                  <option value="organizer">Cultural Collective</option>
                  <option value="business">Creative Brand</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#141413]">
                  Verification Document Type
                </label>
                <select
                  value={idType}
                  onChange={(e) => setIdType(e.target.value as VerificationIdType)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                >
                  <option value="ghana_card">National ID / Passport</option>
                  <option value="social_handle">Verified Social Channel</option>
                  <option value="business_reg">Studio Registration</option>
                  <option value="website_press">Press / Portfolio Site</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#141413]">
                  ID / Handle Reference
                </label>
                <input
                  type="text"
                  value={idReference}
                  onChange={(e) => setIdReference(e.target.value)}
                  placeholder="e.g. @handle or ID last 4 digits"
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#141413]">
                  Badge Label
                </label>
                <input
                  type="text"
                  value={proposedLabel}
                  onChange={(e) => setProposedLabel(e.target.value)}
                  placeholder="Verified Storyteller"
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#141413]">
                  Proof Link (Optional)
                </label>
                <input
                  type="url"
                  value={proofLink}
                  onChange={(e) => setProofLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#141413]">
                Supporting Image (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleProofUpload(e)}
                className="text-xs text-[#5E5D59]"
              />
            </div>

            <button
              type="submit"
              disabled={verSubmitting}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold hover:bg-[#095E44] disabled:opacity-50 cursor-pointer"
            >
              {verSubmitting ? 'Submitting...' : 'Submit Verification Request'}
            </button>
          </form>
        </section>
      )}

      {/* TAB: LEADERBOARD & WINNER SPOTLIGHT */}
      {activeTab === 'leaderboard' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 bg-white border border-[#E7E5E0] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#E7E5E0] pb-3.5">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#0E7C5B]" />
                <h2 className="font-display text-lg font-bold text-[#141413]">
                  {round.label} Top 10 Leaderboard
                </h2>
              </div>
              <span className="text-xs text-[#5E5D59]">Votes &amp; Views</span>
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
                    rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : rank === 3 ? 'Bronze' : `#${rank}`;

                  return (
                    <li
                      key={item.id}
                      className="p-3 rounded-xl bg-[#FAF9F7] border border-[#E7E5E0] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl border flex flex-col items-center justify-center shrink-0 font-bold text-[11px] leading-tight ${badgeStyle}`}
                        >
                          {rank <= 3 ? <Medal className="w-3.5 h-3.5" /> : null}
                          <span className="tabular-nums">{tierLabel}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJumpToStory(item.id)}
                          className="text-left min-w-0 group cursor-pointer"
                        >
                          <p className="text-sm font-bold text-[#141413] truncate group-hover:underline">
                            {item.title}
                          </p>
                          <p className="text-xs text-[#5E5D59] truncate">
                            {item.authorName} · {item.authorLocation || 'Africa'}
                          </p>
                          <p className="text-[11px] text-[#5E5D59] tabular-nums mt-0.5">
                            {formatCompactCount(item.votesCount)} votes ·{' '}
                            {formatCompactCount(item.viewsCount)} views ·{' '}
                            {formatCompactCount(item.likesCount)} likes
                          </p>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onViewProfile(item.authorId)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-[#E7E5E0] text-xs font-semibold text-[#141413] hover:border-[#0E7C5B] shrink-0 cursor-pointer"
                      >
                        Profile
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <div className="lg:col-span-5">
            <WinnerSpotlightCard
              config={challengeConfig}
              roundVideos={roundVideos}
              isAdmin={isAdmin}
              dataSaver={false}
              onSelectWinner={handleCrownWinner}
            />
          </div>
        </div>
      )}

      {/* TAB: ADMIN WINNER PICKER & APPROVALS */}
      {activeTab === 'winner_admin' && isAdmin && (
        <div className="space-y-6">
          <section className="bg-white border border-[#E7E5E0] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E7E5E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#D97706]" />
                  <h2 className="font-display text-base font-bold text-[#141413]">
                    {round.label} Winner Selection (Votes &amp; Engagement Rankings)
                  </h2>
                </div>
                <p className="text-xs text-[#5E5D59] mt-0.5">
                  Current winner spotlight: {challengeConfig.winnerName} ({challengeConfig.winnerRoundLabel})
                </p>
              </div>
              <span className="text-xs font-semibold text-[#0E7C5B] bg-[#ECFDF5] border border-[#A7F3D0] px-3 py-1.5 rounded-lg">
                Round Champion Pick
              </span>
            </div>

            {adminSortedRoundStories.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#5E5D59]">
                No video stories uploaded yet in {round.label}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F7] border-b border-[#E7E5E0] text-[#5E5D59]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Rank &amp; Storyteller</th>
                      <th className="py-3 px-3 font-semibold">Votes</th>
                      <th className="py-3 px-3 font-semibold">Views / Likes / Cmts / Shares</th>
                      <th className="py-3 px-3 font-semibold">Score</th>
                      <th className="py-3 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EEE9]">
                    {adminSortedRoundStories.map((v, idx) => {
                      const isWinner = challengeConfig.winnerVideoId === v.id;
                      const score = computeCreatorSupportScore(v);
                      return (
                        <tr key={v.id} className="hover:bg-[#FAF9F7]">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5 min-w-[200px]">
                              <span className="font-mono font-bold text-[#0E7C5B] w-6">
                                #{idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-[#141413] truncate max-w-[200px]">
                                  {v.title}
                                </p>
                                <p className="text-[11px] text-[#5E5D59] truncate">
                                  {v.authorName} · {v.authorLocation || 'Africa'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-semibold tabular-nums text-[#0E7C5B]">
                            {v.votesCount} votes
                          </td>
                          <td className="py-3 px-3 tabular-nums text-[#5E5D59]">
                            {v.viewsCount} / {v.likesCount} / {v.commentsCount} / {v.sharesCount}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[#141413] tabular-nums">
                            {score}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              disabled={crowningVideoId === v.id || isWinner}
                              onClick={() => void handleCrownWinner(v)}
                              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                                isWinner
                                  ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] cursor-default'
                                  : 'bg-[#0E7C5B] text-white hover:bg-[#095E44]'
                              }`}
                            >
                              {isWinner
                                ? 'Crowned Winner'
                                : crowningVideoId === v.id
                                  ? 'Saving...'
                                  : 'Crown Winner'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Creator Verification Approvals Queue */}
          <section className="bg-white border border-[#E7E5E0] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#E7E5E0] pb-3">
              <Award className="w-5 h-5 text-[#0E7C5B]" />
              <h2 className="font-display text-base font-bold text-[#141413]">
                Verification Queue ({allVerifications.length})
              </h2>
            </div>

            {allVerifications.length === 0 ? (
              <p className="text-xs text-[#5E5D59] py-4 text-center">
                No creator verification requests yet.
              </p>
            ) : (
              <div className="space-y-3">
                {allVerifications.map((req) => (
                  <div
                    key={req.uid}
                    className="border border-[#E7E5E0] rounded-xl p-4 space-y-3 bg-[#FAF9F7]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#141413]">
                          {req.requesterName} ({req.legalOrBrandName})
                        </p>
                        <p className="text-xs text-[#5E5D59]">
                          {req.requesterLocation} · {req.idType} ({req.idReference}) ·{' '}
                          {formatFullDate(req.updatedAt)}
                        </p>
                      </div>
                      <span className="text-xs font-bold uppercase text-[#0E7C5B]">
                        {req.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Badge label"
                        value={adminLabels[req.uid] ?? req.proposedLabel}
                        onChange={(e) =>
                          setAdminLabels((p) => ({ ...p, [req.uid]: e.target.value }))
                        }
                        className="min-h-[38px] px-3 py-1.5 bg-white border border-[#E7E5E0] rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Review note"
                        value={adminNotes[req.uid] ?? req.reviewNote}
                        onChange={(e) =>
                          setAdminNotes((p) => ({ ...p, [req.uid]: e.target.value }))
                        }
                        className="min-h-[38px] px-3 py-1.5 bg-white border border-[#E7E5E0] rounded-lg text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={reviewingUid === req.uid}
                        onClick={() => void handleAdminDecision(req, 'approved')}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0E7C5B] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={reviewingUid === req.uid}
                        onClick={() => void handleAdminDecision(req, 'rejected')}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#FECACA] bg-white text-[#B91C1C] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB: PROFILE & REGION */}
      {activeTab === 'profile' && (
        <section className="bg-white border border-[#E7E5E0] rounded-2xl p-5 sm:p-6 max-w-2xl space-y-5">
          <div>
            <h2 className="font-display text-lg font-bold text-[#141413]">
              Profile &amp; African Region
            </h2>
            <p className="text-xs text-[#5E5D59]">
              Set your African city/country so viewers can discover your stories by region.
            </p>
          </div>

          <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-4">
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-16 h-16 rounded-full object-cover border border-[#E7E5E0]"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#141413] text-white font-bold flex items-center justify-center">
                  {displayName.charAt(0).toUpperCase() || 'M'}
                </div>
              )}
              <div>
                <label className="inline-block px-3.5 py-2 rounded-xl border border-[#E7E5E0] bg-[#FAF9F7] text-xs font-semibold text-[#141413] cursor-pointer hover:border-[#0E7C5B]">
                  Change Avatar
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleAvatarUpload(e)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#141413]">
                  Storyteller Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#141413]">
                  Role
                </label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountType)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
                >
                  <option value="creator">Storyteller / Creator</option>
                  <option value="business">Media / Studio</option>
                  <option value="community">Community Organizer</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#141413]">
                African City &amp; Country
              </label>
              <input
                list="african-cities-list"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Nairobi, Kenya / Lagos, Nigeria / Accra, Ghana"
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
              />
              <datalist id="african-cities-list">
                {AFRICAN_CITIES.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#141413]">Bio</label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell viewers across Africa what kind of stories you share..."
                className="w-full px-3 py-2 bg-white border border-[#E7E5E0] rounded-xl text-sm text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
              />
            </div>

            <button
              type="submit"
              disabled={profileSaving}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold hover:bg-[#095E44] disabled:opacity-50 cursor-pointer"
            >
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
