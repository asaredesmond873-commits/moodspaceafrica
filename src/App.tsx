import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DashboardTab } from './components/DashboardView';
import { PaystackCheckoutModal } from './components/PaystackCheckoutModal';
import { TopBar, type NavSection } from './components/TopBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  activateCreatorPassSubscription,
  cancelCreatorSubscription,
  subscribeAllChallengeVideos,
  subscribeChallengeVideos,
  subscribeMySubscriptions,
  subscribeSavedVideoIds,
  toggleSavedVideo,
} from './services/challengeService';
import {
  subscribeMyFollowingIds,
  subscribeMyProfileViewers,
  subscribeProfileFollowers,
  subscribeVerifiedProfiles,
  toggleFollowUser,
  type FollowTargetSummary,
} from './services/firestoreService';
import {
  SUBSCRIPTION_PLANS,
  type ChallengeVideo,
  type CreatorSubscription,
  type FollowRecord,
  type PaystackCurrency,
  type ProfileViewRecord,
  type VerifiedBadgeInfo,
} from './types';
import { getCurrentChallengeRound } from './utils/challengeMedia';
import { getNotifLastReadMs, markAllNotificationsReadNow } from './utils/notifications';

const VideosArenaView = lazy(() =>
  import('./components/VideosArenaView').then((m) => ({ default: m.VideosArenaView }))
);
const NotificationsView = lazy(() =>
  import('./components/NotificationsView').then((m) => ({ default: m.NotificationsView }))
);
const DashboardView = lazy(() =>
  import('./components/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const UserProfileModal = lazy(() =>
  import('./components/UserProfileModal').then((m) => ({ default: m.UserProfileModal }))
);

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E7E5E0] rounded-2xl p-6 space-y-3 text-center">
            <h1 className="font-display text-xl font-bold text-[#141413]">
              Something went wrong
            </h1>
            <p className="text-sm text-[#5E5D59] break-words">
              {this.state.message || 'Please refresh the page to reconnect.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] cursor-pointer"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function readInitialDeepLinkStoryId(): string | null {
  if (typeof window === 'undefined') return null;
  const fromQuery = new URLSearchParams(window.location.search).get('story')?.trim();
  if (fromQuery) return fromQuery;
  const hash = window.location.hash;
  if (hash.startsWith('#video=')) {
    return hash.replace('#video=', '').trim() || null;
  }
  return null;
}

function MoodSpaceShell() {
  const { user, profile, signInWithGoogle, authError, setLocalProfile } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  const [deepLinkVideoId, setDeepLinkVideoId] = useState<string | null>(() =>
    readInitialDeepLinkStoryId()
  );
  const round = useMemo(() => getCurrentChallengeRound(), []);

  const [roundVideos, setRoundVideos] = useState<ChallengeVideo[]>([]);
  const [allVideos, setAllVideos] = useState<ChallengeVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [verifiedBadges, setVerifiedBadges] = useState<Record<string, VerifiedBadgeInfo>>({});
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());
  const [myFollowers, setMyFollowers] = useState<FollowRecord[]>([]);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(() => new Set());
  const [mySubscriptions, setMySubscriptions] = useState<CreatorSubscription[]>([]);
  const [profileViewers, setProfileViewers] = useState<ProfileViewRecord[]>([]);
  const [notifLastReadMs, setNotifLastReadMs] = useState<number>(() => getNotifLastReadMs());

  const [viewingProfileUid, setViewingProfileUid] = useState<string | null>(null);
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [videoUploadNonce, setVideoUploadNonce] = useState(0);
  const [dashboardInitialTab, setDashboardInitialTab] = useState<DashboardTab>('overview');
  const [dashboardTabNonce, setDashboardTabNonce] = useState(0);

  useEffect(() => {
    const unsubRound = subscribeChallengeVideos(
      round.roundId,
      (list) => {
        setRoundVideos(list);
        setVideosLoading(false);
      },
      () => {
        setVideosLoading(false);
      }
    );
    const unsubAll = subscribeAllChallengeVideos(setAllVideos, () => {});
    const unsubBadges = subscribeVerifiedProfiles(setVerifiedBadges, () => {});
    return () => {
      unsubRound();
      unsubAll();
      unsubBadges();
    };
  }, [round.roundId]);

  useEffect(() => {
    if (!user) {
      setFollowingIds(new Set());
      setMyFollowers([]);
      setSavedVideoIds(new Set());
      setMySubscriptions([]);
      return;
    }
    const unsubFollowing = subscribeMyFollowingIds(user.uid, setFollowingIds, () => {});
    const unsubFollowers = subscribeProfileFollowers(user.uid, setMyFollowers, () => {});
    const unsubSaved = subscribeSavedVideoIds(user.uid, setSavedVideoIds, () => {});
    const unsubSubs = subscribeMySubscriptions(user.uid, setMySubscriptions, () => {});
    return () => {
      unsubFollowing();
      unsubFollowers();
      unsubSaved();
      unsubSubs();
    };
  }, [user]);

  const now = Date.now();
  const activeCreatorPass = useMemo(
    () =>
      mySubscriptions.find(
        (s) =>
          s.planType === 'creator_pass' &&
          s.targetId === SUBSCRIPTION_PLANS.PLAN_ID &&
          s.status === 'active' &&
          s.expiresAt > now
      ) ?? null,
    [mySubscriptions, now]
  );

  const hasCreatorPass = Boolean(activeCreatorPass);

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

  const latestNotificationMs = useMemo(() => {
    let maxMs = 0;
    myFollowers.forEach((f) => {
      const ms = f.createdAt?.toMillis() ?? 0;
      if (ms > maxMs) maxMs = ms;
    });
    if (hasCreatorPass) {
      profileViewers.forEach((pv) => {
        const ms = pv.viewedAt?.toMillis() ?? 0;
        if (ms > maxMs) maxMs = ms;
      });
    }
    allVideos.forEach((v) => {
      if (followingIds.has(v.authorId)) {
        const ms = v.createdAt?.toMillis() ?? 0;
        if (ms > maxMs) maxMs = ms;
      }
    });
    return maxMs;
  }, [myFollowers, hasCreatorPass, profileViewers, allVideos, followingIds]);

  useEffect(() => {
    if (activeSection !== 'notifications') return;
    const nextMs = markAllNotificationsReadNow(latestNotificationMs);
    setNotifLastReadMs((prev) => Math.max(prev, nextMs));
  }, [activeSection, latestNotificationMs]);

  const unreadNotificationsCount = useMemo(() => {
    if (!user || activeSection === 'notifications') return 0;
    let count = 0;
    myFollowers.forEach((f) => {
      if ((f.createdAt?.toMillis() ?? 0) > notifLastReadMs) count += 1;
    });
    if (hasCreatorPass) {
      profileViewers.forEach((pv) => {
        if ((pv.viewedAt?.toMillis() ?? 0) > notifLastReadMs) count += 1;
      });
    }
    allVideos.forEach((v) => {
      if (followingIds.has(v.authorId) && (v.createdAt?.toMillis() ?? 0) > notifLastReadMs) {
        count += 1;
      }
    });
    return count;
  }, [
    user,
    activeSection,
    myFollowers,
    hasCreatorPass,
    profileViewers,
    allVideos,
    followingIds,
    notifLastReadMs,
  ]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((current) => (current === msg ? null : current));
    }, 3200);
  };

  const handleToggleFollow = async (target: FollowTargetSummary) => {
    let activeProfile = profile;
    if (!user || !activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) return;
    }
    if (activeProfile.uid === target.uid) return;

    const currentlyFollowing = followingIds.has(target.uid);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (currentlyFollowing) next.delete(target.uid);
      else next.add(target.uid);
      return next;
    });

    try {
      await toggleFollowUser(activeProfile, target, currentlyFollowing);
      showToast(
        currentlyFollowing
          ? `Unfollowed ${target.displayName}`
          : `Following ${target.displayName}`
      );
    } catch {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (currentlyFollowing) next.add(target.uid);
        else next.delete(target.uid);
        return next;
      });
      showToast('Could not update follow status.');
    }
  };

  const handleToggleSavedVideo = async (videoId: string) => {
    let uid = user?.uid;
    if (!uid) {
      const signed = await signInWithGoogle();
      if (!signed) return;
      uid = signed.uid;
    }
    const currentlySaved = savedVideoIds.has(videoId);
    setSavedVideoIds((prev) => {
      const next = new Set(prev);
      if (currentlySaved) next.delete(videoId);
      else next.add(videoId);
      return next;
    });

    try {
      await toggleSavedVideo(videoId, uid, currentlySaved);
      showToast(currentlySaved ? 'Removed from saved stories' : 'Saved story to bookmarks');
    } catch {
      setSavedVideoIds((prev) => {
        const next = new Set(prev);
        if (currentlySaved) next.add(videoId);
        else next.delete(videoId);
        return next;
      });
      showToast('Could not update bookmark.');
    }
  };

  const handleOpenSubscribe = async () => {
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
    }
    setSubscribeModalOpen(true);
  };

  const handleConfirmPaystackSubscribe = async (input: {
    country: string;
    currency: PaystackCurrency;
    localAmount: number;
    paystackReference: string;
  }) => {
    let activeProfile = profile;
    if (!user || !activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) throw new Error('Please sign in first.');
    }

    await activateCreatorPassSubscription({
      subscriber: activeProfile,
      ...input,
    });
    setLocalProfile({
      ...activeProfile,
      badgeVerified: true,
      verifiedLabel: 'Verified Creator',
    });
    showToast('MoodSpace Creator Pass active! You can now post stories and enter to win.');
  };

  const handleCancelCreatorPass = async () => {
    if (!activeCreatorPass || !user) return;
    const clearPaidBadge = profile?.verifiedLabel === 'Verified Creator';
    try {
      await cancelCreatorSubscription(activeCreatorPass.id, user.uid, clearPaidBadge);
      if (profile && clearPaidBadge) {
        setLocalProfile({
          ...profile,
          badgeVerified: false,
          verifiedLabel: '',
        });
      }
      showToast('Creator Pass membership cancelled.');
    } catch {
      showToast('Could not cancel Creator Pass membership.');
    }
  };

  const handleJumpToStory = (videoId: string) => {
    if (!roundVideos.some((v) => v.id === videoId)) {
      setDeepLinkVideoId(videoId);
    }
    setActiveSection('home');
    window.setTimeout(() => {
      const el = document.getElementById(`video-reel-${videoId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleRequestUpload = () => {
    if (activeSection !== 'home') {
      setActiveSection('home');
    }
    setVideoUploadNonce((n) => n + 1);
  };

  const handleOpenDashboardLeaderboard = () => {
    setDashboardInitialTab('leaderboard');
    setDashboardTabNonce((n) => n + 1);
    setActiveSection('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenMyProfile = async () => {
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
      setViewingProfileUid(signed.uid);
      return;
    }
    setViewingProfileUid(user.uid);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F7] text-[#141413]">
      <TopBar
        activeSection={activeSection}
        unreadNotificationsCount={unreadNotificationsCount}
        onSelectSection={(sec) => {
          setActiveSection(sec);
          if (sec === 'notifications') {
            const nextMs = markAllNotificationsReadNow(latestNotificationMs);
            setNotifLastReadMs((prev) => Math.max(prev, nextMs));
          }
          if (sec === 'dashboard') {
            setDashboardInitialTab('overview');
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenVideoUpload={handleRequestUpload}
        onOpenMyProfile={() => void handleOpenMyProfile()}
      />

      {authError && (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="bg-red-50 border border-red-200 text-[#B91C1C] text-xs font-medium rounded-lg px-4 py-2.5">
            {authError}
          </div>
        </div>
      )}

      <div className="flex-1">
        {activeSection === 'notifications' ? (
          <Suspense
            fallback={
              <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-sm text-[#5E5D59]">
                Loading Notifications...
              </div>
            }
          >
            <NotificationsView
              allVideos={allVideos}
              followingIds={followingIds}
              hasCreatorPass={hasCreatorPass}
              onJumpToStory={handleJumpToStory}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
              onMarkRead={() => {
                const nextMs = markAllNotificationsReadNow(latestNotificationMs);
                setNotifLastReadMs((prev) => Math.max(prev, nextMs));
              }}
            />
          </Suspense>
        ) : activeSection === 'dashboard' ? (
          <Suspense
            fallback={
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-sm text-[#5E5D59]">
                Loading Studio...
              </div>
            }
          >
            <DashboardView
              allVideos={allVideos}
              roundVideos={roundVideos}
              savedVideoIds={savedVideoIds}
              activePass={activeCreatorPass}
              hasCreatorPass={hasCreatorPass}
              profileViewers={profileViewers}
              followingCount={followingIds.size}
              initialTab={dashboardInitialTab}
              tabNonce={dashboardTabNonce}
              onUploadStory={handleRequestUpload}
              onToggleSaved={(videoId) => void handleToggleSavedVideo(videoId)}
              onOpenSubscribe={() => void handleOpenSubscribe()}
              onCancelPass={handleCancelCreatorPass}
              onJumpToStory={handleJumpToStory}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
              onNotify={showToast}
            />
          </Suspense>
        ) : (
          <Suspense
            fallback={
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-sm text-[#5E5D59]">
                Loading African Stories...
              </div>
            }
          >
            <VideosArenaView
              roundVideos={roundVideos}
              allVideos={allVideos}
              videosLoading={videosLoading}
              mode={activeSection === 'following' ? 'following' : 'home'}
              verifiedBadges={verifiedBadges}
              followingIds={followingIds}
              hasCreatorPass={hasCreatorPass}
              savedVideoIds={savedVideoIds}
              onToggleFollow={(target) => void handleToggleFollow(target)}
              onToggleSaved={(videoId) => void handleToggleSavedVideo(videoId)}
              onOpenSubscribe={() => void handleOpenSubscribe()}
              onOpenDashboardLeaderboard={handleOpenDashboardLeaderboard}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
              onNotify={showToast}
              uploadRequestedNonce={videoUploadNonce}
              deepLinkVideoId={deepLinkVideoId}
              onClearDeepLink={() => {
                setDeepLinkVideoId(null);
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('story');
                  if (url.hash.startsWith('#video=')) url.hash = '';
                  window.history.replaceState({}, '', url.toString());
                }
              }}
            />
          </Suspense>
        )}
      </div>

      <footer className="hidden md:block border-t border-[#E7E5E0] bg-[#FAF9F7] mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5E5D59]">
          <p className="font-medium text-[#141413]">MoodSpace Africa</p>
          <p>
            Pan-African video storytelling, community votes, and Creator Pass membership via Paystack.
          </p>
        </div>
      </footer>

      {viewingProfileUid && (
        <Suspense fallback={null}>
          <UserProfileModal
            profileUid={viewingProfileUid}
            allVideos={allVideos}
            verifiedBadges={verifiedBadges}
            followingIds={followingIds}
            hasCreatorPass={hasCreatorPass}
            onClose={() => setViewingProfileUid(null)}
            onSelectProfile={(uid) => setViewingProfileUid(uid)}
            onToggleFollow={(target) => void handleToggleFollow(target)}
            onOpenSubscribe={() => void handleOpenSubscribe()}
            onJumpToStory={handleJumpToStory}
            onOpenEditProfile={() => {
              setDashboardInitialTab('profile');
              setDashboardTabNonce((n) => n + 1);
              setActiveSection('dashboard');
            }}
          />
        </Suspense>
      )}

      {subscribeModalOpen && (
        <PaystackCheckoutModal
          onClose={() => setSubscribeModalOpen(false)}
          onConfirm={handleConfirmPaystackSubscribe}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 text-xs font-semibold text-white bg-[#141413] rounded-lg shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <MoodSpaceShell />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
