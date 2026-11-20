import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Hls from 'hls.js';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Crown,
  Lock,
  Maximize,
  Subtitles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  fetchEpisodeById,
  fetchEpisodesForSeries,
  fetchSeriesById,
  saveWatchProgress,
} from '../lib/firestoreService';
import { authorizeBackendStream } from '../lib/apiClient';
import { canAccessEpisode, formatKhr, khrToUsdReference } from '../utils/billing';
import { convertSrtToVtt, formatDuration } from '../utils/media';
import { SAMPLE_VTT_KHMER_EN } from '../data/catalogSeed';
import type { Episode, Series } from '../types';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function WatchPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const {
    firebaseUser,
    role,
    isAdmin,
    isEmailVerified,
    subscription,
    isPremiumActive,
    siteSettings,
  } = useApp();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedSecRef = useRef<number>(0);

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [allEpisodes, setAllEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  const [signedStreamUrl, setSignedStreamUrl] = useState<string>('');
  const [authBlockReason, setAuthBlockReason] = useState<'none' | 'unapproved' | 'auth_required' | 'premium_required'>('none');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(true);
  const [vttBlobUrl, setVttBlobUrl] = useState<string>('');
  const [playerError, setPlayerError] = useState<string>('');
  const [resumedFromSec, setResumedFromSec] = useState<number>(0);

  useEffect(() => {
    if (!episodeId) return;
    let mounted = true;
    setLoading(true);
    setPlayerError('');
    setSignedStreamUrl('');

    fetchEpisodeById(episodeId)
      .then(async (ep) => {
        if (!mounted || !ep) {
          if (mounted) setEpisode(null);
          return;
        }
        const [ser, eps] = await Promise.all([
          fetchSeriesById(ep.seriesId),
          fetchEpisodesForSeries(ep.seriesId, isAdmin),
        ]);
        if (!mounted) return;
        setEpisode(ep);
        setSeries(ser);
        setAllEpisodes(eps);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [episodeId, isAdmin]);

  // Evaluate access permissions & request server-signed streaming URL
  useEffect(() => {
    if (!episode || !series) return;
    let cancelled = false;

    const decision = canAccessEpisode({
      episode,
      series,
      subscription,
      userId: firebaseUser?.uid,
      userRole: role,
    });

    if (!decision.allowed) {
      setAuthBlockReason(decision.reason === 'ok' ? 'none' : decision.reason);
      setSignedStreamUrl('');
      return;
    }

    setAuthBlockReason('none');
    const requiresPremium = Boolean(episode.isPremium || series.isPremium);
    const isOwnerOrAdmin =
      isAdmin || Boolean(firebaseUser && (episode.creatorId === firebaseUser.uid || series.creatorId === firebaseUser.uid));

    authorizeBackendStream({
      videoUrl: episode.videoUrl,
      isPremium: requiresPremium,
      hasActiveSubscription: isPremiumActive,
      isOwnerOrAdmin,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.allowed || !res.signedUrl) {
          setAuthBlockReason(res.reason === 'auth_required' ? 'auth_required' : 'premium_required');
          setSignedStreamUrl('');
        } else {
          setSignedStreamUrl(res.signedUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fallback to direct URL only for free public videos
          if (!requiresPremium) {
            setSignedStreamUrl(episode.videoUrl);
          } else {
            setAuthBlockReason('premium_required');
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [episode, series, subscription, firebaseUser, role, isAdmin, isPremiumActive]);

  // Load SRT or VTT subtitles into a clean WebVTT Blob URL
  useEffect(() => {
    if (!episode) return;
    let revokeUrl = '';
    let cancelled = false;

    async function loadSubtitles() {
      let vttContent = SAMPLE_VTT_KHMER_EN;
      if (episode?.subtitleUrl) {
        try {
          const resp = await fetch(episode.subtitleUrl);
          if (resp.ok) {
            const text = await resp.text();
            vttContent = convertSrtToVtt(text);
          }
        } catch {
          // keep fallback sample captions
        }
      }
      if (cancelled) return;
      const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
      revokeUrl = URL.createObjectURL(blob);
      setVttBlobUrl(revokeUrl);
    }

    void loadSubtitles();
    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [episode]);

  // Attach MP4 or HLS (hls.js) stream to HTML5 video element and restore playback position
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedStreamUrl || !episode) return;

    let hls: Hls | null = null;
    setPlayerError('');

    const storageKey = `borina_pos_${episode.id}`;
    const savedPos = Number(localStorage.getItem(storageKey) || '0');

    const applySavedPosition = () => {
      if (savedPos > 3 && Number.isFinite(video.duration) && savedPos < video.duration - 5) {
        video.currentTime = savedPos;
        setResumedFromSec(Math.floor(savedPos));
      }
    };

    const isHls =
      episode.videoFormat === 'hls' || signedStreamUrl.split('?')[0].toLowerCase().endsWith('.m3u8');

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(signedStreamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, applySavedPosition);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setPlayerError('HLS video stream failed to load. Check stream source or network.');
        }
      });
    } else {
      video.src = signedStreamUrl;
      video.addEventListener('loadedmetadata', applySavedPosition, { once: true });
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [signedStreamUrl, episode]);

  // Sync playback speed & subtitle track mode
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (let i = 0; i < video.textTracks.length; i += 1) {
      video.textTracks[i].mode = subtitlesEnabled ? 'showing' : 'hidden';
    }
  }, [subtitlesEnabled, vttBlobUrl]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !episode || !series) return;
    const sec = Math.floor(video.currentTime);
    localStorage.setItem(`borina_pos_${episode.id}`, String(sec));

    if (
      firebaseUser &&
      isEmailVerified &&
      Math.abs(sec - lastSavedSecRef.current) >= 10
    ) {
      lastSavedSecRef.current = sec;
      void saveWatchProgress({
        userId: firebaseUser.uid,
        seriesId: series.id,
        episodeId: episode.id,
        seriesTitle: series.title,
        episodeTitle: episode.title,
        posterUrl: series.posterUrl,
        positionSec: sec,
        durationSec: Math.floor(video.duration || episode.durationSec || 0),
      }).catch(() => {});
    }
  };

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (video.requestFullscreen) {
      void video.requestFullscreen();
    }
  };

  const { prevEpisode, nextEpisode } = useMemo(() => {
    if (!episode || allEpisodes.length === 0) return { prevEpisode: null, nextEpisode: null };
    const idx = allEpisodes.findIndex((e) => e.id === episode.id);
    return {
      prevEpisode: idx > 0 ? allEpisodes[idx - 1] : null,
      nextEpisode: idx >= 0 && idx < allEpisodes.length - 1 ? allEpisodes[idx + 1] : null,
    };
  }, [episode, allEpisodes]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 animate-pulse space-y-4">
        <div className="aspect-video rounded-2xl bg-white/5" />
        <div className="h-6 w-1/3 rounded bg-white/5" />
      </div>
    );
  }

  if (!episode || !series) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Episode Not Found</h1>
        <Link to="/" className="inline-block px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium">
          Return Home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/series/${series.id}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {series.title}
        </Link>

        {isPremiumActive && siteSettings.adFreePremiumEnabled && (
          <span className="text-xs font-medium text-cyan-300">
            Premium Ad-Free Stream Active
          </span>
        )}
      </div>

      {/* Player Surface or Premium Paywall Gate */}
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
        {authBlockReason !== 'none' ? (
          <div className="aspect-video w-full relative flex items-center justify-center p-6 sm:p-10 text-center">
            <img
              src={episode.thumbnailUrl || series.coverUrl}
              alt={episode.title}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm"
            />
            <div className="relative z-10 max-w-lg space-y-5 bg-[#0d0d15]/90 border border-white/15 rounded-2xl p-6 sm:p-8">
              <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 flex items-center justify-center mx-auto">
                {authBlockReason === 'unapproved' ? <Lock className="w-6 h-6" /> : <Crown className="w-6 h-6" />}
              </div>
              <div className="space-y-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white">
                  {authBlockReason === 'unapproved'
                    ? 'Awaiting Moderation Approval'
                    : authBlockReason === 'auth_required'
                    ? 'Sign In to Watch Premium Content'
                    : 'Premium Membership Required'}
                </h1>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {authBlockReason === 'unapproved'
                    ? 'This episode is currently under moderation review and is not publicly streamable yet.'
                    : `Unlock "${series.title}" and all exclusive dramas starting at ${formatKhr(
                        siteSettings.monthlyPriceKhr
                      )} / month (${khrToUsdReference(
                        siteSettings.monthlyPriceKhr,
                        siteSettings.exchangeRateKhrPerUsd
                      )}) via KHQR or ABA PayWay.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {authBlockReason === 'auth_required' && (
                  <Link
                    to="/login"
                    className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium"
                  >
                    Sign In
                  </Link>
                )}
                {authBlockReason !== 'unapproved' && (
                  <Link
                    to="/membership"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold"
                  >
                    <Crown className="w-4 h-4" />
                    View Premium Plans
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                controls
                playsInline
                poster={episode.thumbnailUrl || series.coverUrl}
                onTimeUpdate={handleTimeUpdate}
                onError={() =>
                  setPlayerError('Video stream could not be decoded in this browser. Verify the video URL or format.')
                }
                className="w-full h-full object-contain"
              >
                {vttBlobUrl && (
                  <track
                    kind="subtitles"
                    src={vttBlobUrl}
                    srcLang="km"
                    label={episode.subtitleLang || 'Khmer / English'}
                    default={subtitlesEnabled}
                  />
                )}
              </video>
            </div>

            {/* Player Controls Toolbar */}
            <div className="bg-[#111119] border-t border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="speed-select" className="text-xs text-zinc-400">
                  Speed
                </label>
                <select
                  id="speed-select"
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-md bg-[#090910] border border-white/10 text-xs font-mono-tabular text-zinc-200"
                >
                  {SPEED_OPTIONS.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}x
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setSubtitlesEnabled((s) => !s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    subtitlesEnabled
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                      : 'bg-[#090910] border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Subtitles className="w-3.5 h-3.5" />
                  Subtitles: {subtitlesEnabled ? 'On' : 'Off'}
                </button>

                <button
                  type="button"
                  onClick={handleFullscreen}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#090910] border border-white/10 text-zinc-300 hover:text-white"
                >
                  <Maximize className="w-3.5 h-3.5" />
                  Fullscreen
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!prevEpisode}
                  onClick={() => prevEpisode && navigate(`/watch/${prevEpisode.id}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs font-medium text-zinc-200"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev Episode
                </button>
                <button
                  type="button"
                  disabled={!nextEpisode}
                  onClick={() => nextEpisode && navigate(`/watch/${nextEpisode.id}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-xs font-medium text-white"
                >
                  Next Episode
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {playerError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          {playerError}
        </div>
      )}

      {resumedFromSec > 0 && authBlockReason === 'none' && (
        <p className="text-xs text-cyan-300 font-mono-tabular">
          Resumed from saved playback position: {formatDuration(resumedFromSec)}
        </p>
      )}

      {/* Episode Info + Playlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-2">
          <p className="text-xs text-zinc-400">
            {series.title} · Episode {episode.episodeNumber} · {episode.videoFormat.toUpperCase()}
          </p>
          <h1 className="text-2xl font-bold text-white">{episode.title}</h1>
          {episode.description && (
            <p className="text-sm text-zinc-300 leading-relaxed pt-1">{episode.description}</p>
          )}
        </div>

        <aside className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Up Next</h2>
          <div className="space-y-2">
            {allEpisodes.map((ep) => (
              <Link
                key={ep.id}
                to={`/watch/${ep.id}`}
                className={`block rounded-lg border px-3.5 py-2.5 transition-colors ${
                  ep.id === episode.id
                    ? 'bg-purple-600/20 border-purple-500/50 text-white'
                    : 'bg-[#111119] border-white/10 text-zinc-300 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono-tabular text-cyan-300">EP {ep.episodeNumber}</span>
                  <span className="font-mono-tabular text-zinc-500">{formatDuration(ep.durationSec)}</span>
                </div>
                <p className="text-sm font-medium truncate mt-0.5">{ep.title}</p>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
