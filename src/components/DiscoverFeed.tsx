import { BadgeCheck, Bookmark, Search, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { FollowTargetSummary } from '../services/firestoreService';
import type { MediaFormat, Post, PostCategory, VerifiedBadgeInfo } from '../types';
import { PostCard } from './PostCard';

type FeedSortMode = 'latest' | 'popular';

interface DiscoverFeedProps {
  posts: Post[];
  loading: boolean;
  verifiedBadges: Record<string, VerifiedBadgeInfo>;
  savedPostIds: Set<string>;
  followingIds: Set<string>;
  initialCategory?: 'all' | PostCategory;
  highlightedPostId: string | null;
  onOpenComposer: () => void;
  onOpenDashboard: () => void;
  onOpenForm: (post: Post) => void;
  onToggleSaved: (postId: string) => void;
  onToggleFollow: (target: FollowTargetSummary) => void;
  onViewProfile: (uid: string) => void;
  onNotify: (message: string) => void;
}

export function DiscoverFeed({
  posts,
  loading,
  verifiedBadges,
  savedPostIds,
  followingIds,
  initialCategory = 'all',
  highlightedPostId,
  onOpenComposer,
  onOpenDashboard,
  onOpenForm,
  onToggleSaved,
  onToggleFollow,
  onViewProfile,
  onNotify,
}: DiscoverFeedProps) {
  const { user, authBusy, signInWithGoogle } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState<'all' | PostCategory>(initialCategory);
  const [formatFilter, setFormatFilter] = useState<'all' | MediaFormat>('all');
  const [sortMode, setSortMode] = useState<FeedSortMode>('latest');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setCategoryFilter(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    if (!user) {
      if (savedOnly) setSavedOnly(false);
      if (followingOnly) setFollowingOnly(false);
    }
  }, [user, savedOnly, followingOnly]);

  const filteredPosts = useMemo(() => {
    const terms = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = posts.filter((post) => {
      if (categoryFilter !== 'all' && post.category !== categoryFilter) return false;
      if (formatFilter !== 'all' && post.mediaFormat !== formatFilter) return false;
      if (verifiedOnly && !verifiedBadges[post.authorId]) return false;
      if (savedOnly && !savedPostIds.has(post.id)) return false;
      if (followingOnly && !followingIds.has(post.authorId)) return false;
      if (terms.length === 0) return true;
      const haystack = [
        post.title,
        post.content,
        post.authorName,
        post.authorLocation,
        post.eventLocation,
        post.promoCode,
        post.category,
      ]
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });

    if (sortMode === 'popular') {
      return [...filtered].sort((a, b) => {
        const scoreA = a.likesCount + a.commentsCount * 2 + a.sharesCount * 2;
        const scoreB = b.likesCount + b.commentsCount * 2 + b.sharesCount * 2;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
      });
    }

    return filtered;
  }, [
    posts,
    categoryFilter,
    formatFilter,
    verifiedOnly,
    savedOnly,
    followingOnly,
    verifiedBadges,
    savedPostIds,
    followingIds,
    searchQuery,
    sortMode,
  ]);

  const hasActiveFilters =
    categoryFilter !== 'all' ||
    formatFilter !== 'all' ||
    verifiedOnly ||
    savedOnly ||
    followingOnly ||
    Boolean(searchQuery.trim());

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-7">
      {/* Top Feed Search Bar */}
      <section aria-label="Search posts" className="bg-white border border-[#E7E5E0] rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#5E5D59] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search posts by keywords or creator names"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  document
                    .getElementById('discover-stream')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              placeholder="Search keywords, creator names, Accra, promos, or events..."
              className="w-full pl-10 pr-9 py-2.5 text-sm bg-[#FAF9F7] border border-[#D4D1CA] rounded-xl text-[#141413] placeholder:text-[#5E5D59] focus:outline-none focus:border-[#0E7C5B] focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="p-1 text-[#5E5D59] hover:text-[#141413] absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-[#5E5D59] shrink-0 px-1">
            <span className="tabular-nums font-medium">
              {loading
                ? 'Syncing feed...'
                : `${filteredPosts.length} ${filteredPosts.length === 1 ? 'post' : 'posts'}${
                    hasActiveFilters ? ` of ${posts.length}` : ''
                  }`}
            </span>
            {searchQuery.trim() && initialCategory === 'all' && (
              <a
                href="#discover-stream"
                className="font-semibold text-[#0E7C5B] hover:underline whitespace-nowrap"
              >
                View results
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Split Hero Section */}
      {initialCategory === 'all' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-[#E7E5E0] rounded-2xl p-6 sm:p-8">
          <div className="lg:col-span-6 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <p className="text-xs font-semibold text-[#0E7C5B]">
                Ghana &amp; Pan-African Creator &amp; Business Feed
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#141413] leading-[1.1] text-balance">
                Announcements, events, and promos built for Ghana &amp; Africa.
              </h1>
              <p className="text-base text-[#5E5D59] leading-relaxed max-w-xl">
                Join to share real updates in text, photo, video, or mixed formats. Like, comment,
                share, attach optional custom forms, and submit identity proof to earn a verified
                creator or business badge.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={onOpenComposer}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Publish an Update
                  </button>
                  <button
                    type="button"
                    onClick={onOpenDashboard}
                    className="px-4 py-2.5 text-sm font-medium text-[#141413] border border-[#D4D1CA] rounded-lg hover:border-[#141413] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Verification &amp; Dashboard
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => void signInWithGoogle()}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {authBusy ? 'Signing In...' : 'Join with Google'}
                  </button>
                  <a
                    href="#discover-stream"
                    className="px-4 py-2.5 text-sm font-medium text-[#141413] border border-[#D4D1CA] rounded-lg hover:border-[#141413] transition-colors whitespace-nowrap"
                  >
                    Browse Feed
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-64 sm:h-80 lg:h-full rounded-xl overflow-hidden border border-[#E7E5E0] bg-[#FAF9F7]">
              <img
                src="/assets/aistudio/99bc11007403730_dbb0dfe7.jpg"
                alt="Panelists and audience at the Africa Tech Festival discussing Africa's digital future"
                referrerPolicy="no-referrer"
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>
      )}

      {/* Filter & Sort Toolbar */}
      <section
        id="discover-stream"
        className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E7E5E0]"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-white border border-[#E7E5E0] rounded-lg overflow-x-auto">
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
            <option value="all">All Media</option>
            <option value="text">Text Only</option>
            <option value="photo">Photo</option>
            <option value="video">Video</option>
            <option value="mix">Mixed Media</option>
          </select>

          <select
            aria-label="Sort posts"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as FeedSortMode)}
            className="px-3 py-2 text-xs font-semibold bg-white border border-[#E7E5E0] rounded-lg text-[#141413] focus:outline-none focus:border-[#0E7C5B]"
          >
            <option value="latest">Latest First</option>
            <option value="popular">Most Engaged</option>
          </select>

          <button
            type="button"
            onClick={() => setVerifiedOnly(!verifiedOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              verifiedOnly
                ? 'bg-[#0E7C5B] text-white border-[#0E7C5B]'
                : 'bg-white text-[#5E5D59] border-[#E7E5E0] hover:text-[#141413]'
            }`}
          >
            <BadgeCheck className="w-3.5 h-3.5" />
            <span>Verified Only</span>
          </button>

          {user && (
            <>
              <button
                type="button"
                onClick={() => setFollowingOnly(!followingOnly)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  followingOnly
                    ? 'bg-[#0E7C5B] text-white border-[#0E7C5B]'
                    : 'bg-white text-[#5E5D59] border-[#E7E5E0] hover:text-[#141413]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Following ({followingIds.size})</span>
              </button>

              <button
                type="button"
                onClick={() => setSavedOnly(!savedOnly)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  savedOnly
                    ? 'bg-[#141413] text-white border-[#141413]'
                    : 'bg-white text-[#5E5D59] border-[#E7E5E0] hover:text-[#141413]'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Saved ({savedPostIds.size})</span>
              </button>
            </>
          )}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('all');
              setFormatFilter('all');
              setVerifiedOnly(false);
              setSavedOnly(false);
              setFollowingOnly(false);
              setSearchQuery('');
            }}
            className="text-xs font-semibold text-[#0E7C5B] hover:underline whitespace-nowrap cursor-pointer"
          >
            Clear All Filters
          </button>
        )}
      </section>

      {/* Feed Stream */}
      <section className="max-w-3xl mx-auto space-y-6">
        {loading ? (
          <div className="bg-white border border-[#E7E5E0] rounded-2xl p-6 space-y-4 animate-pulse">
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
        ) : filteredPosts.length === 0 ? (
          <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 sm:p-10 text-center space-y-4">
            {posts.length === 0 && !hasActiveFilters ? (
              <>
                <h2 className="font-display text-xl font-bold text-[#141413]">
                  The community feed is ready for the first post
                </h2>
                <p className="text-sm text-[#5E5D59] max-w-md mx-auto">
                  Every member who joins can publish announcements, events, or promos with full
                  Like, Comment, Share, Bookmark, and optional custom forms.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  {user ? (
                    <button
                      type="button"
                      onClick={onOpenComposer}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] cursor-pointer"
                    >
                      Publish First Post
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={authBusy}
                      onClick={() => void signInWithGoogle()}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-60 cursor-pointer"
                    >
                      {authBusy ? 'Signing In...' : 'Join with Google to Post'}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="font-display text-xl font-bold text-[#141413]">
                  No matching posts found
                </h2>
                <p className="text-sm text-[#5E5D59] max-w-md mx-auto">
                  Try clearing your search or switching category, verified, saved, and media
                  filters.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('all');
                      setFormatFilter('all');
                      setVerifiedOnly(false);
                      setSavedOnly(false);
                      setFollowingOnly(false);
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-[#141413] border border-[#D4D1CA] rounded-lg hover:border-[#141413] cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              verifiedBadges={verifiedBadges}
              isSaved={savedPostIds.has(post.id)}
              isFollowingAuthor={followingIds.has(post.authorId)}
              isHighlighted={highlightedPostId === post.id}
              onOpenForm={onOpenForm}
              onToggleSaved={onToggleSaved}
              onToggleFollow={onToggleFollow}
              onViewProfile={onViewProfile}
              onNotify={onNotify}
            />
          ))
        )}
      </section>
    </main>
  );
}
