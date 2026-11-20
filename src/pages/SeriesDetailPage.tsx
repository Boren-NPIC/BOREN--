import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  Flag,
  Lock,
  Play,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  createContentReport,
  createSeriesComment,
  deleteComment,
  fetchEpisodesForSeries,
  fetchSeriesById,
  listCommentsForSeries,
  toggleFavoriteSeries,
} from '../lib/firestoreService';
import { formatDuration } from '../utils/media';
import type { CommentItem, Episode, ReportReason, Series } from '../types';

export function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const {
    firebaseUser,
    profile,
    isAdmin,
    isEmailVerified,
    isPremiumActive,
    favorites,
    categories,
    refreshUserData,
  } = useApp();

  const [series, setSeries] = useState<Series | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Favorite state
  const [favBusy, setFavBusy] = useState(false);

  // Comment form
  const [rating, setRating] = useState(5);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentMsg, setCommentMsg] = useState('');

  // Report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('copyright');
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportFeedback, setReportFeedback] = useState('');

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    Promise.all([
      fetchSeriesById(id),
      fetchEpisodesForSeries(id, isAdmin),
      listCommentsForSeries(id),
    ])
      .then(([ser, eps, cmts]) => {
        if (!mounted) return;
        setSeries(ser);
        setEpisodes(eps);
        setComments(cmts);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id, isAdmin]);

  const existingFav = useMemo(
    () => favorites.find((f) => f.seriesId === series?.id),
    [favorites, series]
  );

  const categoryName = useMemo(() => {
    if (!series) return '';
    return categories.find((c) => c.slug === series.categorySlug)?.name || series.categorySlug;
  }, [categories, series]);

  const averageRating = useMemo(() => {
    if (comments.length > 0) {
      const sum = comments.reduce((acc, c) => acc + c.rating, 0);
      return (sum / comments.length).toFixed(1);
    }
    return series && series.ratingAvg > 0 ? series.ratingAvg.toFixed(1) : 'New';
  }, [comments, series]);

  const handleToggleFavorite = async () => {
    if (!firebaseUser || !isEmailVerified || !series) return;
    setFavBusy(true);
    try {
      await toggleFavoriteSeries({
        userId: firebaseUser.uid,
        series,
        existingFavId: existingFav?.id,
      });
      await refreshUserData();
    } finally {
      setFavBusy(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !isEmailVerified || !series) return;
    if (commentText.trim().length < 2) {
      setCommentMsg('Please write at least 2 characters for your review.');
      return;
    }
    setCommentBusy(true);
    setCommentMsg('');
    try {
      const created = await createSeriesComment({
        seriesId: series.id,
        userId: firebaseUser.uid,
        userName: profile?.displayName || firebaseUser.displayName || 'Viewer',
        userAvatar: profile?.photoURL || firebaseUser.photoURL || '',
        rating,
        content: commentText.trim(),
      });
      setComments((prev) => [created, ...prev]);
      setCommentText('');
      setCommentMsg('Review published.');
    } catch (err) {
      setCommentMsg(err instanceof Error ? err.message : 'Failed to post review.');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !isEmailVerified || !series) return;
    if (reportDetails.trim().length < 5) {
      setReportFeedback('Please include at least 5 characters describing the issue.');
      return;
    }
    setReportBusy(true);
    setReportFeedback('');
    try {
      await createContentReport({
        seriesId: series.id,
        seriesTitle: series.title,
        reporterId: firebaseUser.uid,
        reporterEmail: firebaseUser.email || '',
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportFeedback('Report submitted for moderation review. Thank you.');
      setReportDetails('');
      setTimeout(() => {
        setReportOpen(false);
        setReportFeedback('');
      }, 1400);
    } catch (err) {
      setReportFeedback(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setReportBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 animate-pulse space-y-6">
        <div className="h-80 rounded-2xl bg-white/5" />
        <div className="h-8 w-1/3 rounded bg-white/5" />
      </div>
    );
  }

  if (!series) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Title Not Found</h1>
        <p className="text-sm text-zinc-400">This drama or movie may have been removed or is still awaiting approval.</p>
        <Link to="/" className="inline-block px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium">
          Back to Home
        </Link>
      </div>
    );
  }

  const firstEpisode = episodes[0];

  return (
    <div className="pb-16">
      {/* Backdrop Hero */}
      <section className="relative border-b border-white/10 overflow-hidden">
        <img
          src={series.coverUrl || series.posterUrl}
          alt={series.title}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-35 blur-[2px] scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07070b] via-[#07070b]/85 to-[#07070b]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 items-start">
            <div className="aspect-[3/4] w-56 md:w-full rounded-xl overflow-hidden border border-white/15 bg-[#111119] shrink-0">
              <img
                src={series.posterUrl}
                alt={series.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-4">
              <p className="text-xs sm:text-sm font-medium text-zinc-300 flex flex-wrap items-center gap-2">
                <span className={series.isPremium ? 'text-purple-300' : 'text-cyan-300'}>
                  {series.isPremium ? 'Premium' : 'Free'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{categoryName}</span>
                <span aria-hidden="true">·</span>
                <span>{series.type === 'movie' ? 'Movie' : 'TV Series'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">{series.releaseYear}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-mono-tabular text-amber-300">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {averageRating}
                </span>
              </p>

              <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
                {series.title}
              </h1>
              {series.khmerTitle && (
                <p className="text-lg sm:text-xl text-purple-200/90">{series.khmerTitle}</p>
              )}

              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl">
                {series.description}
              </p>

              <p className="text-xs text-zinc-400">
                Uploaded by <span className="text-zinc-200 font-medium">{series.creatorName}</span> ·{' '}
                <span className="font-mono-tabular">{series.viewsCount.toLocaleString()}</span> views
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {firstEpisode && (
                  <Link
                    to={`/watch/${firstEpisode.id}`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    {series.type === 'movie' ? 'Watch Movie' : 'Watch Episode 1'}
                  </Link>
                )}

                {firebaseUser && isEmailVerified ? (
                  <button
                    type="button"
                    disabled={favBusy}
                    onClick={handleToggleFavorite}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-medium text-white transition-colors whitespace-nowrap"
                  >
                    {existingFav ? (
                      <>
                        <BookmarkCheck className="w-4 h-4 text-cyan-300" />
                        Saved to Watchlist
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-4 h-4 text-zinc-300" />
                        Add to Favorites
                      </>
                    )}
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-medium text-zinc-200 transition-colors whitespace-nowrap"
                  >
                    <Bookmark className="w-4 h-4" />
                    Sign in to Save
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-transparent hover:bg-white/5 border border-white/10 text-xs sm:text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap"
                >
                  <Flag className="w-4 h-4" />
                  Report / Copyright
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Episodes List */}
        <section className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-xl font-semibold text-white">
              Episodes <span className="text-sm text-zinc-400 font-mono-tabular">({episodes.length})</span>
            </h2>
          </div>

          {episodes.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#111119] p-8 text-center text-sm text-zinc-400">
              No published episodes are available yet for this title.
            </div>
          ) : (
            <div className="divide-y divide-white/10 border border-white/10 rounded-xl bg-[#111119] overflow-hidden">
              {episodes.map((ep) => {
                const locked = (ep.isPremium || series.isPremium) && !isPremiumActive && !isAdmin;
                return (
                  <Link
                    key={ep.id}
                    to={`/watch/${ep.id}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-white/5 transition-colors group"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-mono-tabular text-sm font-semibold text-cyan-300 shrink-0">
                        {ep.episodeNumber}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm sm:text-base font-medium text-white group-hover:text-cyan-300 transition-colors truncate">
                          {ep.title}
                        </p>
                        {ep.description && (
                          <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">{ep.description}</p>
                        )}
                        <p className="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 font-mono-tabular">
                            <Clock className="w-3 h-3" />
                            {formatDuration(ep.durationSec)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{ep.videoFormat.toUpperCase()}</span>
                          <span aria-hidden="true">·</span>
                          <span className={ep.isPremium || series.isPremium ? 'text-purple-300' : 'text-cyan-300'}>
                            {ep.isPremium || series.isPremium ? 'Premium' : 'Free'}
                          </span>
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/5 text-zinc-200 group-hover:bg-purple-600 group-hover:text-white transition-colors whitespace-nowrap shrink-0">
                      {locked ? <Lock className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {locked ? 'Premium' : 'Watch'}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Ratings & Reviews */}
        <section className="space-y-5">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-xl font-semibold text-white">Viewer Reviews</h2>
          </div>

          {firebaseUser && isEmailVerified ? (
            <form
              onSubmit={handleSubmitComment}
              className="rounded-xl border border-white/10 bg-[#111119] p-5 space-y-4"
            >
              <div>
                <span className="block text-xs font-medium text-zinc-400 mb-2">Your Rating</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((starVal) => (
                    <button
                      key={starVal}
                      type="button"
                      onClick={() => setRating(starVal)}
                      aria-label={`Rate ${starVal} out of 5 stars`}
                      className="p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          starVal <= rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="review-text" className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Review Comment
                </label>
                <textarea
                  id="review-text"
                  rows={3}
                  maxLength={1000}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share your thoughts about this drama..."
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {commentMsg && <p className="text-xs text-cyan-300">{commentMsg}</p>}

              <button
                type="submit"
                disabled={commentBusy}
                className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors"
              >
                {commentBusy ? 'Posting...' : 'Post Review'}
              </button>
            </form>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#111119] p-5 text-sm text-zinc-400 space-y-3">
              <p>Sign in with a verified account to rate and review this title.</p>
              <Link
                to="/login"
                className="inline-block px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
              >
                Sign In to Review
              </Link>
            </div>
          )}

          <div className="space-y-3">
            {comments.length === 0 ? (
              <p className="text-sm text-zinc-500 py-2">No viewer reviews yet. Be the first to rate this drama.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="rounded-xl border border-white/10 bg-[#111119] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.userName}</p>
                      <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-0.5 text-amber-400 font-mono-tabular">
                          <Star className="w-3 h-3 fill-amber-400" />
                          {c.rating}/5
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                      </p>
                    </div>
                    {(firebaseUser?.uid === c.userId || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(c.id)}
                        aria-label={`Delete review by ${c.userName}`}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{c.content}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Report Content / Copyright Modal */}
      {reportOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full rounded-2xl border border-white/15 bg-[#111119] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 id="report-modal-title" className="text-lg font-semibold text-white">
                Report Content or Copyright Issue
              </h3>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                aria-label="Close report dialog"
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {firebaseUser && isEmailVerified ? (
              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div>
                  <label htmlFor="report-reason" className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Reason
                  </label>
                  <select
                    id="report-reason"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as ReportReason)}
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                  >
                    <option value="copyright">Copyright / DMCA Infringement</option>
                    <option value="inappropriate">Inappropriate or Harmful Content</option>
                    <option value="broken_video">Broken Video / Audio Sync Issue</option>
                    <option value="spam">Misleading Metadata / Spam</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="report-details" className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Details (include proof of ownership for copyright notices)
                  </label>
                  <textarea
                    id="report-details"
                    rows={4}
                    required
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Provide details so our moderation team can take prompt action..."
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500"
                  />
                </div>

                {reportFeedback && <p className="text-xs text-cyan-300">{reportFeedback}</p>}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reportBusy}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm font-semibold text-white"
                  >
                    {reportBusy ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-sm text-zinc-300">
                <p>Please sign in with a verified account to submit a content or copyright complaint.</p>
                <Link
                  to="/login"
                  className="inline-block px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
