import { Component, useEffect, useState, type ReactNode } from 'react';
import { DashboardView } from './components/DashboardView';
import { DiscoverFeed } from './components/DiscoverFeed';
import { FormFillModal } from './components/FormFillModal';
import { PostComposerModal } from './components/PostComposerModal';
import { TopBar, type NavSection } from './components/TopBar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { subscribePublicPosts } from './services/firestoreService';
import type { Post, PostCategory } from './types';

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
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
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
    setFeedLoading(true);
    const unsub = subscribePublicPosts(
      (list) => {
        setPosts(list);
        setFeedLoading(false);
      },
      () => {
        setFeedLoading(false);
      }
    );
    return () => unsub();
  }, []);

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
          <DashboardView
            onCreatePost={() => void handleOpenCreate()}
            onEditPost={handleEditPost}
            onNotify={showToast}
          />
        ) : (
          <DiscoverFeed
            posts={posts}
            loading={feedLoading}
            initialCategory={initialCategory}
            highlightedPostId={highlightedPostId}
            onOpenComposer={() => void handleOpenCreate()}
            onOpenForm={(post) => setFormPost(post)}
            onNotify={showToast}
          />
        )}
      </div>

      <footer className="border-t border-[#E7E5E0] bg-[#FAF9F7] mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5E5D59]">
          <p className="font-medium text-[#141413]">MoodSpace Africa</p>
          <p>
            Announcements, events, promos, and community forms across Africa.
          </p>
        </div>
      </footer>

      <PostComposerModal
        isOpen={composerOpen}
        editingPost={editingPost}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
        }}
        onSaved={showToast}
      />

      <FormFillModal
        post={formPost}
        onClose={() => setFormPost(null)}
        onSubmitted={showToast}
      />

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
