import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MoMoCheckoutModal, type CheckoutTarget } from './components/MoMoCheckoutModal';
import { TopBar, type NavSection } from './components/TopBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  activateChallengeBoost,
  cancelCreatorSubscription,
  subscribeAllChallengeVideos,
  subscribeChallengeVideos,
  subscribeMySubscriptions,
  subscribeSavedVideoIds,
  toggleSavedVideo,
  upsertCreatorSubscription,
} from './services/challengeService';
import {
  subscribeMyFollowingIds,
  subscribeVerifiedProfiles,
  toggleFollowUser,
  type FollowTargetSummary,
} from './services/firestoreService';
import {
  SUBSCRIPTION_PLANS,
  type ChallengeVideo,
  type CreatorSubscription,
  type MoMoProvider,
  type VerifiedBadgeInfo,
} from './types';
import { getCurrentChallengeRound } from './utils/challengeMedia';

const VideosArenaView = lazy(() =>
  import('./components/VideosArenaView').then((m) => ({ default: m.VideosArenaView }))
);
const SubscriptionsView = lazy(() =>
  import('./components/SubscriptionsView').then((m) => ({ default: m.SubscriptionsView }))
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

function MoodSpaceShell() {
  const { user, profile, signInWithGoogle, authError } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('stories');
  const round = useMemo(() => getCurrentChallengeRound(), []);

  const [roundVideos, setRoundVideos] = useState<ChallengeVideo[]>([]);
  const [allVideos, setAllVideos] = useState<ChallengeVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [verifiedBadges, setVerifiedBadges] = useState<Record<string, VerifiedBadgeInfo>>({});
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(() => new Set());
  const [mySubscriptions, setMySubscriptions] = useState<CreatorSubscription[]>([]);

  const [viewingProfileUid, setViewingProfileUid] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [videoUploadNonce, setVideoUploadNonce] = useState(0);

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
      setSavedVideoIds(new Set());
      setMySubscriptions([]);
      return;
    }
    const unsubFollowing = subscribeMyFollowingIds(user.uid, setFollowingIds, () => {});
    const unsubSaved = subscribeSavedVideoIds(user.uid, setSavedVideoIds, () => {});
    const unsubSubs = subscribeMySubscriptions(user.uid, setMySubscriptions, () => {});
    return () => {
      unsubFollowing();
      unsubSaved();
      unsubSubs();
    };
  }, [user]);

  const now = Date.now();
  const activeSubs = useMemo(
    () => mySubscriptions.filter((s) => s.status === 'active' && s.expiresAt > now),
    [mySubscriptions, now]
  );

  const hasProSubscription = useMemo(
    () =>
      activeSubs.some(
        (s) => s.planType === 'creator_pro' && s.targetId === SUBSCRIPTION_PLANS.PRO_TARGET_ID
      ),
    [activeSubs]
  );

  const subscribedTargetIds = useMemo(
    () => new Set(activeSubs.filter((s) => s.planType === 'creator_fan').map((s) => s.targetId)),
    [activeSubs]
  );

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

  const handleOpenBoost = async (video: ChallengeVideo) => {
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
    }
    setCheckoutTarget({ mode: 'boost', video });
  };

  const handleStartSubscription = async (input: {
    planType: 'creator_fan' | 'creator_pro';
    targetId: string;
    targetName: string;
    targetSubtitle?: string;
  }) => {
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
    }
    setCheckoutTarget({
      mode: 'subscription',
      ...input,
    });
  };

  const handleConfirmCheckout = async (provider: MoMoProvider, phone: string) => {
    if (!checkoutTarget) return;
    let activeProfile = profile;
    if (!user || !activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) throw new Error('Please sign in first.');
    }

    if (checkoutTarget.mode === 'boost') {
      await activateChallengeBoost(checkoutTarget.video.id, activeProfile.uid, provider, phone);
      showToast(`Boosted "${checkoutTarget.video.title}" for 24 hours via ${provider}!`);
    } else {
      await upsertCreatorSubscription({
        subscriber: activeProfile,
        targetId: checkoutTarget.targetId,
        targetName: checkoutTarget.targetName,
        planType: checkoutTarget.planType,
        provider,
        rawPhone: phone,
      });
      showToast(`Subscribed to ${checkoutTarget.targetName} via ${provider}!`);
    }
  };

  const handleCancelSubscription = async (subId: string) => {
    try {
      await cancelCreatorSubscription(subId);
      showToast('Subscription cancelled.');
    } catch {
      showToast('Could not cancel subscription.');
    }
  };

  const handleJumpToStory = (videoId: string) => {
    setActiveSection('stories');
    window.setTimeout(() => {
      const el = document.getElementById(`video-reel-${videoId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleRequestUpload = () => {
    if (activeSection !== 'stories') {
      setActiveSection('stories');
    }
    setVideoUploadNonce((n) => n + 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F7] text-[#141413]">
      <TopBar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          setActiveSection(sec);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenVideoUpload={handleRequestUpload}
      />

      {authError && (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="bg-red-50 border border-red-200 text-[#B91C1C] text-xs font-medium rounded-lg px-4 py-2.5">
            {authError}
          </div>
        </div>
      )}

      <div className="flex-1">
        {activeSection === 'subscriptions' ? (
          <Suspense
            fallback={
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-sm text-[#5E5D59]">
                Loading Subscriptions...
              </div>
            }
          >
            <SubscriptionsView
              allVideos={allVideos}
              mySubscriptions={mySubscriptions}
              verifiedBadges={verifiedBadges}
              onStartSubscription={(input) => void handleStartSubscription(input)}
              onCancelSubscription={handleCancelSubscription}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
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
              mySubscriptions={mySubscriptions}
              hasProSubscription={hasProSubscription}
              followingCount={followingIds.size}
              onUploadStory={handleRequestUpload}
              onBoostVideo={(video) => void handleOpenBoost(video)}
              onToggleSaved={(videoId) => void handleToggleSavedVideo(videoId)}
              onOpenSubscriptionsPage={() => setActiveSection('subscriptions')}
              onUpgradePro={() =>
                void handleStartSubscription({
                  planType: 'creator_pro',
                  targetId: SUBSCRIPTION_PLANS.PRO_TARGET_ID,
                  targetName: SUBSCRIPTION_PLANS.PRO_TARGET_NAME,
                  targetSubtitle: 'Pro Storyteller badge · Priority African discovery · Analytics',
                })
              }
              onCancelSubscription={handleCancelSubscription}
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
              initialViewMode={activeSection === 'leaderboard' ? 'leaderboard' : 'stories'}
              verifiedBadges={verifiedBadges}
              followingIds={followingIds}
              subscribedTargetIds={subscribedTargetIds}
              hasProSubscription={hasProSubscription}
              savedVideoIds={savedVideoIds}
              onToggleFollow={(target) => void handleToggleFollow(target)}
              onToggleSaved={(videoId) => void handleToggleSavedVideo(videoId)}
              onOpenBoost={(video) => void handleOpenBoost(video)}
              onSubscribeCreator={(creatorId, creatorName, location) =>
                void handleStartSubscription({
                  planType: 'creator_fan',
                  targetId: creatorId,
                  targetName: creatorName,
                  targetSubtitle: `${location} · Monthly Fan Pass`,
                })
              }
              onOpenSubscriptionsPage={() => setActiveSection('subscriptions')}
              onViewProfile={(uid) => setViewingProfileUid(uid)}
              onNotify={showToast}
              uploadRequestedNonce={videoUploadNonce}
            />
          </Suspense>
        )}
      </div>

      <footer className="border-t border-[#E7E5E0] bg-[#FAF9F7] mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5E5D59]">
          <p className="font-medium text-[#141413]">MoodSpace Africa</p>
          <p>
            Pan-African video storytelling, community support, story boosts, and creator subscriptions.
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
            subscribedTargetIds={subscribedTargetIds}
            onClose={() => setViewingProfileUid(null)}
            onSelectProfile={(uid) => setViewingProfileUid(uid)}
            onToggleFollow={(target) => void handleToggleFollow(target)}
            onSubscribeCreator={(creatorId, creatorName, location) =>
              void handleStartSubscription({
                planType: 'creator_fan',
                targetId: creatorId,
                targetName: creatorName,
                targetSubtitle: `${location} · Monthly Fan Pass`,
              })
            }
            onJumpToStory={handleJumpToStory}
            onOpenEditProfile={() => setActiveSection('dashboard')}
          />
        </Suspense>
      )}

      {checkoutTarget && (
        <MoMoCheckoutModal
          target={checkoutTarget}
          onClose={() => setCheckoutTarget(null)}
          onConfirm={handleConfirmCheckout}
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
