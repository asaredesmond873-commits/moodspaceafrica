import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { publishStarterShowcasePosts } from '../services/firestoreService';
import type { MediaFormat, Post, PostCategory } from '../types';
import { PostCard } from './PostCard';

interface DiscoverFeedProps {
  posts: Post[];
  loading: boolean;
  initialCategory?: 'all' | PostCategory;
  highlightedPostId: string | null;
  onOpenComposer: () => void;
  onOpenForm: (post: Post) => void;
  onNotify: (message: string) => void;
}

export function DiscoverFeed({
  posts,
  loading,
  initialCategory = 'all',
  highlightedPostId,
  onOpenComposer,
  onOpenForm,
  onNotify,
}: DiscoverFeedProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState<'all' | PostCategory>(initialCategory);
  const [formatFilter, setFormatFilter] = useState<'all' | MediaFormat>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [seeding, setSeeding] = useState(false);

  // Keep category synced when user switches top nav between Discover, Events, Promos
  const [lastInitial, setLastInitial] = useState(initialCategory);
  if (initialCategory !== lastInitial) {
    setLastInitial(initialCategory);
    setCategoryFilter(initialCategory);
  }

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((post) => {
      if (categoryFilter !== 'all' && post.category !== categoryFilter) return false;
      if (formatFilter !== 'all' && post.mediaFormat !== formatFilter) return false;
      if (!q) return true;
      return (
        post.title.toLowerCase().includes(q) ||
        post.content.toLowerCase().includes(q) ||
        post.authorName.toLowerCase().includes(q) ||
        post.authorLocation.toLowerCase().includes(q) ||
        post.eventLocation.toLowerCase().includes(q)
      );
    });
  }, [posts, categoryFilter, formatFilter, searchQuery]);

  const handleSeedShowcase = async () => {
    let activeProfile = profile;
    if (!user || !activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) return;
    }
    setSeeding(true);
    try {
      await publishStarterShowcasePosts(activeProfile);
      onNotify('Published starter community events, promos, and announcements');
    } catch {
      onNotify('Could not publish starter posts.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      {/* Split Hero Section */}
      {initialCategory === 'all' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-[#E7E5E0] rounded-2xl p-6 sm:p-8">
          <div className="lg:col-span-6 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <p className="text-xs font-semibold text-[#0E7C5B]">
                Pan-African Creator &amp; Business Feed
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#141413] leading-[1.1] text-balance">
                Announcements, events, and promos built for Africa’s communities.
              </h1>
              <p className="text-base text-[#5E5D59] leading-relaxed max-w-xl">
                Share updates in text, photo, video, or mixed formats. Attach adjustable RSVP and
                order forms, connect through comments, and track every interaction from your dashboard.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {user ? (
                <button
                  type="button"
                  onClick={onOpenComposer}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Publish an Update
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Join with Google
                </button>
              )}
              <a
                href="#discover-stream"
                className="px-4 py-2.5 text-sm font-medium text-[#141413] border border-[#D4D1CA] rounded-lg hover:border-[#141413] transition-colors whitespace-nowrap"
              >
                Browse Feed
              </a>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-64 sm:h-80 lg:h-full rounded-xl overflow-hidden border border-[#E7E5E0] bg-[#FAF9F7]">
              <img
                src="/src/assets/images/hero_africa_community_1794838619763.jpg"
                alt="Contemporary African creators and entrepreneurs gathered at an outdoor community market"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>
      )}

      {/* Filter & Search Toolbar */}
      <section
        id="discover-stream"
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E7E5E0]"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-white border border-[#E7E5E0] rounded-lg">
            {(
              [
                { id: 'all', label: 'All Posts' },
                { id: 'announcement', label: 'Announcements' },
                { id: 'event', label: 'Events' },
                { id: 'promo', label: 'Promos' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === tab.id
                    ? 'bg-[#141413] text-white'
                    : 'text-[#5E5D59] hover:text-[#141413]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by media format"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value as 'all' | MediaFormat)}
            className="px-3 py-2 text-xs font-semibold bg-white border border-[#E7E5E0] rounded-lg text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
          >
            <option value="all">All Media Formats</option>
            <option value="text">Text Only</option>
            <option value="photo">Photo</option>
            <option value="video">Video</option>
            <option value="mix">Mixed Media</option>
          </select>
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[#5E5D59] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search city, creator, event, or promo..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-[#E7E5E0] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
          />
        </div>
      </section>

      {/* Feed Stream */}
      <section className="max-w-3xl mx-auto space-y-6">
        {loading ? (
          <div className="space-y-5">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="bg-white border border-[#E7E5E0] rounded-2xl p-6 space-y-4 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#E7E5E0]" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3.5 w-36 bg-[#E7E5E0] rounded" />
                    <div className="h-3 w-52 bg-[#F0EEE9] rounded" />
                  </div>
                </div>
                <div className="h-5 w-3/4 bg-[#E7E5E0] rounded" />
                <div className="h-44 w-full bg-[#F0EEE9] rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 sm:p-10 text-center space-y-4">
            <h2 className="font-display text-xl font-bold text-[#141413]">
              {posts.length === 0
                ? 'Welcome to MoodSpace Africa'
                : 'No matching posts found'}
            </h2>
            <p className="text-sm text-[#5E5D59] max-w-md mx-auto">
              {posts.length === 0
                ? 'Start the community feed by publishing your first announcement, event, or promo—or load a starter showcase of African events and offers.'
                : 'Try clearing your search or switching category and media filters.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {posts.length === 0 ? (
                <>
                  <button
                    type="button"
                    onClick={user ? onOpenComposer : () => void signInWithGoogle()}
                    className="px-4 py-2 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] cursor-pointer"
                  >
                    {user ? 'Create First Post' : 'Sign In to Post'}
                  </button>
                  <button
                    type="button"
                    disabled={seeding}
                    onClick={handleSeedShowcase}
                    className="px-4 py-2 text-sm font-medium text-[#141413] border border-[#D4D1CA] rounded-lg hover:border-[#141413] disabled:opacity-60 cursor-pointer"
                  >
                    {seeding ? 'Publishing Showcase...' : 'Load Starter Community Showcase'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setFormatFilter('all');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-[#141413] border border-[#D4D1CA] rounded-lg hover:border-[#141413] cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isHighlighted={highlightedPostId === post.id}
              onOpenForm={onOpenForm}
              onNotify={onNotify}
            />
          ))
        )}
      </section>
    </main>
  );
}
