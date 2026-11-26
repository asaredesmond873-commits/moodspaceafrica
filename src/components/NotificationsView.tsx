import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Eye,
  MessageCircle,
  Trophy,
  UserPlus,
  Video,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeChallengeConfig,
  subscribeChallengeVideoComments,
} from '../services/challengeService';
import {
  subscribeMyProfileViewers,
  subscribeProfileFollowers,
} from '../services/firestoreService';
import type {
  ChallengeConfig,
  ChallengeVideo,
  ChallengeVideoComment,
  FollowRecord,
  ProfileViewRecord,
} from '../types';
import { formatTimestamp } from '../utils/media';
import {
  getNotifLastReadMs,
  markAllNotificationsReadNow,
} from '../utils/notifications';

type ActivityFilter = 'all' | 'friends' | 'updates';

interface ActivityItem {
  id: string;
  kind: 'follow' | 'comment' | 'profile_view' | 'friend_story' | 'winner';
  category: 'friends' | 'updates';
  actorName: string;
  actorUid?: string;
  actorAvatar?: string;
  videoId?: string;
  title: string;
  detail: string;
  createdAtMs: number;
  createdAtLabel: string;
}

interface NotificationsViewProps {
  allVideos: ChallengeVideo[];
  followingIds: Set<string>;
  hasCreatorPass: boolean;
  onJumpToStory: (videoId: string) => void;
  onViewProfile: (uid: string) => void;
  onMarkRead?: () => void;
}

export function NotificationsView({
  allVideos,
  followingIds,
  hasCreatorPass,
  onJumpToStory,
  onViewProfile,
  onMarkRead,
}: NotificationsViewProps) {
  const { user, signInWithGoogle } = useAuth();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [lastReadMs, setLastReadMs] = useState<number>(() => getNotifLastReadMs());

  const [followers, setFollowers] = useState<FollowRecord[]>([]);
  const [profileViewers, setProfileViewers] = useState<ProfileViewRecord[]>([]);
  const [commentsByVideo, setCommentsByVideo] = useState<Record<string, ChallengeVideoComment[]>>({});
  const [challengeConfig, setChallengeConfig] = useState<ChallengeConfig | null>(null);

  const myRecentVideoIds = useMemo(() => {
    if (!user) return [];
    return allVideos
      .filter((v) => v.authorId === user.uid)
      .slice(0, 6)
      .map((v) => v.id);
  }, [allVideos, user]);

  useEffect(() => {
    const unsubConfig = subscribeChallengeConfig(setChallengeConfig);
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    if (!user) {
      setFollowers([]);
      return;
    }

    const unsubFollowers = subscribeProfileFollowers(user.uid, setFollowers, () => {});
    return () => {
      unsubFollowers();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !hasCreatorPass) {
      setProfileViewers([]);
      return;
    }
    const unsubViews = subscribeMyProfileViewers(
      user.uid,
      setProfileViewers,
      () => setProfileViewers([])
    );
    return () => unsubViews();
  }, [user, hasCreatorPass]);

  useEffect(() => {
    if (!user || myRecentVideoIds.length === 0) {
      setCommentsByVideo({});
      return;
    }

    const unsubs: (() => void)[] = [];
    myRecentVideoIds.forEach((videoId) => {
      unsubs.push(
        subscribeChallengeVideoComments(
          videoId,
          (list) => {
            setCommentsByVideo((prev) => ({ ...prev, [videoId]: list }));
          },
          () => {}
        )
      );
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [user, myRecentVideoIds]);

  const videoTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    allVideos.forEach((v) => map.set(v.id, v.title));
    return map;
  }, [allVideos]);

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    followers.forEach((f) => {
      const ms = f.createdAt?.toMillis() ?? 0;
      items.push({
        id: `follow_${f.followerId}`,
        kind: 'follow',
        category: 'friends',
        actorName: f.displayName,
        actorUid: f.followerId,
        actorAvatar: f.avatarUrl,
        title: `${f.displayName} started following you`,
        detail: f.location ? `From ${f.location}` : 'Storyteller across Africa',
        createdAtMs: ms,
        createdAtLabel: formatTimestamp(f.createdAt),
      });
    });

    if (hasCreatorPass) {
      profileViewers.forEach((pv) => {
        const ms = pv.viewedAt?.toMillis() ?? 0;
        items.push({
          id: `view_${pv.viewerId}`,
          kind: 'profile_view',
          category: 'updates',
          actorName: pv.viewerName,
          actorUid: pv.viewerId,
          actorAvatar: pv.viewerAvatar,
          title: `${pv.viewerName} viewed your profile`,
          detail: pv.viewerLocation ? `From ${pv.viewerLocation}` : 'Visited your storyteller profile',
          createdAtMs: ms,
          createdAtLabel: formatTimestamp(pv.viewedAt),
        });
      });
    }

    Object.entries(commentsByVideo).forEach(([videoId, list]) => {
      const videoTitle = videoTitleMap.get(videoId) || 'your story';
      list.forEach((cmt) => {
        if (user && cmt.authorId === user.uid) return;
        const ms = cmt.createdAt?.toMillis() ?? 0;
        items.push({
          id: `cmt_${cmt.id}`,
          kind: 'comment',
          category: 'friends',
          actorName: cmt.authorName,
          actorUid: cmt.authorId,
          actorAvatar: cmt.authorAvatar,
          videoId,
          title: `${cmt.authorName} commented on "${videoTitle}"`,
          detail: cmt.text,
          createdAtMs: ms,
          createdAtLabel: formatTimestamp(cmt.createdAt),
        });
      });
    });

    allVideos.forEach((v) => {
      if (!followingIds.has(v.authorId)) return;
      const ms = v.createdAt?.toMillis() ?? 0;
      items.push({
        id: `friend_story_${v.id}`,
        kind: 'friend_story',
        category: 'friends',
        actorName: v.authorName,
        actorUid: v.authorId,
        actorAvatar: v.authorAvatar,
        videoId: v.id,
        title: `${v.authorName} posted a new story`,
        detail: `${v.title} · ${v.authorLocation || 'Africa'}`,
        createdAtMs: ms,
        createdAtLabel: formatTimestamp(v.createdAt),
      });
    });

    if (challengeConfig?.winnerName) {
      const ms = challengeConfig.updatedAt?.toMillis() ?? 0;
      items.push({
        id: `winner_${challengeConfig.winnerRoundLabel}`,
        kind: 'winner',
        category: 'updates',
        actorName: challengeConfig.winnerName,
        videoId: challengeConfig.winnerVideoId || undefined,
        title: `${challengeConfig.winnerName} named ${challengeConfig.winnerRoundLabel} Champion`,
        detail: challengeConfig.winnerTitle || 'Round Winner Spotlight',
        createdAtMs: ms,
        createdAtLabel: challengeConfig.winnerRoundLabel,
      });
    }

    return items.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [
    followers,
    hasCreatorPass,
    profileViewers,
    commentsByVideo,
    allVideos,
    followingIds,
    videoTitleMap,
    challengeConfig,
    user,
  ]);

  const filteredActivities = useMemo(() => {
    if (filter === 'all') return activities;
    return activities.filter((item) => item.category === filter);
  }, [activities, filter]);

  const unreadCount = useMemo(
    () => activities.filter((item) => item.createdAtMs > lastReadMs).length,
    [activities, lastReadMs]
  );

  const latestActivityMs = useMemo(
    () => activities.reduce((max, item) => Math.max(max, item.createdAtMs), 0),
    [activities]
  );

  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;

  useEffect(() => {
    if (!user) return;
    if (latestActivityMs <= lastReadMs && lastReadMs > 0) return;
    const nextMs = markAllNotificationsReadNow(latestActivityMs);
    setLastReadMs((prev) => Math.max(prev, nextMs));
    onMarkReadRef.current?.();
  }, [user, latestActivityMs, lastReadMs]);

  const handleMarkAllRead = () => {
    const nextMs = markAllNotificationsReadNow(latestActivityMs);
    setLastReadMs(nextMs);
    onMarkReadRef.current?.();
  };

  if (!user) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#0E7C5B] flex items-center justify-center mx-auto">
            <Bell className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#141413]">
            Your Notifications
          </h1>
          <p className="text-sm text-[#5E5D59]">
            Sign in to see new followers, comments, profile views, and updates from friends across Africa.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0E7C5B] text-white text-sm font-semibold hover:bg-[#095E44] cursor-pointer"
          >
            Sign In with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-20 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#141413]">Notifications</h1>
          <p className="text-xs text-[#5E5D59]">
            {unreadCount > 0
              ? `${unreadCount} new ${unreadCount === 1 ? 'update' : 'updates'}`
              : 'All caught up'}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E7E5E0] bg-white text-xs font-semibold text-[#141413] hover:border-[#0E7C5B] hover:text-[#0E7C5B] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      <div className="inline-flex items-center p-1 bg-white border border-[#E7E5E0] rounded-xl">
        {[
          { id: 'all' as const, label: 'All Activity' },
          { id: 'friends' as const, label: 'Friends & Comments' },
          { id: 'updates' as const, label: 'Views & Winners' },
        ].map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                active ? 'bg-[#141413] text-white' : 'text-[#5E5D59] hover:text-[#141413]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {filteredActivities.length === 0 ? (
        <div className="bg-white border border-[#E7E5E0] rounded-2xl p-10 text-center space-y-2.5">
          <Bell className="w-8 h-8 text-[#0E7C5B] mx-auto" />
          <h2 className="font-display text-base font-bold text-[#141413]">No activity yet</h2>
          <p className="text-xs text-[#5E5D59] max-w-sm mx-auto">
            Follow storytellers or share your African video story to receive live comments, profile views, and round updates here.
          </p>
        </div>
      ) : (
        <ul className="bg-white border border-[#E7E5E0] rounded-2xl divide-y divide-[#F0EEE9] overflow-hidden">
          {filteredActivities.map((item) => {
            const isUnread = item.createdAtMs > lastReadMs;
            const handleClick = () => {
              if (item.videoId) {
                onJumpToStory(item.videoId);
              } else if (item.actorUid) {
                onViewProfile(item.actorUid);
              }
            };

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={handleClick}
                  className={`w-full px-4 py-3.5 flex items-start gap-3 text-left transition-colors hover:bg-[#FAF9F7] cursor-pointer ${
                    isUnread ? 'bg-[#ECFDF5]/40' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#FAF9F7] border border-[#E7E5E0] flex items-center justify-center shrink-0">
                    {item.kind === 'follow' ? (
                      <UserPlus className="w-4 h-4 text-[#0E7C5B]" />
                    ) : item.kind === 'comment' ? (
                      <MessageCircle className="w-4 h-4 text-[#0E7C5B]" />
                    ) : item.kind === 'profile_view' ? (
                      <Eye className="w-4 h-4 text-[#0E7C5B]" />
                    ) : item.kind === 'winner' ? (
                      <Trophy className="w-4 h-4 text-[#D97706]" />
                    ) : (
                      <Video className="w-4 h-4 text-[#0E7C5B]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#141413] leading-snug">
                      {item.title}
                    </p>
                    <p className="text-xs text-[#5E5D59] line-clamp-2 mt-0.5">{item.detail}</p>
                    <p className="text-[11px] text-[#9E9A93] mt-1">{item.createdAtLabel}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
