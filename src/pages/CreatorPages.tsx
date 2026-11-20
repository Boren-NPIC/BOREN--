import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  Film,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  creatorUpdateOwnSeries,
  deleteSeriesAndEpisodes,
  fetchCreatorSeries,
  submitCreatorSeriesWithEpisodes,
} from '../lib/firestoreService';
import { uploadFileResumable } from '../lib/apiClient';
import { detectVideoFormatFromUrl, validateImageFile, validateVideoFile } from '../utils/media';
import type { ContentType, Series, VideoFormat } from '../types';

function CreatorGate({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isEmailVerified } = useApp();
  if (!firebaseUser) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Sign in to access Creator Studio</h1>
        <p className="text-sm text-zinc-400">
          Registered creators can upload movies, multi-episode dramas, posters, and Khmer/English subtitles for moderation review.
        </p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold">
          Sign In
        </Link>
      </div>
    );
  }
  if (!isEmailVerified) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Verify your email to upload content</h1>
        <p className="text-sm text-zinc-400">
          For community copyright safety, only verified accounts may upload series or episodes to BORINA TV. Use the banner at the top of the page to verify your email or sign in with Google.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function CreatorNav({ active }: { active: 'dashboard' | 'upload' | 'content' }) {
  const tabClass = (key: string) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      active === key
        ? 'bg-purple-600 text-white'
        : 'bg-[#111119] text-zinc-300 hover:text-white border border-white/10'
    }`;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-5">
      <Link to="/creator/dashboard" className={tabClass('dashboard')}>
        Overview
      </Link>
      <Link to="/creator/upload" className={tabClass('upload')}>
        Upload New Title
      </Link>
      <Link to="/creator/my-content" className={tabClass('content')}>
        My Content
      </Link>
    </div>
  );
}

export function CreatorDashboardPage() {
  const { firebaseUser, isEmailVerified } = useApp();
  const [mySeries, setMySeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser || !isEmailVerified) return;
    setLoading(true);
    void fetchCreatorSeries(firebaseUser.uid)
      .then(setMySeries)
      .catch(() => [])
      .finally(() => setLoading(false));
  }, [firebaseUser, isEmailVerified]);

  const approvedCount = mySeries.filter((s) => s.status === 'approved').length;
  const pendingCount = mySeries.filter((s) => s.status === 'pending').length;
  const totalViews = mySeries.reduce((sum, s) => sum + s.viewsCount, 0);

  return (
    <CreatorGate>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-cyan-300">BORINA TV Creator Studio</p>
            <h1 className="text-3xl font-bold text-white mt-1">Creator Dashboard</h1>
          </div>
          <Link
            to="/creator/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold"
          >
            <Upload className="w-4 h-4" />
            Upload Movie or Series
          </Link>
        </div>

        <CreatorNav active="dashboard" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Uploaded Titles" value={String(mySeries.length)} icon={<Film className="w-4 h-4 text-cyan-300" />} />
          <StatCard label="Published (Approved)" value={String(approvedCount)} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} />
          <StatCard label="Pending Moderation" value={String(pendingCount)} icon={<Clock className="w-4 h-4 text-amber-300" />} />
          <StatCard label="Total Views" value={totalViews.toLocaleString()} icon={<Eye className="w-4 h-4 text-purple-300" />} />
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Recent Submissions & Status</h2>
          {loading ? (
            <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
          ) : mySeries.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#111119] p-10 text-center space-y-3">
              <p className="text-base font-medium text-white">No uploads yet</p>
              <p className="text-sm text-zinc-400">
                Submit your first original film or drama series. All new uploads start in Pending status until reviewed by an Admin.
              </p>
              <Link
                to="/creator/upload"
                className="inline-block px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold"
              >
                Start First Upload
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111119]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Views</th>
                    <th className="px-4 py-3 font-medium">Moderation Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {mySeries.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-medium text-white">{s.title}</td>
                      <td className="px-4 py-3 capitalize text-zinc-400">{s.type}</td>
                      <td className="px-4 py-3 capitalize text-xs font-medium">
                        <span
                          className={
                            s.status === 'approved'
                              ? 'text-emerald-400'
                              : s.status === 'pending'
                              ? 'text-amber-300'
                              : 'text-rose-400'
                          }
                        >
                          {s.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-zinc-200">
                        {s.viewsCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{s.moderationNote || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </CreatorGate>
  );
}

interface EpisodeDraft {
  episodeNumber: number;
  title: string;
  description: string;
  durationSec: number;
  videoUrl: string;
  videoFormat: VideoFormat;
  subtitleUrl: string;
  subtitleLang: string;
  uploadProgress: number;
  uploading: boolean;
}

export function CreatorUploadPage() {
  const { firebaseUser, profile, categories } = useApp();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [khmerTitle, setKhmerTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ContentType>('series');
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug || 'khmer-drama');
  const [releaseYear, setReleaseYear] = useState<number>(new Date().getFullYear());
  const [posterUrl, setPosterUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [posterProgress, setPosterProgress] = useState(0);
  const [coverProgress, setCoverProgress] = useState(0);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const [episodes, setEpisodes] = useState<EpisodeDraft[]>([
    {
      episodeNumber: 1,
      title: 'Episode 1',
      description: '',
      durationSec: 1800,
      videoUrl: '',
      videoFormat: 'mp4',
      subtitleUrl: '',
      subtitleLang: 'Khmer / English',
      uploadProgress: 0,
      uploading: false,
    },
  ]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleImageUpload = async (
    file: File | undefined,
    target: 'poster' | 'cover'
  ) => {
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.valid) {
      setError(check.error || 'Invalid image file.');
      return;
    }
    setError('');
    try {
      const res = await uploadFileResumable({
        file,
        kind: 'image',
        onProgress: (p) => (target === 'poster' ? setPosterProgress(p) : setCoverProgress(p)),
      });
      if (target === 'poster') setPosterUrl(res.url);
      else setCoverUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    }
  };

  const handleEpisodeVideoUpload = async (index: number, file: File | undefined) => {
    if (!file) return;
    const check = validateVideoFile(file);
    if (!check.valid) {
      setError(check.error || 'Invalid video file.');
      return;
    }
    setError('');
    setEpisodes((prev) =>
      prev.map((ep, i) => (i === index ? { ...ep, uploading: true, uploadProgress: 1 } : ep))
    );
    try {
      const res = await uploadFileResumable({
        file,
        kind: 'video',
        onProgress: (p) =>
          setEpisodes((prev) =>
            prev.map((ep, i) => (i === index ? { ...ep, uploadProgress: p } : ep))
          ),
      });
      setEpisodes((prev) =>
        prev.map((ep, i) =>
          i === index
            ? {
                ...ep,
                videoUrl: res.url,
                videoFormat: check.detectedFormat || 'mp4',
                uploading: false,
                uploadProgress: 100,
              }
            : ep
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video upload failed.');
      setEpisodes((prev) =>
        prev.map((ep, i) => (i === index ? { ...ep, uploading: false, uploadProgress: 0 } : ep))
      );
    }
  };

  const handleSubtitleUpload = async (index: number, file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const res = await uploadFileResumable({ file, kind: 'subtitle' });
      setEpisodes((prev) =>
        prev.map((ep, i) => (i === index ? { ...ep, subtitleUrl: res.url } : ep))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subtitle upload failed.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    if (title.trim().length < 2) {
      setError('Title must be at least 2 characters.');
      return;
    }
    if (description.trim().length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }
    if (!posterUrl.trim()) {
      setError('Please upload a poster image or provide a valid poster URL.');
      return;
    }
    if (episodes.some((ep) => !ep.videoUrl.trim())) {
      setError('Each episode requires either an uploaded video file or a valid MP4/HLS stream URL.');
      return;
    }
    if (!rightsConfirmed) {
      setError('You must confirm you own or hold distribution rights for this content.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await submitCreatorSeriesWithEpisodes({
        creatorId: firebaseUser.uid,
        creatorEmail: firebaseUser.email || '',
        creatorName: profile?.displayName || firebaseUser.displayName || 'Independent Creator',
        title: title.trim(),
        khmerTitle: khmerTitle.trim(),
        description: description.trim(),
        type,
        categorySlug,
        releaseYear,
        posterUrl: posterUrl.trim(),
        coverUrl: (coverUrl || posterUrl).trim(),
        rightsConfirmed: true,
        episodes: episodes.map((ep) => ({
          episodeNumber: ep.episodeNumber,
          title: ep.title.trim() || `Episode ${ep.episodeNumber}`,
          description: ep.description.trim(),
          durationSec: ep.durationSec,
          videoUrl: ep.videoUrl.trim(),
          videoFormat: ep.videoFormat || detectVideoFormatFromUrl(ep.videoUrl),
          subtitleUrl: ep.subtitleUrl.trim(),
          subtitleLang: ep.subtitleLang.trim() || 'Khmer / English',
        })),
      });
      setSuccess('Submitted! Your title is now in Pending moderation review by BORINA TV Administrators.');
      setTimeout(() => navigate('/creator/my-content'), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <CreatorGate>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <p className="text-xs font-medium text-cyan-300">Resumable Upload & Moderation Queue</p>
          <h1 className="text-3xl font-bold text-white mt-1">Upload Series or Movie</h1>
        </div>

        <CreatorNav active="upload" />

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Metadata Section */}
          <section className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-5">
            <h2 className="text-base font-semibold text-white">1. Series / Movie Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="up-title" className="block text-xs text-zinc-400 mb-1.5">
                  English Title *
                </label>
                <input
                  id="up-title"
                  type="text"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Shadows of Kampot"
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="up-khmer" className="block text-xs text-zinc-400 mb-1.5">
                  Khmer Title (optional)
                </label>
                <input
                  id="up-khmer"
                  type="text"
                  maxLength={180}
                  value={khmerTitle}
                  onChange={(e) => setKhmerTitle(e.target.value)}
                  placeholder="ស្រមោលកំពត"
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor="up-desc" className="block text-xs text-zinc-400 mb-1.5">
                Synopsis / Description * (min 10 characters)
              </label>
              <textarea
                id="up-desc"
                rows={3}
                required
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the storyline, cast, and setting..."
                className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="up-type" className="block text-xs text-zinc-400 mb-1.5">
                  Format
                </label>
                <select
                  id="up-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as ContentType)}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2.5 text-sm text-white"
                >
                  <option value="series">TV Series</option>
                  <option value="movie">Movie</option>
                </select>
              </div>

              <div>
                <label htmlFor="up-cat" className="block text-xs text-zinc-400 mb-1.5">
                  Category
                </label>
                <select
                  id="up-cat"
                  value={categorySlug}
                  onChange={(e) => setCategorySlug(e.target.value)}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2.5 text-sm text-white"
                >
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="up-year" className="block text-xs text-zinc-400 mb-1.5">
                  Release Year
                </label>
                <input
                  id="up-year"
                  type="number"
                  min={1950}
                  max={2100}
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm font-mono-tabular text-white"
                />
              </div>
            </div>

            {/* Artwork Uploads */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label htmlFor="poster-file" className="block text-xs text-zinc-300 font-medium">
                  Movie Poster (3:4 Vertical JPG/PNG/WebP, max 10MB) *
                </label>
                <input
                  id="poster-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleImageUpload(e.target.files?.[0], 'poster')}
                  className="w-full text-xs text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-white"
                />
                {posterProgress > 0 && (
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 transition-all" style={{ width: `${posterProgress}%` }} />
                  </div>
                )}
                <input
                  type="text"
                  aria-label="Poster URL"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder="Or paste hosted poster image URL"
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="cover-file" className="block text-xs text-zinc-300 font-medium">
                  Cover Backdrop Image (16:9 Landscape, max 10MB)
                </label>
                <input
                  id="cover-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleImageUpload(e.target.files?.[0], 'cover')}
                  className="w-full text-xs text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-white"
                />
                {coverProgress > 0 && (
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-400 transition-all" style={{ width: `${coverProgress}%` }} />
                  </div>
                )}
                <input
                  type="text"
                  aria-label="Cover URL"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="Or paste hosted cover banner URL"
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs text-zinc-200"
                />
              </div>
            </div>
          </section>

          {/* Episodes Builder */}
          <section className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">2. Video Episodes (Resumable MP4 / WebM / HLS)</h2>
              <button
                type="button"
                onClick={() =>
                  setEpisodes((prev) => [
                    ...prev,
                    {
                      episodeNumber: prev.length + 1,
                      title: `Episode ${prev.length + 1}`,
                      description: '',
                      durationSec: 1800,
                      videoUrl: '',
                      videoFormat: 'mp4',
                      subtitleUrl: '',
                      subtitleLang: 'Khmer / English',
                      uploadProgress: 0,
                      uploading: false,
                    },
                  ])
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Episode
              </button>
            </div>

            <div className="space-y-4">
              {episodes.map((ep, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-[#0a0a12] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono-tabular font-semibold text-cyan-300">
                      Episode {ep.episodeNumber}
                    </span>
                    {episodes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEpisodes((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      aria-label={`Episode ${ep.episodeNumber} title`}
                      value={ep.title}
                      onChange={(e) =>
                        setEpisodes((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                        )
                      }
                      placeholder="Episode title"
                      className="sm:col-span-2 rounded-lg bg-[#111119] border border-white/10 px-3 py-2 text-sm text-white"
                    />
                    <input
                      type="number"
                      aria-label={`Episode ${ep.episodeNumber} duration in seconds`}
                      min={0}
                      value={ep.durationSec}
                      onChange={(e) =>
                        setEpisodes((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, durationSec: Number(e.target.value) } : x))
                        )
                      }
                      placeholder="Duration (sec)"
                      className="rounded-lg bg-[#111119] border border-white/10 px-3 py-2 text-sm font-mono-tabular text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs text-zinc-400">
                        Upload Video File (MP4/WebM/MOV/HLS, max 2GB)
                      </label>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,.m3u8"
                        onChange={(e) => handleEpisodeVideoUpload(idx, e.target.files?.[0])}
                        className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:bg-purple-600/30 file:text-purple-100"
                      />
                      {ep.uploadProgress > 0 && (
                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-400 transition-all"
                              style={{ width: `${ep.uploadProgress}%` }}
                            />
                          </div>
                          <p className="text-[11px] font-mono-tabular text-cyan-300">
                            {ep.uploading ? `Uploading chunks... ${ep.uploadProgress}%` : 'Upload complete (100%)'}
                          </p>
                        </div>
                      )}
                      <input
                        type="text"
                        aria-label={`Episode ${ep.episodeNumber} video URL`}
                        value={ep.videoUrl}
                        onChange={(e) =>
                          setEpisodes((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    videoUrl: e.target.value,
                                    videoFormat: detectVideoFormatFromUrl(e.target.value),
                                  }
                                : x
                            )
                          )
                        }
                        placeholder="Or paste MP4 / HLS (.m3u8) stream URL"
                        className="w-full rounded-lg bg-[#111119] border border-white/10 px-3 py-2 text-xs text-zinc-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs text-zinc-400">
                        Subtitle File (.srt or .vtt, optional)
                      </label>
                      <input
                        type="file"
                        accept=".srt,.vtt,text/vtt"
                        onChange={(e) => handleSubtitleUpload(idx, e.target.files?.[0])}
                        className="w-full text-xs text-zinc-300 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:bg-white/10 file:text-zinc-200"
                      />
                      <input
                        type="text"
                        aria-label={`Episode ${ep.episodeNumber} subtitle URL`}
                        value={ep.subtitleUrl}
                        onChange={(e) =>
                          setEpisodes((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, subtitleUrl: e.target.value } : x))
                          )
                        }
                        placeholder="Optional .vtt / .srt URL"
                        className="w-full rounded-lg bg-[#111119] border border-white/10 px-3 py-2 text-xs text-zinc-200"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Distribution Rights Confirmation */}
          <section className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-[#090910] text-purple-600 focus:ring-cyan-400"
              />
              <span className="text-sm text-zinc-300 leading-relaxed">
                I confirm that I own the copyright or hold valid distribution rights to upload and stream this content on BORINA TV. I acknowledge that all uploads enter <strong>Pending</strong> moderation review and may be removed upon valid copyright complaint.
              </span>
            </label>

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || episodes.some((ep) => ep.uploading)}
              className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors"
            >
              {busy ? 'Submitting for Moderation...' : 'Submit Upload for Admin Review'}
            </button>
          </section>
        </form>
      </div>
    </CreatorGate>
  );
}

export function CreatorMyContentPage() {
  const { firebaseUser, isEmailVerified, categories } = useApp();
  const [items, setItems] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Series | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editYear, setEditYear] = useState(2026);
  const [editCat, setEditCat] = useState('khmer-drama');
  const [busy, setBusy] = useState(false);

  const loadContent = async () => {
    if (!firebaseUser || !isEmailVerified) return;
    setLoading(true);
    try {
      const list = await fetchCreatorSeries(firebaseUser.uid);
      setItems(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContent();
  }, [firebaseUser, isEmailVerified]);

  const startEdit = (s: Series) => {
    setEditing(s);
    setEditTitle(s.title);
    setEditDesc(s.description);
    setEditYear(s.releaseYear);
    setEditCat(s.categorySlug);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await creatorUpdateOwnSeries(editing.id, {
        title: editTitle,
        khmerTitle: editing.khmerTitle,
        description: editDesc,
        type: editing.type,
        categorySlug: editCat,
        releaseYear: editYear,
        posterUrl: editing.posterUrl,
        coverUrl: editing.coverUrl,
      });
      setEditing(null);
      await loadContent();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (seriesId: string) => {
    setBusy(true);
    try {
      await deleteSeriesAndEpisodes(seriesId);
      setItems((prev) => prev.filter((s) => s.id !== seriesId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CreatorGate>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <p className="text-xs font-medium text-cyan-300">Creator Ownership & Moderation Status</p>
          <h1 className="text-3xl font-bold text-white mt-1">My Uploaded Content</h1>
        </div>

        <CreatorNav active="content" />

        {loading ? (
          <div className="h-40 rounded-xl bg-white/5 animate-pulse" />
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#111119] p-10 text-center space-y-3">
            <p className="text-base text-white">You have not uploaded any series or movies yet.</p>
            <Link
              to="/creator/upload"
              className="inline-block px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold"
            >
              Upload New Title
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-white/10 bg-[#111119] p-5 flex gap-4 items-start"
              >
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="w-20 h-28 rounded-lg object-cover border border-white/10 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-white truncate">{item.title}</h2>
                    <span
                      className={`text-xs font-medium capitalize shrink-0 ${
                        item.status === 'approved'
                          ? 'text-emerald-400'
                          : item.status === 'pending'
                          ? 'text-amber-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2">{item.description}</p>
                  {item.moderationNote && (
                    <p className="text-xs text-amber-200 bg-amber-950/30 border border-amber-500/20 rounded px-2.5 py-1.5">
                      Admin Note: {item.moderationNote}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Link
                      to={`/series/${item.id}`}
                      className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-xs text-zinc-200"
                    >
                      Preview
                    </Link>
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-xs text-cyan-300"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(item.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-rose-950/40 hover:bg-rose-900/50 text-xs text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit Modal */}
        {editing && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveEdit}
              className="max-w-lg w-full rounded-2xl border border-white/15 bg-[#111119] p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Edit "{editing.title}"</h2>
                <button type="button" onClick={() => setEditing(null)} aria-label="Close edit modal">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <p className="text-xs text-amber-200">
                Note: Editing returns this submission to Pending moderation status for Admin re-approval.
              </p>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  required
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Category</label>
                  <select
                    value={editCat}
                    onChange={(e) => setEditCat(e.target.value)}
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Year</label>
                  <input
                    type="number"
                    value={editYear}
                    onChange={(e) => setEditYear(Number(e.target.value))}
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm font-mono-tabular text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-purple-600 text-sm font-semibold text-white"
                >
                  {busy ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </CreatorGate>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111119] p-5 space-y-2">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold font-mono-tabular text-white">{value}</p>
    </div>
  );
}
