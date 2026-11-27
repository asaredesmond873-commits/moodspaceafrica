import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  Film,
  Heart,
  Lock,
  MapPin,
  Pencil,
  ThumbsUp,
  UserCheck,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  recordProfileView,
  subscribeMyProfileViewers,
  subscribeProfileFollowers,
  subscribeProfileFollowing,
  subscribePublicProfile,
  type FollowTargetSummary,
} from '../services/firestoreService';
import {
  type ChallengeVideo,
  type FollowRecord,
  type ProfileViewRecord,
  type PublicProfile,
  type VerifiedBadgeInfo,
} from '../types';
import { formatCompactCount, formatDurationSeconds } from '../utils/challengeMedia';
import { formatFullDate, formatTimestamp } from '../utils/media';

type ProfileTab = 'stories' | 'followers' | 'following' | 'views';

interface UserProfileModalProps {
  profileUid: string;
  allVideos: ChallengeVideo[];
  verifiedBadges: Record<string, VerifiedBadgeInfo>;
  followingIds: Set<string>;
  hasCreatorPass: boolean;
  onClose: () => void;
  onSelectProfile: (uid: string) => void;
  onToggleFollow: (target: FollowTargetSummary) => void;
  onOpenSubscribe: () => void;
  onJumpToStory?: (videoId: string) => void;
  onOpenEditProfile?: () => void;
}

const ROLE_LABELS: Record<PublicProfile['accountType'], string> = {
  creator: 'Storyteller',
  business: 'Media / Studio',
  community: 'Community Voice',
};

export function UserProfileModal({
  profileUid,
  allVideos,
  verifiedBadges,
  followingIds,
  hasCreatorPass,
  onClose,
  onSelectProfile,
  onToggleFollow,
  onOpenSubscribe,
  onJumpToStory,
  onOpenEditProfile,
}: UserProfileModalProps) {
  const { user, profile: myProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('stories');
  const [liveProfile, setLiveProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [followers, setFollowers] = useState<FollowRecord[]>([]);
  const [following, setFollowing] = useState<FollowRecord[]>([]);
  const [profileViewers, setProfileViewers] = useState<ProfileViewRecord[]>([]);
  const [avatarError, setAvatarError] = useState(false);

  const isSelf = Boolean(user && user.uid === profileUid);

  const authorStories = useMemo(
    () => allVideos.filter((v) => v.authorId === profileUid),
    [allVideos, profileUid]
  );

  const fallbackFromStories = useMemo(() => {
    const sample = authorStories[0];
    if (!sample) return null;
    return {
      displayName: sample.authorName,
      avatarUrl: sample.authorAvatar,
      location: sample.authorLocation,
    };
  }, [authorStories]);

  useEffect(() => {
    setActiveTab('stories');
    setAvatarError(false);
    setProfileLoading(true);

    const unsubProfile = subscribePublicProfile(
      profileUid,
      (data) => {
        setLiveProfile(data);
        setProfileLoading(false);
      },
      () => {
        setProfileLoading(false);
      }
    );

    const unsubFollowers = subscribeProfileFollowers(profileUid, setFollowers, () => {});
    const unsubFollowing = subscribeProfileFollowing(profileUid, setFollowing, () => {});

    return () => {
      unsubProfile();
      unsubFollowers();
      unsubFollowing();
    };
  }, [profileUid]);

  // Record a profile view when a signed-in viewer opens someone else's profile
  useEffect(() => {
    if (!user || !myProfile || user.uid === profileUid) return;
    void recordProfileView(profileUid, myProfile);
  }, [user, myProfile, profileUid]);

  // Paid Creator Pass holders see live profile viewers on their own profile
  useEffect(() => {
    if (!isSelf || !hasCreatorPass) {
      setProfileViewers([]);
      return;
    }
    const unsubViews = subscribeMyProfileViewers(
      profileUid,
      setProfileViewers,
      () => setProfileViewers([])
    );
    return () => unsubViews();
  }, [isSelf, hasCreatorPass, profileUid]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const resolvedProfile = isSelf && myProfile ? myProfile : liveProfile;
  const displayName =
    resolvedProfile?.displayName || fallbackFromStories?.displayName || 'MoodSpace Storyteller';
  const avatarUrl = resolvedProfile?.avatarUrl || fallbackFromStories?.avatarUrl || '';
  const location = resolvedProfile?.location || fallbackFromStories?.location || 'Africa';
  const bio = resolvedProfile?.bio || '';
  const accountType = resolvedProfile?.accountType;
  const badge =
    verifiedBadges[profileUid] ||
    (resolvedProfile?.badgeVerified
      ? { uid: profileUid, verifiedLabel: resolvedProfile.verifiedLabel || 'Verified Creator' }
      : null);

  const isFollowingTarget = followingIds.has(profileUid);
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const followSummary: FollowTargetSummary = {
    uid: profileUid,
    displayName,
    avatarUrl,
    location,
  };

  const tabs: { id: ProfileTab; label: string; count?: number }[] = [
    { id: 'stories', label: 'Stories', count: authorStories.length },
    { id: 'followers', label: 'Followers', count: followers.length },
    { id: 'following', label: 'Following', count: following.length },
    ...(isSelf
      ? [
          {
            id: 'views' as const,
            label: 'Profile Views',
            count: hasCreatorPass ? profileViewers.length : undefined,
          },
        ]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-[#141413]/50 backdrop-blur-[2px] flex items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName} profile`}
        className="w-full h-full sm:h-auto sm:max-h-[90vh] max-w-3xl bg-[#FAF9F7] sm:rounded-2xl border border-[#E7E5E0] shadow-xl flex flex-col overflow-hidden"
      >
        <div className="bg-white border-b border-[#E7E5E0] px-5 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#141413] truncate">
              {isSelf ? 'Your Profile' : displayName}
            </h2>
            {badge && (
              <span title={badge.verifiedLabel} className="shrink-0">
                <BadgeCheck className="w-4 h-4 fill-[#0E7C5B] text-white" />
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile modal"
            className="p-1.5 text-[#5E5D59] hover:text-[#141413] hover:bg-[#FAF9F7] rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <section className="bg-white border border-[#E7E5E0] rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                {avatarUrl && !avatarError ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border border-[#E7E5E0] shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#141413] text-white text-lg font-bold flex items-center justify-center shrink-0">
                    {initials || 'MS'}
                  </div>
                )}

                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h1 className="font-display text-xl sm:text-2xl font-bold text-[#141413] break-words">
                      {displayName}
                    </h1>
                    {badge && (
                      <span
                        title={badge.verifiedLabel}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0E7C5B]"
                      >
                        <BadgeCheck className="w-4 h-4 fill-[#0E7C5B] text-white shrink-0" />
                        <span>{badge.verifiedLabel}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5E5D59]">
                    {accountType && (
                      <span className="font-semibold text-[#0E7C5B]">
                        {ROLE_LABELS[accountType]}
                      </span>
                    )}
                    {accountType && location && <span aria-hidden="true">·</span>}
                    {location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#5E5D59]" />
                        {location}
                      </span>
                    )}
                    {resolvedProfile?.createdAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Joined {formatFullDate(resolvedProfile.createdAt)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {isSelf ? (
                  <>
                    {/* One simple Subscribe button inside Profile */}
                    {hasCreatorPass ? (
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#ECFDF5] text-[#0E7C5B] border border-[#A7F3D0] whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Subscribed</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenSubscribe();
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] whitespace-nowrap cursor-pointer"
                      >
                        Subscribe
                      </button>
                    )}

                    {onOpenEditProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenEditProfile();
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#141413] bg-white border border-[#D4D1CA] rounded-lg hover:border-[#141413] whitespace-nowrap cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit Profile
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleFollow(followSummary)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      isFollowingTarget
                        ? 'bg-[#FAF9F7] text-[#141413] border border-[#D4D1CA] hover:border-[#B91C1C] hover:text-[#B91C1C]'
                        : 'bg-[#0E7C5B] text-white hover:bg-[#095E44]'
                    }`}
                  >
                    {isFollowingTarget ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {profileLoading && !resolvedProfile && !fallbackFromStories ? (
              <div className="h-4 w-2/3 bg-[#F0EEE9] rounded animate-pulse" />
            ) : bio ? (
              <p className="text-sm text-[#353431] leading-relaxed whitespace-pre-line">{bio}</p>
            ) : (
              <p className="text-xs text-[#5E5D59]">
                {isSelf
                  ? 'Add a bio in Profile & Region settings so viewers across Africa know what stories you tell.'
                  : 'African video storyteller on MoodSpace Africa.'}
              </p>
            )}

            <div className="pt-4 border-t border-[#F0EEE9] flex items-center gap-2 overflow-x-auto">
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#141413] text-white'
                        : 'bg-[#FAF9F7] text-[#5E5D59] hover:text-[#141413]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' ? (
                      <span className="font-mono tabular-nums opacity-80">{tab.count}</span>
                    ) : tab.id === 'views' && !hasCreatorPass ? (
                      <Lock className="w-3 h-3 opacity-75" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          {activeTab === 'stories' && (
            <div className="space-y-4">
              {authorStories.length === 0 ? (
                <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center space-y-2">
                  <Video className="w-7 h-7 text-[#0E7C5B] mx-auto" />
                  <p className="text-sm text-[#5E5D59]">
                    {displayName} has not uploaded any video stories yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {authorStories.map((story) => (
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
                          <Film className="w-8 h-8 text-white/60" />
                        )}
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[11px] font-medium tabular-nums">
                          {formatDurationSeconds(story.durationSeconds)}
                        </span>
                      </div>

                      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <h3 className="font-display text-sm font-bold text-[#141413] line-clamp-2">
                            {story.title}
                          </h3>
                          <p className="text-[11px] text-[#5E5D59]">
                            {story.roundId.replace('_', ' ')} · {formatTimestamp(story.createdAt)}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-xs text-[#5E5D59] pt-2 border-t border-[#F0EEE9]">
                          <div className="flex items-center gap-3 tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Eye className="w-3.5 h-3.5 text-[#0E7C5B]" />
                              {formatCompactCount(story.viewsCount)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Heart className="w-3.5 h-3.5 text-[#EF4444]" />
                              {formatCompactCount(story.likesCount)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <ThumbsUp className="w-3.5 h-3.5 text-[#0E7C5B]" />
                              {formatCompactCount(story.votesCount)}
                            </span>
                          </div>
                          {onJumpToStory && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onJumpToStory(story.id);
                              }}
                              className="text-xs font-semibold text-[#0E7C5B] hover:underline cursor-pointer"
                            >
                              Watch
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {(activeTab === 'followers' || activeTab === 'following') && (
            <section className="bg-white border border-[#E7E5E0] rounded-2xl divide-y divide-[#F0EEE9]">
              {(activeTab === 'followers' ? followers : following).length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <Users className="w-6 h-6 text-[#5E5D59] mx-auto opacity-70" />
                  <p className="text-sm text-[#5E5D59]">
                    {activeTab === 'followers'
                      ? `${displayName} has no followers yet.`
                      : `${displayName} is not following anyone yet.`}
                  </p>
                </div>
              ) : (
                (activeTab === 'followers' ? followers : following).map((item) => {
                  const targetUid =
                    activeTab === 'followers' ? item.followerId : item.followingId;
                  const rowBadge = verifiedBadges[targetUid];
                  const rowFollowing = followingIds.has(targetUid);
                  const rowIsSelf = Boolean(user && user.uid === targetUid);
                  const rowInitials = (item.displayName || 'MS')
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <div
                      key={`${activeTab}_${targetUid}`}
                      className="p-4 flex items-center justify-between gap-3 hover:bg-[#FAF9F7] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectProfile(targetUid)}
                        className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
                      >
                        {item.avatarUrl ? (
                          <img
                            src={item.avatarUrl}
                            alt={item.displayName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-[#E7E5E0] shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#141413] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                            {rowInitials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-sm font-semibold text-[#141413] group-hover:text-[#0E7C5B] truncate transition-colors">
                              {item.displayName}
                            </span>
                            {rowBadge && (
                              <span title={rowBadge.verifiedLabel}>
                                <BadgeCheck className="w-4 h-4 fill-[#0E7C5B] text-white shrink-0" />
                              </span>
                            )}
                          </div>
                          {item.location && (
                            <p className="text-xs text-[#5E5D59] truncate">{item.location}</p>
                          )}
                        </div>
                      </button>

                      {!rowIsSelf && (
                        <button
                          type="button"
                          onClick={() =>
                            onToggleFollow({
                              uid: targetUid,
                              displayName: item.displayName,
                              avatarUrl: item.avatarUrl,
                              location: item.location,
                            })
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            rowFollowing
                              ? 'bg-white text-[#141413] border border-[#D4D1CA] hover:border-[#141413]'
                              : 'bg-[#0E7C5B] text-white hover:bg-[#095E44]'
                          }`}
                        >
                          {rowFollowing ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Follow</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          )}

          {activeTab === 'views' && isSelf && (
            <section className="bg-white border border-[#E7E5E0] rounded-2xl overflow-hidden">
              {!hasCreatorPass ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#0E7C5B] flex items-center justify-center mx-auto">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-base font-bold text-[#141413]">
                    See Who Viewed Your Profile
                  </h3>
                  <p className="text-xs text-[#5E5D59] max-w-sm mx-auto">
                    Subscribe to the $1/week Creator Pass via Paystack to unlock who visited your profile, post stories to enter prize rounds, and get a Verified badge.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSubscribe();
                    }}
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-[#0E7C5B] text-white text-xs font-semibold hover:bg-[#095E44] cursor-pointer"
                  >
                    Subscribe
                  </button>
                </div>
              ) : profileViewers.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <Eye className="w-6 h-6 text-[#0E7C5B] mx-auto" />
                  <p className="text-sm text-[#5E5D59]">
                    No one has visited your profile yet. Share a video story to get discovered!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F0EEE9]">
                  {profileViewers.map((viewer) => {
                    const viewerBadge = verifiedBadges[viewer.viewerId];
                    const vInitials = (viewer.viewerName || 'M').slice(0, 2).toUpperCase();
                    return (
                      <div
                        key={viewer.viewerId}
                        className="p-4 flex items-center justify-between gap-3 hover:bg-[#FAF9F7] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectProfile(viewer.viewerId)}
                          className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
                        >
                          {viewer.viewerAvatar ? (
                            <img
                              src={viewer.viewerAvatar}
                              alt={viewer.viewerName}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-full object-cover border border-[#E7E5E0] shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[#141413] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                              {vInitials}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-semibold text-[#141413] group-hover:text-[#0E7C5B] truncate">
                                {viewer.viewerName}
                              </span>
                              {viewerBadge && (
                                <BadgeCheck className="w-4 h-4 fill-[#0E7C5B] text-white shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-[#5E5D59] truncate">
                              {viewer.viewerLocation || 'Africa'} · Viewed {formatTimestamp(viewer.viewedAt)}
                            </p>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
