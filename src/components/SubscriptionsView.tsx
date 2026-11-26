import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Crown,
  Globe2,
  MapPin,
  Search,
  TrendingUp,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribePublicProfilesList } from '../services/challengeService';
import {
  AFRICAN_REGIONS,
  SUBSCRIPTION_PLANS,
  type AfricanRegion,
  type ChallengeVideo,
  type CreatorSubscription,
  type PublicProfile,
  type VerifiedBadgeInfo,
} from '../types';
import { getAfricanRegionFromLocation } from '../utils/challengeMedia';

interface SubscriptionsViewProps {
  allVideos: ChallengeVideo[];
  mySubscriptions: CreatorSubscription[];
  verifiedBadges: Record<string, VerifiedBadgeInfo>;
  onStartSubscription: (input: {
    planType: 'creator_fan' | 'creator_pro';
    targetId: string;
    targetName: string;
    targetSubtitle?: string;
  }) => void;
  onCancelSubscription: (subId: string) => Promise<void>;
  onViewProfile: (uid: string) => void;
}

export function SubscriptionsView({
  allVideos,
  mySubscriptions,
  verifiedBadges,
  onStartSubscription,
  onCancelSubscription,
  onViewProfile,
}: SubscriptionsViewProps) {
  const { user, signInWithGoogle } = useAuth();
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<AfricanRegion>('All Africa');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribePublicProfilesList(
      (list) => {
        setProfiles(list);
        setLoadingProfiles(false);
      },
      () => {
        setLoadingProfiles(false);
      }
    );
    return () => unsub();
  }, []);

  const now = Date.now();
  const activeSubs = useMemo(
    () => mySubscriptions.filter((s) => s.status === 'active' && s.expiresAt > now),
    [mySubscriptions, now]
  );

  const proSub = useMemo(
    () =>
      activeSubs.find(
        (s) => s.planType === 'creator_pro' && s.targetId === SUBSCRIPTION_PLANS.PRO_TARGET_ID
      ) || null,
    [activeSubs]
  );

  const activeCreatorTargetIds = useMemo(
    () => new Set(activeSubs.filter((s) => s.planType === 'creator_fan').map((s) => s.targetId)),
    [activeSubs]
  );

  const storytellers = useMemo(() => {
    const videoStatsByUid = new Map<string, { count: number; votes: number }>();
    allVideos.forEach((v) => {
      const existing = videoStatsByUid.get(v.authorId);
      if (!existing) {
        videoStatsByUid.set(v.authorId, {
          count: 1,
          votes: v.votesCount,
        });
      } else {
        existing.count += 1;
        existing.votes += v.votesCount;
      }
    });

    const map = new Map<string, PublicProfile>();
    profiles.forEach((p) => {
      map.set(p.uid, p);
    });
    allVideos.forEach((v) => {
      if (!map.has(v.authorId)) {
        map.set(v.authorId, {
          uid: v.authorId,
          displayName: v.authorName,
          bio: '',
          location: v.authorLocation || 'Africa',
          accountType: 'creator',
          avatarUrl: v.authorAvatar,
          isPublic: true,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        });
      }
    });

    const q = searchQuery.trim().toLowerCase();
    return Array.from(map.values())
      .filter((p) => p.uid !== user?.uid)
      .filter((p) => {
        const region = getAfricanRegionFromLocation(p.location);
        if (selectedRegion !== 'All Africa' && region !== selectedRegion) {
          return false;
        }
        if (!q) return true;
        return (
          p.displayName.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          p.bio.toLowerCase().includes(q)
        );
      })
      .map((p) => ({
        profile: p,
        stats: videoStatsByUid.get(p.uid) || { count: 0, votes: 0 },
      }))
      .sort((a, b) => b.stats.count - a.stats.count || b.stats.votes - a.stats.votes);
  }, [profiles, allVideos, user?.uid, searchQuery, selectedRegion]);

  const handleSubscribePro = async () => {
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
    }
    onStartSubscription({
      planType: 'creator_pro',
      targetId: SUBSCRIPTION_PLANS.PRO_TARGET_ID,
      targetName: SUBSCRIPTION_PLANS.PRO_TARGET_NAME,
      targetSubtitle: 'Pro Storyteller badge · Regional discovery · Audience insights',
    });
  };

  const handleCancel = async (subId: string) => {
    setCancellingId(subId);
    try {
      await onCancelSubscription(subId);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-8">
      <header className="space-y-1.5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141413]">
          Subscriptions &amp; Creator Support
        </h1>
        <p className="text-sm text-[#5E5D59] max-w-2xl">
          Back your favorite African storytellers every month or upgrade to Creator Pro for higher visibility and creator insights.
        </p>
      </header>

      {/* MoodSpace Creator Pro Membership Card (Price shown cleanly in checkout modal when clicking Subscribe) */}
      <section className="bg-white border border-[#E7E5E0] rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#0E7C5B]">
            <Crown className="w-4 h-4 text-[#D97706]" />
            <span>MoodSpace Creator Pro</span>
            {proSub && (
              <span className="px-2 py-0.5 rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-[#0E7C5B]">
                Active
              </span>
            )}
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#141413]">
            Grow your African storytelling audience
          </h2>
          <p className="text-sm text-[#5E5D59]">
            Unlock a Pro Storyteller badge across feeds, highlighted placement in regional discovery, and full supporter analytics in your Dashboard.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#3F3E3B] pt-1">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#0E7C5B]" />
              Pro Storyteller badge
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[#D97706]" />
              Regional discovery highlight
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#0E7C5B]" />
              Fan subscriber analytics
            </span>
          </div>
        </div>

        <div className="bg-[#FAF9F7] border border-[#E7E5E0] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-stretch justify-between gap-3 lg:w-64 shrink-0">
          <div>
            <p className="text-xs text-[#5E5D59]">Membership</p>
            <p className="font-display text-lg font-bold text-[#141413]">
              Monthly Creator Pass
            </p>
            <p className="text-[11px] text-[#5E5D59]">Review plan details on next step</p>
          </div>
          {proSub ? (
            <button
              type="button"
              disabled={cancellingId === proSub.id}
              onClick={() => void handleCancel(proSub.id)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E7E5E0] bg-white text-xs font-semibold text-[#5E5D59] hover:text-[#B91C1C] hover:border-[#FECACA] cursor-pointer whitespace-nowrap"
            >
              {cancellingId === proSub.id ? 'Cancelling...' : 'Cancel Pro Plan'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubscribePro()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold hover:bg-[#095E44] cursor-pointer whitespace-nowrap"
            >
              Subscribe to Pro
            </button>
          )}
        </div>
      </section>

      {/* Your Active Subscriptions */}
      {user && activeSubs.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-[#141413]">
            Your Active Subscriptions ({activeSubs.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSubs.map((sub) => (
              <div
                key={sub.id}
                className="bg-white border border-[#E7E5E0] rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0E7C5B]">
                      {sub.planType === 'creator_pro' ? 'Creator Pro' : 'Fan Pass'}
                    </span>
                    <span className="text-xs font-semibold text-[#5E5D59]">Active</span>
                  </div>
                  <p className="font-display text-base font-bold text-[#141413] truncate">
                    {sub.targetName}
                  </p>
                  <p className="text-xs text-[#5E5D59]">
                    Via {sub.provider} · Renews {new Date(sub.expiresAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F0EEE9]">
                  {sub.planType === 'creator_fan' ? (
                    <button
                      type="button"
                      onClick={() => onViewProfile(sub.targetId)}
                      className="text-xs font-semibold text-[#0E7C5B] hover:underline cursor-pointer"
                    >
                      View Creator
                    </button>
                  ) : (
                    <span className="text-xs text-[#5E5D59]">Active across Africa</span>
                  )}
                  <button
                    type="button"
                    disabled={cancellingId === sub.id}
                    onClick={() => void handleCancel(sub.id)}
                    className="text-xs font-semibold text-[#5E5D59] hover:text-[#B91C1C] cursor-pointer"
                  >
                    {cancellingId === sub.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pan-African Storytellers Directory */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#141413]">
              Support African Storytellers
            </h2>
            <p className="text-xs text-[#5E5D59]">
              Monthly fan passes directly back storytellers you enjoy watching across Africa.
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-[#5E5D59] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find storytellers or cities..."
              aria-label="Search storytellers"
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
        </div>

        {/* Regional Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <Globe2 className="w-4 h-4 text-[#0E7C5B] shrink-0" />
          {AFRICAN_REGIONS.map((region) => {
            const active = selectedRegion === region;
            return (
              <button
                key={region}
                type="button"
                onClick={() => setSelectedRegion(region)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#141413] text-white'
                    : 'bg-white border border-[#E7E5E0] text-[#5E5D59] hover:text-[#141413]'
                }`}
              >
                {region}
              </button>
            );
          })}
        </div>

        {loadingProfiles ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-40 rounded-2xl bg-white border border-[#E7E5E0] animate-pulse p-5"
              />
            ))}
          </div>
        ) : storytellers.length === 0 ? (
          <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center space-y-2">
            <Users className="w-7 h-7 text-[#0E7C5B] mx-auto" />
            <p className="text-sm font-semibold text-[#141413]">
              No storytellers matched this filter yet
            </p>
            <p className="text-xs text-[#5E5D59]">
              Switch to All Africa or clear your search to discover storytellers across the continent.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {storytellers.map(({ profile: creator, stats }) => {
              const badge = verifiedBadges[creator.uid];
              const isSubscribed = activeCreatorTargetIds.has(creator.uid);
              const region = getAfricanRegionFromLocation(creator.location);

              return (
                <article
                  key={creator.uid}
                  className="bg-white border border-[#E7E5E0] rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => onViewProfile(creator.uid)}
                      className="flex items-center gap-3 w-full text-left group cursor-pointer"
                    >
                      {creator.avatarUrl ? (
                        <img
                          src={creator.avatarUrl}
                          alt={creator.displayName}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-full object-cover border border-[#E7E5E0] shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-[#141413] text-white font-bold flex items-center justify-center shrink-0">
                          {creator.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-display text-base font-bold text-[#141413] truncate group-hover:underline">
                            {creator.displayName}
                          </span>
                          {badge && <BadgeCheck className="w-4 h-4 text-[#0E7C5B] shrink-0" />}
                        </div>
                        <p className="text-xs text-[#5E5D59] flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-[#0E7C5B] shrink-0" />
                          <span className="truncate">{creator.location || region}</span>
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-4 text-xs text-[#5E5D59]">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Video className="w-3.5 h-3.5 text-[#0E7C5B]" />
                        {stats.count} {stats.count === 1 ? 'story' : 'stories'}
                      </span>
                      <span className="tabular-nums">{region}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-[#F0EEE9]">
                    <button
                      type="button"
                      onClick={() => onViewProfile(creator.uid)}
                      className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-[#E7E5E0] bg-[#FAF9F7] text-xs font-semibold text-[#141413] hover:bg-[#F2F0EC] cursor-pointer"
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      disabled={isSubscribed}
                      onClick={() =>
                        onStartSubscription({
                          planType: 'creator_fan',
                          targetId: creator.uid,
                          targetName: creator.displayName,
                          targetSubtitle: `${creator.location || region} · Fan Pass`,
                        })
                      }
                      className={`flex-[1.3] min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                        isSubscribed
                          ? 'bg-[#FEF3C7] border border-[#FCD34D] text-[#92400E] cursor-default'
                          : 'bg-[#0E7C5B] text-white hover:bg-[#095E44]'
                      }`}
                    >
                      <Crown className="w-3.5 h-3.5" />
                      <span>{isSubscribed ? 'Subscribed' : 'Subscribe'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
