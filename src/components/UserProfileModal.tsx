import {
  BadgeCheck,
  MapPin,
  Pencil,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeProfileFollowers,
  subscribeProfileFollowing,
  subscribePublicProfile,
  type FollowTargetSummary,
} from '../services/firestoreService';
import type { FollowRecord, Post, PublicProfile, VerifiedBadgeInfo } from '../types';
import { formatFullDate } from '../utils/media';
import { PostCard } from './PostCard';

type ProfileTab = 'posts' | 'followers' | 'following';

interface UserProfileModalProps {
  profileUid: string;
  posts: Post[];
  verifiedBadges: Record<string, VerifiedBadgeInfo>;
  savedPostIds: Set<string>;
  followingIds: Set<string>;
  onClose: () => void;
  onSelectProfile: (uid: string) => void;
  onToggleFollow: (target: FollowTargetSummary) => void;
  onToggleSaved: (postId: string) => void;
  onOpenForm: (post: Post) => void;
  onOpenEditProfile?: () => void;
  onNotify: (message: string) => void;
}

const ROLE_LABELS: Record<PublicProfile['accountType'], string> = {
  creator: 'Creator',
  business: 'Business',
  community: 'Community Organizer',
};

export function UserProfileModal({
  profileUid,
  posts,
  verifiedBadges,
  savedPostIds,
  followingIds,
  onClose,
  onSelectProfile,
  onToggleFollow,
  onToggleSaved,
  onOpenForm,
  onOpenEditProfile,
  onNotify,
}: UserProfileModalProps) {
  const { user, profile: myProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [liveProfile, setLiveProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [followers, setFollowers] = useState<FollowRecord[]>([]);
  const [following, setFollowing] = useState<FollowRecord[]>([]);
  const [avatarError, setAvatarError] = useState(false);

  const authorPosts = useMemo(
    () => posts.filter((p) => p.authorId === profileUid),
    [posts, profileUid]
  );

  // Instant fallback metadata from posts while liveProfile resolves
  const fallbackFromPosts = useMemo(() => {
    const sample = authorPosts[0];
    if (!sample) return null;
    return {
      displayName: sample.authorName,
      avatarUrl: sample.authorAvatar,
      location: sample.authorLocation,
    };
  }, [authorPosts]);

  useEffect(() => {
    setActiveTab('posts');
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

  const isSelf = Boolean(user && user.uid === profileUid);
  const resolvedProfile = isSelf && myProfile ? myProfile : liveProfile;
  const displayName =
    resolvedProfile?.displayName || fallbackFromPosts?.displayName || 'MoodSpace Member';
  const avatarUrl = resolvedProfile?.avatarUrl || fallbackFromPosts?.avatarUrl || '';
  const location = resolvedProfile?.location || fallbackFromPosts?.location || '';
  const bio = resolvedProfile?.bio || '';
  const accountType = resolvedProfile?.accountType;
  const badge =
    verifiedBadges[profileUid] ||
    (resolvedProfile?.badgeVerified
      ? { uid: profileUid, verifiedLabel: resolvedProfile.verifiedLabel || 'Verified' }
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
        {/* Sticky Modal Header */}
        <div className="bg-white border-b border-[#E7E5E0] px-5 py-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#141413] truncate">
              {isSelf ? 'Your Public Profile' : displayName}
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Profile Identity Card */}
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

              <div className="shrink-0">
                {isSelf ? (
                  onOpenEditProfile && (
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
                  )
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

            {profileLoading && !resolvedProfile && !fallbackFromPosts ? (
              <div className="h-4 w-2/3 bg-[#F0EEE9] rounded animate-pulse" />
            ) : bio ? (
              <p className="text-sm text-[#353431] leading-relaxed whitespace-pre-line">{bio}</p>
            ) : (
              <p className="text-xs text-[#5E5D59]">
                {isSelf
                  ? 'Add a bio in Profile & Bio settings so visitors know what you share.'
                  : 'MoodSpace Africa community member.'}
              </p>
            )}

            {/* Tab Bar: Posts / Followers / Following */}
            <div className="pt-4 border-t border-[#F0EEE9] flex items-center gap-2 overflow-x-auto">
              {(
                [
                  { id: 'posts', label: 'Posts', count: authorPosts.length },
                  { id: 'followers', label: 'Followers', count: followers.length },
                  { id: 'following', label: 'Following', count: following.length },
                ] as const
              ).map((tab) => {
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
                    <span className="font-mono tabular-nums opacity-80">{tab.count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Tab Body */}
          {activeTab === 'posts' && (
            <div className="space-y-4">
              {authorPosts.length === 0 ? (
                <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center text-sm text-[#5E5D59]">
                  {displayName} has not published any public posts yet.
                </div>
              ) : (
                authorPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    verifiedBadges={verifiedBadges}
                    isSaved={savedPostIds.has(post.id)}
                    isFollowingAuthor={followingIds.has(post.authorId)}
                    onToggleFollow={onToggleFollow}
                    onViewProfile={(uid) => {
                      if (uid !== profileUid) onSelectProfile(uid);
                    }}
                    onOpenForm={onOpenForm}
                    onToggleSaved={onToggleSaved}
                    onNotify={onNotify}
                  />
                ))
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
        </div>
      </div>
    </div>
  );
}
