import {
  Calendar,
  Camera,
  Check,
  ClipboardList,
  Copy,
  Heart,
  MapPin,
  MessageSquare,
  Share2,
  Tag,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  addPostComment,
  checkUserLikedPost,
  deletePostComment,
  incrementPostShare,
  subscribePostComments,
  togglePostLike,
} from '../services/firestoreService';
import { type Post, type PostComment, SCHEMA_LIMITS } from '../types';
import { formatTimestamp, parseVideoUrl } from '../utils/media';

interface PostCardProps {
  post: Post;
  isHighlighted?: boolean;
  onOpenForm: (post: Post) => void;
  onNotify: (message: string) => void;
}

const CATEGORY_LABEL: Record<Post['category'], string> = {
  announcement: 'Announcement',
  event: 'Event',
  promo: 'Promo',
};

const FORMAT_LABEL: Record<Post['mediaFormat'], string> = {
  text: 'Text',
  photo: 'Photo',
  video: 'Video',
  mix: 'Mixed Media',
};

export function PostCard({
  post,
  isHighlighted = false,
  onOpenForm,
  onNotify,
}: PostCardProps) {
  const { user, profile, signInWithGoogle } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [post.photoUrl]);

  useEffect(() => {
    setAvatarError(false);
  }, [post.authorAvatar]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLiked(false);
      return;
    }
    void checkUserLikedPost(post.id, user.uid)
      .then((res) => {
        if (active) setLiked(res);
      })
      .catch(() => {
        if (active) setLiked(false);
      });
    return () => {
      active = false;
    };
  }, [post.id, user]);

  useEffect(() => {
    if (!commentsOpen) return;
    const unsub = subscribePostComments(post.id, setComments);
    return () => unsub();
  }, [commentsOpen, post.id]);

  const handleLike = async () => {
    if (likeBusy) return;
    let uid = user?.uid;
    if (!uid) {
      const signedProfile = await signInWithGoogle();
      if (!signedProfile) return;
      uid = signedProfile.uid;
    }
    setLikeBusy(true);
    try {
      await togglePostLike(post, uid, liked);
      setLiked(!liked);
    } catch {
      onNotify('Could not update like right now.');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/#post=${post.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onNotify('Post link copied to clipboard');
    } catch {
      onNotify('Share link ready in browser address bar');
    }
    if (user) {
      try {
        await incrementPostShare(post);
      } catch {
        // Silent fallback if offline
      }
    }
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || commentBusy) return;

    let activeProfile = profile;
    if (!user || !activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) return;
    }

    setCommentBusy(true);
    try {
      await addPostComment(post, activeProfile, trimmed);
      setCommentText('');
    } catch {
      onNotify('Unable to post comment.');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deletePostComment(post, commentId);
      onNotify('Comment removed');
    } catch {
      onNotify('Unable to delete comment.');
    }
  };

  const handleCopyPromo = async () => {
    if (!post.promoCode) return;
    try {
      await navigator.clipboard.writeText(post.promoCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      onNotify(`Promo code: ${post.promoCode}`);
    }
  };

  const parsedVideo = post.videoUrl ? parseVideoUrl(post.videoUrl) : null;
  const initials = (post.authorName || 'MS')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const isLongBody = post.content.length > 260;

  return (
    <article
      id={`post-${post.id}`}
      className={`bg-white border rounded-2xl p-5 sm:p-6 transition-colors ${
        isHighlighted
          ? 'border-[#0E7C5B] ring-2 ring-[#0E7C5B]/20'
          : 'border-[#E7E5E0] hover:border-[#D4D1CA]'
      }`}
    >
      {/* Author + Unboxed Metadata Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {post.authorAvatar && !avatarError ? (
            <img
              src={post.authorAvatar}
              alt={post.authorName}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="w-10 h-10 rounded-full object-cover border border-[#E7E5E0] shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#141413] text-white text-xs font-semibold flex items-center justify-center shrink-0">
              {initials}
            </div>
          )}

          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#141413] truncate">
              {post.authorName}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5E5D59]">
              <span className="font-medium text-[#0E7C5B]">{CATEGORY_LABEL[post.category]}</span>
              <span aria-hidden="true">·</span>
              <span>{FORMAT_LABEL[post.mediaFormat]}</span>
              {post.authorLocation && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{post.authorLocation}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{formatTimestamp(post.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Headline & Prose */}
      <div className="mt-4 space-y-2.5">
        <h3 className="font-display text-xl sm:text-2xl font-bold text-[#141413] leading-snug text-balance">
          {post.title}
        </h3>
        <p className="text-[15px] text-[#353431] leading-relaxed whitespace-pre-line">
          {isLongBody && !expanded ? `${post.content.slice(0, 260)}...` : post.content}
        </p>
        {isLongBody && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-semibold text-[#0E7C5B] hover:underline cursor-pointer"
          >
            {expanded ? 'Show less' : 'Read full post'}
          </button>
        )}
      </div>

      {/* Event Details / Promo Offer Strip (clean unboxed hairline rows, no pills) */}
      {(post.eventDate || post.eventLocation || post.promoCode) && (
        <div className="mt-4 pt-3.5 border-t border-[#F0EEE9] flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#353431]">
          {post.eventDate && (
            <div className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#0E7C5B]" />
              <span className="font-medium">{post.eventDate}</span>
            </div>
          )}
          {post.eventLocation && (
            <div className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#0E7C5B]" />
              <span>{post.eventLocation}</span>
            </div>
          )}
          {post.promoCode && (
            <div className="inline-flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-[#C87A19]" />
              <span className="text-[#5E5D59]">Code:</span>
              <code className="font-mono font-semibold text-[#141413] bg-[#FAF9F7] px-2 py-0.5 rounded border border-[#E7E5E0]">
                {post.promoCode}
              </code>
              <button
                type="button"
                onClick={handleCopyPromo}
                className="inline-flex items-center gap-1 text-[#0E7C5B] font-semibold hover:underline cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Photo Media (shown for photo or mix posts, or as fallback when no valid video) */}
      {post.photoUrl && (post.mediaFormat !== 'video' || !parsedVideo || parsedVideo.kind === 'invalid') && (
        <div className="mt-4 rounded-xl overflow-hidden border border-[#E7E5E0] bg-[#FAF9F7] flex items-center justify-center">
          {!imgError ? (
            <img
              src={post.photoUrl}
              alt={post.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full max-h-[560px] object-contain"
            />
          ) : (
            <div className="h-52 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#F3F1EC] to-[#E7E5E0] text-[#5E5D59] px-4 text-center">
              <Camera className="w-7 h-7 opacity-60" />
              <span className="text-xs font-medium">{post.title}</span>
            </div>
          )}
        </div>
      )}

      {/* Video Media */}
      {parsedVideo && parsedVideo.kind !== 'invalid' && (
        <div className="mt-4 rounded-xl overflow-hidden border border-[#E7E5E0] bg-[#141413]">
          {parsedVideo.kind === 'direct' ? (
            <video
              controls
              playsInline
              preload="metadata"
              poster={post.photoUrl || undefined}
              src={parsedVideo.srcUrl}
              className="w-full max-h-[420px]"
            />
          ) : (
            <div className="aspect-video w-full">
              <iframe
                src={parsedVideo.embedUrl}
                title={post.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-5 pt-3.5 border-t border-[#E7E5E0] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            disabled={likeBusy}
            onClick={handleLike}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              liked
                ? 'bg-[#0E7C5B]/10 text-[#0E7C5B]'
                : 'text-[#5E5D59] hover:text-[#141413] hover:bg-[#FAF9F7]'
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-[#0E7C5B]' : ''}`} />
            <span className="tabular-nums">{post.likesCount}</span>
            <span className="hidden sm:inline">Like</span>
          </button>

          <button
            type="button"
            onClick={() => setCommentsOpen(!commentsOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              commentsOpen
                ? 'bg-[#FAF9F7] text-[#141413]'
                : 'text-[#5E5D59] hover:text-[#141413] hover:bg-[#FAF9F7]'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="tabular-nums">{post.commentsCount}</span>
            <span className="hidden sm:inline">Comments</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#5E5D59] hover:text-[#141413] hover:bg-[#FAF9F7] rounded-lg transition-colors cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span className="tabular-nums">{post.sharesCount}</span>
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>

        {post.hasForm && (
          <button
            type="button"
            onClick={() => onOpenForm(post)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              post.formConfig.isOpen
                ? 'bg-[#141413] text-white hover:bg-[#2C2C2A]'
                : 'bg-[#FAF9F7] text-[#5E5D59] border border-[#E7E5E0]'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>{post.formConfig.isOpen ? 'Fill Form' : 'Form Closed'}</span>
            <span className="tabular-nums opacity-75">· {post.submissionsCount}</span>
          </button>
        )}
      </div>

      {/* Expandable Comments Drawer */}
      {commentsOpen && (
        <div className="mt-4 pt-4 border-t border-[#E7E5E0] space-y-4">
          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.COMMENT_MAX}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={
                user ? 'Write a welcoming comment...' : 'Sign in with Google to comment...'
              }
              className="flex-1 px-3.5 py-2 text-sm bg-[#FAF9F7] border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B] focus:bg-white"
            />
            <button
              type="submit"
              disabled={commentBusy || !commentText.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {commentBusy ? 'Posting...' : 'Post'}
            </button>
          </form>

          {comments.length === 0 ? (
            <p className="text-xs text-[#5E5D59]">
              No comments yet. Start the conversation.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => {
                const canDelete =
                  user && (user.uid === comment.authorId || user.uid === post.authorId);
                return (
                  <div
                    key={comment.id}
                    className="flex items-start justify-between gap-3 py-2 border-b border-[#F3F1EC] last:border-b-0"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-[#141413]">
                          {comment.authorName}
                        </span>
                        <span className="text-[#5E5D59]">
                          {formatTimestamp(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-[#353431] break-words">{comment.text}</p>
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        aria-label="Delete comment"
                        className="p-1 text-[#5E5D59] hover:text-[#B91C1C] shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
