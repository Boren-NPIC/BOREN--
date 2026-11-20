import type { ContentType, Series, VideoFormat } from '../types';

export const MAX_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m3u8'] as const;
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

export interface FileCheckResult {
  valid: boolean;
  error?: string;
  detectedFormat?: VideoFormat;
}

export function validateVideoFile(file: {
  name: string;
  type: string;
  size: number;
}): FileCheckResult {
  const lower = file.name.toLowerCase();
  const extMatch = ALLOWED_VIDEO_EXTENSIONS.find((ext) => lower.endsWith(ext));
  const mimeOk =
    file.type.startsWith('video/') ||
    file.type === 'application/vnd.apple.mpegurl' ||
    file.type === 'application/x-mpegURL' ||
    Boolean(extMatch);

  if (!extMatch && !mimeOk) {
    return {
      valid: false,
      error: 'Unsupported video format. Please upload MP4, WebM, MOV, or HLS (.m3u8).',
    };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'Video file is empty.' };
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return { valid: false, error: 'Video exceeds the 2 GB maximum file size limit.' };
  }

  let detectedFormat: VideoFormat = 'mp4';
  if (lower.endsWith('.m3u8') || file.type.includes('mpegurl')) {
    detectedFormat = 'hls';
  } else if (lower.endsWith('.webm') || file.type.includes('webm')) {
    detectedFormat = 'webm';
  }

  return { valid: true, detectedFormat };
}

export function validateImageFile(file: {
  name: string;
  type: string;
  size: number;
}): FileCheckResult {
  const lower = file.name.toLowerCase();
  const extMatch = ALLOWED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const mimeOk = /^image\/(jpeg|jpg|png|webp)$/i.test(file.type);
  if (!extMatch && !mimeOk) {
    return {
      valid: false,
      error: 'Unsupported image format. Please use JPG, PNG, or WebP.',
    };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'Image file is empty.' };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, error: 'Image exceeds the 10 MB maximum file size limit.' };
  }
  return { valid: true };
}

/**
 * Convert SubRip (.srt) subtitles into WebVTT (.vtt) for native HTML5 <track> playback.
 */
export function convertSrtToVtt(rawText: string): string {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (normalized.startsWith('WEBVTT')) {
    return normalized;
  }
  const converted = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2 --> $3.$4'
  );
  return `WEBVTT\n\n${converted}\n`;
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export interface CatalogFilterOptions {
  search?: string;
  categorySlug?: string;
  type?: ContentType | 'all';
  access?: 'all' | 'free' | 'premium';
  sort?: 'latest' | 'popular' | 'rating';
  year?: number | null;
}

export function filterCatalog(items: Series[], options: CatalogFilterOptions): Series[] {
  const q = (options.search || '').trim().toLowerCase();

  const filtered = items.filter((item) => {
    if (options.categorySlug && options.categorySlug !== 'all' && item.categorySlug !== options.categorySlug) {
      return false;
    }
    if (options.type && options.type !== 'all' && item.type !== options.type) {
      return false;
    }
    if (options.access === 'free' && item.isPremium) {
      return false;
    }
    if (options.access === 'premium' && !item.isPremium) {
      return false;
    }
    if (options.year && item.releaseYear !== options.year) {
      return false;
    }
    if (q) {
      const hay = `${item.title} ${item.khmerTitle || ''} ${item.description} ${item.creatorName} ${item.categorySlug}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  if (options.sort === 'popular') {
    sorted.sort((a, b) => b.viewsCount - a.viewsCount);
  } else if (options.sort === 'rating') {
    sorted.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

export function detectVideoFormatFromUrl(url: string): VideoFormat {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.m3u8')) return 'hls';
  if (clean.endsWith('.webm')) return 'webm';
  return 'mp4';
}
