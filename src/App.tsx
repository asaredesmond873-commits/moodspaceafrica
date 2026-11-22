import { Timestamp } from 'firebase/firestore';
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { DiscoverFeed } from './components/DiscoverFeed';
import { TopBar, type NavSection } from './components/TopBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  subscribePublicPosts,
  subscribeSavedPostIds,
  subscribeVerifiedProfiles,
  toggleSavedPost,
} from './services/firestoreService';
import type { Post, PostCategory, VerifiedBadgeInfo } from './types';

const DashboardView = lazy(() =>
  import('./components/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const PostComposerModal = lazy(() =>
  import('./components/PostComposerModal').then((m) => ({ default: m.PostComposerModal }))
);
const FormFillModal = lazy(() =>
  import('./components/FormFillModal').then((m) => ({ default: m.FormFillModal }))
);

const FEED_CACHE_KEY = 'moodspace_public_feed_cache_v3';

interface CachedPost extends Omit<Post, 'createdAt' | 'updatedAt'> {
  createdAtSec: number | null;
  updatedAtSec: number | null;
}

function readCachedFeed(): Post[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedPost[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      createdAt: item.createdAtSec ? new Timestamp(item.createdAtSec, 0) : null,
      updatedAt: item.updatedAtSec ? new Timestamp(item.updatedAtSec, 0) : null,
    }));
  } catch {
    return [];
  }
}

function writeCachedFeed(posts: Post[]) {
  if (typeof window === 'undefined') return;
  try {
    const slim: CachedPost[] = posts.slice(0, 15).map((p) => ({
      ...p,
      authorAvatar: p.authorAvatar.startsWith('data:') ? '' : p.authorAvatar,
      photoUrl: p.photoUrl.startsWith('data:') && p.photoUrl.length > 60000 ? '' : p.photoUrl,
      createdAtSec: p.createdAt ? p.createdAt.seconds : null,
      updatedAtSec: p.updatedAt ? p.updatedAt.seconds : null,
    }));
    window.localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(slim));
  } catch {
    // Ignore storage quota errors
  }
}

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
  const { user, signInWithGoogle, authError } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('discover');
  const [posts, setPosts] = useState<Post[]>(() => readCachedFeed());
  const [feedLoading, setFeedLoading] = useState(() => posts.length === 0);
  const [verifiedBadges, setVerifiedBadges] = useState<Record<string, VerifiedBadgeInfo>>({});
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(() => new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [formPost, setFormPost] = useState<Post | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#post=')) {
      const targetId = hash.replace('#post=', '').trim();
      if (targetId) setHighlightedPostId(targetId);
    }
  }, []);

  useEffect(() => {
    const unsubPosts = subscribePublicPosts(
      (list) => {
        setPosts(list);
        writeCachedFeed(list);
        setFeedLoading(false);
      },
      () => {
        setFeedLoading(false);
      }
    );
    const unsubBadges = subscribeVerifiedProfiles(setVerifiedBadges, () => {});
    return () => {
      unsubPosts();
      unsubBadges();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setSavedPostIds(new Set());
      return;
    }
    const unsub = subscribeSavedPostIds(user.uid, setSavedPostIds, () => {});
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!highlightedPostId || feedLoading) return;
    const el = document.getElementById(`post-${highlightedPostId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedPostId, feedLoading, posts.length]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((current) => (current === msg ? null : current));
    }, 3200);
  };

  const handleOpenCreate = async () => {
    if (!user) {
      const signed = await signInWithGoogle();
      if (!signed) return;
    }
    setEditingPost(null);
    setComposerOpen(true);
  };

  const handleEditPost = (post: Post) => {
    setEditingPost(post);
    setComposerOpen(true);
  };

  const handleToggleSaved = async (postId: string) => {
    let uid = user?.uid;
    if (!uid) {
      const signed = await signInWithGoogle();
      if (!signed) return;
      uid = signed.uid;
    }
    const currentlySaved = savedPostIds.has(postId);
    setSavedPostIds((prev) => {
      const next = new Set(prev);
      if (currentlySaved) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
    try {
      await toggleSavedPost(postId, uid, currentlySaved);
      showToast(currentlySaved ? 'Removed from saved posts' : 'Saved to your bookmarks');
    } catch {
      setSavedPostIds((prev) => {
        const next = new Set(prev);
        if (currentlySaved) {
          next.add(postId);
        } else {
          next.delete(postId);
        }
        return next;
      });
      showToast('Could not update saved bookmark.');
    }
  };

  const initialCategory: 'all' | PostCategory =
    activeSection === 'events'
      ? 'event'
      : activeSection === 'promos'
        ? 'promo'
        : 'all';

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F7] text-[#141413]">
      <TopBar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          setActiveSection(sec);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenComposer={() => void handleOpenCreate()}
      />

      {authError && (
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="bg-red-50 border border-red-200 text-[#B91C1C] text-xs font-medium rounded-lg px-4 py-2.5">
            {authError}
          </div>
        </div>
      )}

      <div className="flex-1">
        {activeSection === 'dashboard' ? (
          <Suspense
            fallback={
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-sm text-[#5E5D59]">
                Loading dashboard...
              </div>
            }
          >
            <DashboardView
              onCreatePost={() => void handleOpenCreate()}
              onEditPost={handleEditPost}
              onNotify={showToast}
            />
          </Suspense>
        ) : (
          <DiscoverFeed
            posts={posts}
            loading={feedLoading}
            verifiedBadges={verifiedBadges}
            savedPostIds={savedPostIds}
            initialCategory={initialCategory}
            highlightedPostId={highlightedPostId}
            onOpenComposer={() => void handleOpenCreate()}
            onOpenDashboard={() => setActiveSection('dashboard')}
            onOpenForm={(post) => setFormPost(post)}
            onToggleSaved={(postId) => void handleToggleSaved(postId)}
            onNotify={showToast}
          />
        )}
      </div>

      <footer className="border-t border-[#E7E5E0] bg-[#FAF9F7] mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5E5D59]">
          <p className="font-medium text-[#141413]">MoodSpace Africa</p>
          <p>
            Announcements, events, promos, and community forms across Ghana &amp; Africa.
          </p>
        </div>
      </footer>

      {composerOpen && (
        <Suspense fallback={null}>
          <PostComposerModal
            isOpen={composerOpen}
            editingPost={editingPost}
            onClose={() => {
              setComposerOpen(false);
              setEditingPost(null);
            }}
            onSaved={showToast}
          />
        </Suspense>
      )}

      {formPost && (
        <Suspense fallback={null}>
          <FormFillModal
            post={formPost}
            onClose={() => setFormPost(null)}
            onSubmitted={showToast}
          />
        </Suspense>
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
