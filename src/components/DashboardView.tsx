import {
  BarChart3,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  deleteFormSubmission,
  deletePost,
  deletePostComment,
  fetchPostSubmissions,
  subscribePostComments,
  subscribeUserPosts,
  togglePostFormOpen,
  togglePostVisibility,
  updateUserProfile,
} from '../services/firestoreService';
import {
  type AccountType,
  AFRICAN_CITIES,
  type FormSubmission,
  type Post,
  type PostComment,
  SCHEMA_LIMITS,
} from '../types';
import {
  compressImageFile,
  downloadSubmissionsCsv,
  formatFullDate,
  formatTimestamp,
} from '../utils/media';

type DashboardTab = 'overview' | 'posts' | 'responses' | 'profile';

interface DashboardViewProps {
  onCreatePost: () => void;
  onEditPost: (post: Post) => void;
  onNotify: (message: string) => void;
}

export function DashboardView({
  onCreatePost,
  onEditPost,
  onNotify,
}: DashboardViewProps) {
  const { user, profile, authReady, authBusy, signInWithGoogle, logout, setLocalProfile } =
    useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  // Content & interaction moderation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [moderatingPostId, setModeratingPostId] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<PostComment[]>([]);

  // Form responses state
  const [selectedFormPostId, setSelectedFormPostId] = useState<string>('');
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subSearch, setSubSearch] = useState('');

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('Lagos, Nigeria');
  const [accountType, setAccountType] = useState<AccountType>('creator');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setLocation(profile.location || 'Lagos, Nigeria');
    setAccountType(profile.accountType);
    setAvatarUrl(profile.avatarUrl);
  }, [profile]);

  useEffect(() => {
    if (!user) {
      setMyPosts([]);
      setPostsLoading(false);
      return;
    }
    setPostsLoading(true);
    const unsub = subscribeUserPosts(
      user.uid,
      (list) => {
        setMyPosts(list);
        setPostsLoading(false);
      },
      () => {
        setPostsLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!moderatingPostId) {
      setPostComments([]);
      return;
    }
    const unsub = subscribePostComments(moderatingPostId, setPostComments);
    return () => unsub();
  }, [moderatingPostId]);

  const postsWithForms = useMemo(() => myPosts.filter((p) => p.hasForm), [myPosts]);

  useEffect(() => {
    if (postsWithForms.length > 0 && !postsWithForms.some((p) => p.id === selectedFormPostId)) {
      setSelectedFormPostId(postsWithForms[0].id);
    } else if (postsWithForms.length === 0) {
      setSelectedFormPostId('');
      setSubmissions([]);
    }
  }, [postsWithForms, selectedFormPostId]);

  useEffect(() => {
    if (!user || !selectedFormPostId) return;
    let active = true;
    setLoadingSubs(true);
    void fetchPostSubmissions(selectedFormPostId, user.uid)
      .then((rows) => {
        if (active) setSubmissions(rows);
      })
      .catch(() => {
        if (active) setSubmissions([]);
      })
      .finally(() => {
        if (active) setLoadingSubs(false);
      });
    return () => {
      active = false;
    };
  }, [user, selectedFormPostId]);

  const metrics = useMemo(() => {
    return myPosts.reduce(
      (acc, p) => ({
        posts: acc.posts + 1,
        likes: acc.likes + p.likesCount,
        comments: acc.comments + p.commentsCount,
        shares: acc.shares + p.sharesCount,
        submissions: acc.submissions + p.submissionsCount,
      }),
      { posts: 0, likes: 0, comments: 0, shares: 0, submissions: 0 }
    );
  }, [myPosts]);

  const selectedFormPost = useMemo(
    () => postsWithForms.find((p) => p.id === selectedFormPostId) || null,
    [postsWithForms, selectedFormPostId]
  );

  const filteredSubmissions = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((sub) => {
      if (sub.submitterName.toLowerCase().includes(q)) return true;
      return Object.values(sub.answers).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [submissions, subSearch]);

  if (!authReady) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 text-center text-sm text-[#5E5D59]">
        Loading your workspace...
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 sm:p-10 text-center space-y-5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#141413]">
            Creator &amp; Business Dashboard
          </h1>
          <p className="text-sm sm:text-base text-[#5E5D59] leading-relaxed">
            Sign in with Google to manage your public name and bio, publish announcements,
            events, and promos, adjust your custom forms, inspect form responses, and moderate
            interactions securely.
          </p>
          <button
            type="button"
            disabled={authBusy}
            onClick={() => void signInWithGoogle()}
            className="px-6 py-3 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-60 cursor-pointer"
          >
            {authBusy ? 'Signing In...' : 'Sign In with Google'}
          </button>
        </div>
      </main>
    );
  }

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateUserProfile(user.uid, {
        displayName,
        bio,
        location,
        accountType,
        avatarUrl,
      });
      setLocalProfile({
        ...profile,
        displayName: displayName.trim() || profile.displayName,
        bio: bio.trim(),
        location: location.trim(),
        accountType,
        avatarUrl,
      });
      onNotify('Profile updated');
    } catch {
      onNotify('Could not save profile changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const compressed = await compressImageFile(file, 360, 110000);
      setAvatarUrl(compressed);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to process avatar image.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deletePost(postId);
      setConfirmDeleteId(null);
      if (moderatingPostId === postId) setModeratingPostId(null);
      onNotify('Post permanently deleted');
    } catch {
      onNotify('Unable to delete post.');
    }
  };

  const handleToggleFormOpen = async (post: Post) => {
    try {
      await togglePostFormOpen(post);
      onNotify(post.formConfig.isOpen ? 'Form paused' : 'Form reopened for responses');
    } catch {
      onNotify('Could not update form status.');
    }
  };

  const handleToggleVisibility = async (post: Post) => {
    try {
      await togglePostVisibility(post);
      onNotify(post.visibility === 'public' ? 'Post archived' : 'Post published to feed');
    } catch {
      onNotify('Could not update visibility.');
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!selectedFormPostId) return;
    try {
      await deleteFormSubmission(selectedFormPostId, submissionId);
      setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
      onNotify('Response removed');
    } catch {
      onNotify('Could not remove response.');
    }
  };

  const sidebarItems: { id: DashboardTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'overview', label: 'Engagements', icon: BarChart3 },
    { id: 'posts', label: 'Manage Content', icon: FileText },
    { id: 'responses', label: 'Form Responses', icon: ClipboardList },
    { id: 'profile', label: 'Profile & Bio', icon: UserCheck },
  ];

  const moderatedPost = myPosts.find((p) => p.id === moderatingPostId) || null;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar Navigation (240px–260px on desktop) */}
        <aside className="w-full lg:w-64 shrink-0 bg-white border border-[#E7E5E0] rounded-2xl p-4 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-[#E7E5E0]">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-full object-cover border border-[#E7E5E0] shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[#141413] text-white text-sm font-semibold flex items-center justify-center shrink-0">
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#141413] truncate">{profile.displayName}</p>
              <p className="text-xs text-[#5E5D59] capitalize truncate">
                {profile.accountType} · {profile.location}
              </p>
            </div>
          </div>

          <nav aria-label="Dashboard sections" className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#141413] text-white'
                      : 'text-[#5E5D59] hover:text-[#141413] hover:bg-[#FAF9F7]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-[#E7E5E0] space-y-2">
            <button
              type="button"
              onClick={onCreatePost}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Post
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-[#5E5D59] hover:text-[#141413] border border-[#E7E5E0] rounded-lg hover:bg-[#FAF9F7] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <section className="flex-1 min-w-0 w-full space-y-6">
          {/* TAB 1: OVERVIEW & ENGAGEMENTS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#141413]">
                  Engagement Overview
                </h1>
                <p className="text-sm text-[#5E5D59] mt-0.5">
                  Real-time reach and community interactions across your posts and forms.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Published Posts', value: metrics.posts },
                  { label: 'Total Likes', value: metrics.likes },
                  { label: 'Comments & Shares', value: metrics.comments + metrics.shares },
                  { label: 'Form Responses', value: metrics.submissions },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white border border-[#E7E5E0] rounded-xl p-4 space-y-1"
                  >
                    <p className="text-xs font-medium text-[#5E5D59]">{stat.label}</p>
                    <p className="font-mono text-2xl font-semibold text-[#141413] tabular-nums">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-[#E7E5E0] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E7E5E0] flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-[#141413]">
                    Post Performance Breakdown
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('posts')}
                    className="text-xs font-semibold text-[#0E7C5B] hover:underline cursor-pointer"
                  >
                    Manage All
                  </button>
                </div>

                {postsLoading ? (
                  <div className="p-6 text-sm text-[#5E5D59]">Loading post metrics...</div>
                ) : myPosts.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <p className="text-sm text-[#5E5D59]">
                      You have not published any posts yet.
                    </p>
                    <button
                      type="button"
                      onClick={onCreatePost}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] cursor-pointer"
                    >
                      Create Your First Post
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E7E5E0] text-xs font-semibold text-[#5E5D59] bg-[#FAF9F7]">
                          <th className="py-2.5 px-4">Post Title</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3 text-right">Likes</th>
                          <th className="py-2.5 px-3 text-right">Comments</th>
                          <th className="py-2.5 px-3 text-right">Shares</th>
                          <th className="py-2.5 px-4 text-right">Forms</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0EEE9] text-sm">
                        {myPosts.map((post) => (
                          <tr key={post.id} className="hover:bg-[#FAF9F7]">
                            <td className="py-3 px-4 font-medium text-[#141413] max-w-xs truncate">
                              {post.title}
                            </td>
                            <td className="py-3 px-3 text-xs text-[#5E5D59] capitalize">
                              {post.category} · {post.visibility}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              {post.likesCount}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              {post.commentsCount}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              {post.sharesCount}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {post.hasForm ? post.submissionsCount : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: MANAGE CONTENT & INTERACTIONS */}
          {activeTab === 'posts' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#141413]">
                    Manage Content &amp; Interactions
                  </h1>
                  <p className="text-sm text-[#5E5D59] mt-0.5">
                    Edit posts, adjust form fields anytime, pause forms, or moderate comments.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCreatePost}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Post
                </button>
              </div>

              {myPosts.length === 0 ? (
                <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center space-y-3">
                  <p className="text-sm text-[#5E5D59]">No posts created yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myPosts.map((post) => (
                    <div
                      key={post.id}
                      className="bg-white border border-[#E7E5E0] rounded-xl p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E5D59]">
                            <span className="font-semibold text-[#0E7C5B] capitalize">
                              {post.category}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{post.mediaFormat}</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">
                              {post.visibility === 'public' ? 'Public' : 'Archived'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatTimestamp(post.createdAt)}</span>
                          </div>
                          <h3 className="font-display text-lg font-bold text-[#141413]">
                            {post.title}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onEditPost(post)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#D4D1CA] rounded-lg text-[#141413] hover:border-[#0E7C5B] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit &amp; Adjust Form
                          </button>

                          {post.hasForm && (
                            <button
                              type="button"
                              onClick={() => handleToggleFormOpen(post)}
                              className="px-3 py-1.5 text-xs font-semibold border border-[#D4D1CA] rounded-lg text-[#141413] hover:border-[#0E7C5B] cursor-pointer"
                            >
                              {post.formConfig.isOpen ? 'Pause Form' : 'Reopen Form'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setModeratingPostId(moderatingPostId === post.id ? null : post.id)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#D4D1CA] rounded-lg text-[#141413] hover:border-[#0E7C5B] cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Comments ({post.commentsCount})
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(post)}
                            title={post.visibility === 'public' ? 'Archive post' : 'Publish post'}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-[#D4D1CA] rounded-lg text-[#5E5D59] hover:text-[#141413] cursor-pointer"
                          >
                            {post.visibility === 'public' ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                Archive
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                Publish
                              </>
                            )}
                          </button>

                          {confirmDeleteId === post.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeletePost(post.id)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] rounded-lg cursor-pointer"
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1.5 text-xs text-[#5E5D59] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(post.id)}
                              aria-label="Delete post"
                              className="p-1.5 text-[#5E5D59] hover:text-[#B91C1C] cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Comment Moderation Drawer */}
                      {moderatingPostId === post.id && moderatedPost && (
                        <div className="pt-3 mt-3 border-t border-[#E7E5E0] space-y-2.5">
                          <p className="text-xs font-semibold text-[#141413]">
                            Comment Moderation
                          </p>
                          {postComments.length === 0 ? (
                            <p className="text-xs text-[#5E5D59]">
                              No comments on this post yet.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {postComments.map((cmt) => (
                                <div
                                  key={cmt.id}
                                  className="flex items-start justify-between gap-3 p-2.5 bg-[#FAF9F7] rounded-lg"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-[#141413]">
                                      {cmt.authorName} ·{' '}
                                      <span className="font-normal text-[#5E5D59]">
                                        {formatTimestamp(cmt.createdAt)}
                                      </span>
                                    </p>
                                    <p className="text-sm text-[#353431] mt-0.5">{cmt.text}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void deletePostComment(moderatedPost, cmt.id).then(() =>
                                        onNotify('Comment removed')
                                      )
                                    }
                                    className="text-xs font-semibold text-[#B91C1C] hover:underline shrink-0 cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FORM RESPONSES */}
          {activeTab === 'responses' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#141413]">
                    Form Responses
                  </h1>
                  <p className="text-sm text-[#5E5D59] mt-0.5">
                    Review and export submissions collected from your posts. Only you can access
                    these responses.
                  </p>
                </div>

                {selectedFormPost && filteredSubmissions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadSubmissionsCsv(selectedFormPost, filteredSubmissions)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#141413] bg-white border border-[#D4D1CA] rounded-lg hover:border-[#0E7C5B] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </button>
                )}
              </div>

              {postsWithForms.length === 0 ? (
                <div className="bg-white border border-[#E7E5E0] rounded-2xl p-8 text-center space-y-3">
                  <p className="text-sm text-[#5E5D59]">
                    None of your posts have an attached form yet. Enable &ldquo;Adjustable Action
                    Form&rdquo; when creating or editing a post.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-[#E7E5E0] rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-[#E7E5E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF9F7]">
                    <select
                      aria-label="Select post form"
                      value={selectedFormPostId}
                      onChange={(e) => setSelectedFormPostId(e.target.value)}
                      className="px-3 py-2 text-sm font-medium bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                    >
                      {postsWithForms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.submissionsCount} responses)
                        </option>
                      ))}
                    </select>

                    <input
                      type="search"
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                      placeholder="Filter responses..."
                      className="px-3 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                    />
                  </div>

                  {loadingSubs ? (
                    <div className="p-6 text-sm text-[#5E5D59]">Loading submissions...</div>
                  ) : filteredSubmissions.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#5E5D59]">
                      No form responses recorded for this post yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E7E5E0] text-xs font-semibold text-[#5E5D59]">
                            <th className="py-2.5 px-4">Submitter</th>
                            <th className="py-2.5 px-3">Date</th>
                            {selectedFormPost?.formConfig.fields.map((field) => (
                              <th key={field.id} className="py-2.5 px-3">
                                {field.label}
                              </th>
                            ))}
                            <th className="py-2.5 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0EEE9] text-sm">
                          {filteredSubmissions.map((sub) => (
                            <tr key={sub.id} className="hover:bg-[#FAF9F7]">
                              <td className="py-3 px-4 font-medium text-[#141413] whitespace-nowrap">
                                {sub.submitterName}
                              </td>
                              <td className="py-3 px-3 text-xs text-[#5E5D59] font-mono tabular-nums whitespace-nowrap">
                                {formatFullDate(sub.createdAt)}
                              </td>
                              {selectedFormPost?.formConfig.fields.map((field) => {
                                const ans = sub.answers[field.id];
                                const display =
                                  typeof ans === 'boolean'
                                    ? ans
                                      ? 'Yes'
                                      : 'No'
                                    : String(ans || '—');
                                return (
                                  <td key={field.id} className="py-3 px-3 text-[#353431]">
                                    {display}
                                  </td>
                                );
                              })}
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubmission(sub.id)}
                                  className="text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PROFILE & BIO */}
          {activeTab === 'profile' && (
            <div className="bg-white border border-[#E7E5E0] rounded-2xl p-6 space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#141413]">
                  Profile &amp; Bio Settings
                </h1>
                <p className="text-sm text-[#5E5D59] mt-0.5">
                  Your public name, location, and bio appear on every post you publish. Your email (
                  {user.email}) remains private.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-5 max-w-xl">
                <div className="flex items-center gap-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover border border-[#E7E5E0]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-[#141413] text-white text-lg font-semibold flex items-center justify-center">
                      {displayName.slice(0, 2).toUpperCase() || 'MS'}
                    </div>
                  )}

                  <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#141413] bg-[#FAF9F7] border border-[#D4D1CA] rounded-lg hover:border-[#0E7C5B] cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5" />
                    {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#5E5D59] mb-1">
                    Display Name or Business Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.DISPLAY_NAME_MAX}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#5E5D59] mb-1">
                      Account Role
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as AccountType)}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                    >
                      <option value="creator">Creator</option>
                      <option value="business">Business</option>
                      <option value="community">Community Organizer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#5E5D59] mb-1">
                      City &amp; Country
                    </label>
                    <input
                      list="african-cities"
                      maxLength={SCHEMA_LIMITS.LOCATION_MAX}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                    />
                    <datalist id="african-cities">
                      {AFRICAN_CITIES.map((city) => (
                        <option key={city} value={city} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#5E5D59]">Bio</label>
                    <span className="text-[11px] font-mono text-[#5E5D59] tabular-nums">
                      {bio.length}/{SCHEMA_LIMITS.BIO_MAX}
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    maxLength={SCHEMA_LIMITS.BIO_MAX}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell people what you create, host, or offer across Africa..."
                    className="w-full px-3.5 py-2 text-sm border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingProfile || uploadingAvatar}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-60 cursor-pointer"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
