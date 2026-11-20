import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertSrtToVtt,
  detectVideoFormatFromUrl,
  filterCatalog,
  formatDuration,
  validateImageFile,
  validateVideoFile,
} from './media';
import type { Series } from '../types';

test('video and image file validators reject invalid formats and oversized files', () => {
  assert.equal(
    validateVideoFile({ name: 'ep1.mp4', type: 'video/mp4', size: 1024 * 1024 }).valid,
    true
  );
  assert.equal(
    validateVideoFile({ name: 'stream.m3u8', type: 'application/vnd.apple.mpegurl', size: 5000 }).detectedFormat,
    'hls'
  );
  assert.equal(
    validateVideoFile({ name: 'malware.exe', type: 'application/octet-stream', size: 1000 }).valid,
    false
  );
  assert.equal(
    validateVideoFile({ name: 'huge.mp4', type: 'video/mp4', size: 3 * 1024 * 1024 * 1024 }).valid,
    false
  );
  assert.equal(
    validateImageFile({ name: 'poster.jpg', type: 'image/jpeg', size: 500_000 }).valid,
    true
  );
  assert.equal(
    validateImageFile({ name: 'poster.gif', type: 'image/gif', size: 500_000 }).valid,
    false
  );
});

test('SRT-to-VTT converter transforms SubRip timestamps into valid WebVTT', () => {
  const srt = `1\n00:00:01,250 --> 00:00:04,500\nសួស្តី BORINA TV!\n\n2\n00:00:05,000 --> 00:00:08,100\nWelcome to Angkor.\n`;
  const vtt = convertSrtToVtt(srt);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:00:01.250 --> 00:00:04.500'));
  assert.ok(vtt.includes('សួស្តី BORINA TV!'));
});

test('catalog filter handles Khmer/English search, category, type, free/premium, and sorting', () => {
  const sample: Series[] = [
    {
      id: 's1',
      title: 'Phnom Penh Midnight',
      khmerTitle: 'ភ្នំពេញកណ្តាលអធ្រាត្រ',
      description: 'Neo-noir Khmer detective series',
      type: 'series',
      categorySlug: 'khmer-drama',
      releaseYear: 2026,
      posterUrl: '/a.jpg',
      coverUrl: '/a.jpg',
      creatorId: 'c1',
      creatorName: 'Mekong Studio',
      isPremium: false,
      featured: true,
      status: 'approved',
      rightsConfirmed: true,
      viewsCount: 5000,
      ratingAvg: 4.8,
      ratingCount: 40,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 's2',
      title: 'Jade Dynasty',
      khmerTitle: 'រាជវង្សត្បូងថ្ម',
      description: 'Chinese wuxia fantasy movie',
      type: 'movie',
      categorySlug: 'chinese-drama',
      releaseYear: 2025,
      posterUrl: '/b.jpg',
      coverUrl: '/b.jpg',
      creatorId: 'c2',
      creatorName: 'Lotus Cinema',
      isPremium: true,
      featured: false,
      status: 'approved',
      rightsConfirmed: true,
      viewsCount: 12000,
      ratingAvg: 4.9,
      ratingCount: 80,
      createdAt: 2000,
      updatedAt: 2000,
    },
  ];

  assert.equal(filterCatalog(sample, { access: 'free' }).length, 1);
  assert.equal(filterCatalog(sample, { access: 'premium' })[0].id, 's2');
  assert.equal(filterCatalog(sample, { search: 'ភ្នំពេញ' })[0].id, 's1');
  assert.equal(filterCatalog(sample, { type: 'movie' })[0].id, 's2');
  assert.equal(filterCatalog(sample, { sort: 'popular' })[0].id, 's2');
  assert.equal(formatDuration(3725), '1h 02m');
  assert.equal(detectVideoFormatFromUrl('https://cdn.example.com/ep1/index.m3u8?sig=1'), 'hls');
});
