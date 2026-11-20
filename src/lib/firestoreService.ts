import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { DEFAULT_SITE_SETTINGS, calculateExpiryTimestamp, toIntegerKhr } from '../utils/billing';
import { INITIAL_CATEGORIES, INITIAL_EPISODES, INITIAL_SERIES } from '../data/catalogSeed';
import type {
  AccountStatus,
  AuditLogItem,
  Category,
  CommentItem,
  CreatorProfile,
  Episode,
  FavoriteItem,
  ModerationStatus,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  PlanType,
  ReportItem,
  ReportReason,
  Series,
  SiteSettings,
  Subscription,
  SubscriptionStatus,
  UploadRequest,
  UserProfile,
  WatchHistoryItem,
} from '../types';

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'seconds' in val) {
    return Number((val as { seconds: number }).seconds) * 1000;
  }
  return Date.now();
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function clampStr(val: string | undefined | null, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

// ============================================================================
// SITE SETTINGS (KHR PRICING, EXCHANGE RATE, PAYMENT GATEWAYS, BANNERS)
// ============================================================================
export async function fetchSiteSettings(): Promise<SiteSettings> {
  const path = 'site_settings/public_config';
  try {
    const snap = await getDoc(doc(db, 'site_settings', 'public_config'));
    if (!snap.exists()) return DEFAULT_SITE_SETTINGS;
    const d = snap.data();
    return {
      monthlyPriceKhr: toIntegerKhr(Number(d.monthlyPriceKhr ?? DEFAULT_SITE_SETTINGS.monthlyPriceKhr)),
      yearlyPriceKhr: toIntegerKhr(Number(d.yearlyPriceKhr ?? DEFAULT_SITE_SETTINGS.yearlyPriceKhr)),
      exchangeRateKhrPerUsd: toIntegerKhr(
        Number(d.exchangeRateKhrPerUsd ?? DEFAULT_SITE_SETTINGS.exchangeRateKhrPerUsd)
      ),
      currency: 'KHR',
      khqrEnabled: Boolean(d.khqrEnabled ?? true),
      abaPayWayEnabled: Boolean(d.abaPayWayEnabled ?? true),
      manualVerificationEnabled: Boolean(d.manualVerificationEnabled ?? true),
      adFreePremiumEnabled: Boolean(d.adFreePremiumEnabled ?? true),
      khqrMerchantDisplayName: d.khqrMerchantDisplayName || DEFAULT_SITE_SETTINGS.khqrMerchantDisplayName,
      abaMerchantDisplayName: d.abaMerchantDisplayName || DEFAULT_SITE_SETTINGS.abaMerchantDisplayName,
      manualInstructions: d.manualInstructions || DEFAULT_SITE_SETTINGS.manualInstructions,
      heroTitle: d.heroTitle || DEFAULT_SITE_SETTINGS.heroTitle,
      heroSubtitle: d.heroSubtitle || DEFAULT_SITE_SETTINGS.heroSubtitle,
      heroBannerUrl: d.heroBannerUrl || DEFAULT_SITE_SETTINGS.heroBannerUrl,
      announcementBanner: d.announcementBanner || '',
      updatedAt: toMillis(d.updatedAt),
    };
  } catch (error) {
    // Public visitors should still see default KHR pricing even if doc hasn't been initialized yet
    console.warn('Using default KHR site settings:', error);
    return DEFAULT_SITE_SETTINGS;
  }
}

export async function saveSiteSettings(
  settings: Omit<SiteSettings, 'updatedAt'>,
  actor: { uid: string; email: string }
): Promise<void> {
  const path = 'site_settings/public_config';
  try {
    const payload = {
      monthlyPriceKhr: Math.max(1000, toIntegerKhr(settings.monthlyPriceKhr)),
      yearlyPriceKhr: Math.max(1000, toIntegerKhr(settings.yearlyPriceKhr)),
      exchangeRateKhrPerUsd: Math.max(100, toIntegerKhr(settings.exchangeRateKhrPerUsd)),
      currency: 'KHR' as const,
      khqrEnabled: Boolean(settings.khqrEnabled),
      abaPayWayEnabled: Boolean(settings.abaPayWayEnabled),
      manualVerificationEnabled: Boolean(settings.manualVerificationEnabled),
      adFreePremiumEnabled: Boolean(settings.adFreePremiumEnabled),
      khqrMerchantDisplayName: clampStr(settings.khqrMerchantDisplayName, 120),
      abaMerchantDisplayName: clampStr(settings.abaMerchantDisplayName, 120),
      manualInstructions: clampStr(settings.manualInstructions, 600),
      heroTitle: clampStr(settings.heroTitle, 160),
      heroSubtitle: clampStr(settings.heroSubtitle, 300),
      heroBannerUrl: clampStr(settings.heroBannerUrl, 600),
      announcementBanner: clampStr(settings.announcementBanner, 240),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'site_settings', 'public_config'), payload);
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'UPDATE_SITE_SETTINGS',
      targetCollection: 'site_settings',
      targetId: 'public_config',
      summary: `Updated pricing (Monthly: ៛${payload.monthlyPriceKhr}, Yearly: ៛${payload.yearlyPriceKhr}, Rate: ${payload.exchangeRateKhrPerUsd} KHR/USD) & payment toggles`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// AUDIT LOGS (IMMUTABLE ADMIN TRAIL)
// ============================================================================
export async function writeAuditLog(entry: {
  actorId: string;
  actorEmail: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
}): Promise<void> {
  const logId = makeDocId('log');
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      actorId: clampStr(entry.actorId, 128),
      actorEmail: clampStr(entry.actorEmail, 200),
      action: clampStr(entry.action, 100),
      targetCollection: clampStr(entry.targetCollection, 80),
      targetId: clampStr(entry.targetId, 128),
      summary: clampStr(entry.summary, 500),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function listAuditLogs(): Promise<AuditLogItem[]> {
  const path = 'audit_logs';
  try {
    const snap = await getDocs(collection(db, 'audit_logs'));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          actorId: x.actorId,
          actorEmail: x.actorEmail,
          action: x.action,
          targetCollection: x.targetCollection,
          targetId: x.targetId,
          summary: x.summary,
          createdAt: toMillis(x.createdAt),
        } as AuditLogItem;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ============================================================================
// USERS & CREATORS
// ============================================================================
export async function syncUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isBootstrappedAdmin: boolean;
}): Promise<UserProfile> {
  const path = `users/${params.uid}`;
  try {
    const ref = doc(db, 'users', params.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      return {
        uid: d.uid,
        email: d.email,
        displayName: d.displayName,
        photoURL: d.photoURL || '',
        role: params.isBootstrappedAdmin ? 'admin' : d.role,
        status: d.status,
        createdAt: toMillis(d.createdAt),
        updatedAt: toMillis(d.updatedAt),
      };
    }
    const role = params.isBootstrappedAdmin ? 'admin' : 'user';
    await setDoc(ref, {
      uid: params.uid,
      email: clampStr(params.email, 200),
      displayName: clampStr(params.displayName || params.email.split('@')[0] || 'Viewer', 100),
      photoURL: clampStr(params.photoURL, 500),
      role,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      uid: params.uid,
      email: params.email,
      displayName: params.displayName || params.email.split('@')[0] || 'Viewer',
      photoURL: params.photoURL || '',
      role,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateOwnUserProfile(
  uid: string,
  updates: { displayName: string; photoURL?: string }
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: clampStr(updates.displayName, 100),
      photoURL: clampStr(updates.photoURL, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function listAllUsers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          uid: x.uid,
          email: x.email,
          displayName: x.displayName,
          photoURL: x.photoURL || '',
          role: x.role,
          status: x.status,
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        } as UserProfile;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminUpdateUserAccount(
  targetUid: string,
  updates: { role?: 'user' | 'creator' | 'admin'; status?: AccountStatus },
  actor: { uid: string; email: string }
): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    if (updates.role === 'admin') {
      const userSnap = await getDoc(doc(db, 'users', targetUid));
      await setDoc(doc(db, 'admins', targetUid), {
        uid: targetUid,
        email: userSnap.exists() ? userSnap.data().email : 'admin@borina.tv',
        createdAt: serverTimestamp(),
      });
    }
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'UPDATE_USER_ACCOUNT',
      targetCollection: 'users',
      targetId: targetUid,
      summary: `Updated user ${targetUid}: ${JSON.stringify(updates)}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function ensureCreatorProfile(params: {
  uid: string;
  studioName: string;
  bio?: string;
  avatarUrl?: string;
}): Promise<CreatorProfile> {
  const path = `creators/${params.uid}`;
  try {
    const ref = doc(db, 'creators', params.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      return {
        uid: d.uid,
        studioName: d.studioName,
        bio: d.bio || '',
        avatarUrl: d.avatarUrl || '',
        verified: Boolean(d.verified),
        totalViews: Number(d.totalViews || 0),
        createdAt: toMillis(d.createdAt),
        updatedAt: toMillis(d.updatedAt),
      };
    }
    await setDoc(ref, {
      uid: params.uid,
      studioName: clampStr(params.studioName, 100),
      bio: clampStr(params.bio || 'Independent studio on BORINA TV', 500),
      avatarUrl: clampStr(params.avatarUrl, 500),
      verified: false,
      totalViews: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      uid: params.uid,
      studioName: clampStr(params.studioName, 100),
      bio: clampStr(params.bio || 'Independent studio on BORINA TV', 500),
      avatarUrl: clampStr(params.avatarUrl, 500),
      verified: false,
      totalViews: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listCreators(): Promise<CreatorProfile[]> {
  const path = 'creators';
  try {
    const snap = await getDocs(collection(db, 'creators'));
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        uid: x.uid,
        studioName: x.studioName,
        bio: x.bio || '',
        avatarUrl: x.avatarUrl || '',
        verified: Boolean(x.verified),
        totalViews: Number(x.totalViews || 0),
        createdAt: toMillis(x.createdAt),
        updatedAt: toMillis(x.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminToggleCreatorVerified(
  creatorId: string,
  verified: boolean,
  actor: { uid: string; email: string }
): Promise<void> {
  const path = `creators/${creatorId}`;
  try {
    await updateDoc(doc(db, 'creators', creatorId), {
      verified,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: verified ? 'VERIFY_CREATOR' : 'UNVERIFY_CREATOR',
      targetCollection: 'creators',
      targetId: creatorId,
      summary: `${verified ? 'Verified' : 'Revoked verification for'} creator ${creatorId}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// CATEGORIES, SERIES & EPISODES
// ============================================================================
export async function fetchCategories(): Promise<Category[]> {
  try {
    const snap = await getDocs(collection(db, 'categories'));
    if (snap.empty) return INITIAL_CATEGORIES;
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          slug: x.slug,
          name: x.name,
          khmerName: x.khmerName || '',
          description: x.description || '',
          sortOrder: Number(x.sortOrder || 0),
          createdAt: toMillis(x.createdAt),
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return INITIAL_CATEGORIES;
  }
}

export async function adminSaveCategory(
  cat: { id?: string; slug: string; name: string; khmerName?: string; description?: string; sortOrder: number },
  actor: { uid: string; email: string }
): Promise<void> {
  const id = cat.id || `cat_${cat.slug}`;
  const path = `categories/${id}`;
  try {
    const ref = doc(db, 'categories', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        slug: clampStr(cat.slug.toLowerCase(), 64),
        name: clampStr(cat.name, 80),
        khmerName: clampStr(cat.khmerName, 120),
        description: clampStr(cat.description, 300),
        sortOrder: Number(cat.sortOrder || 0),
      });
    } else {
      await setDoc(ref, {
        slug: clampStr(cat.slug.toLowerCase(), 64),
        name: clampStr(cat.name, 80),
        khmerName: clampStr(cat.khmerName, 120),
        description: clampStr(cat.description, 300),
        sortOrder: Number(cat.sortOrder || 0),
        createdAt: serverTimestamp(),
      });
    }
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'SAVE_CATEGORY',
      targetCollection: 'categories',
      targetId: id,
      summary: `Saved category ${cat.name} (${cat.slug})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminDeleteCategory(id: string, actor: { uid: string; email: string }): Promise<void> {
  const path = `categories/${id}`;
  try {
    await deleteDoc(doc(db, 'categories', id));
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'DELETE_CATEGORY',
      targetCollection: 'categories',
      targetId: id,
      summary: `Deleted category ${id}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function mapSeriesDoc(id: string, x: Record<string, unknown>): Series {
  return {
    id,
    title: String(x.title || ''),
    khmerTitle: String(x.khmerTitle || ''),
    description: String(x.description || ''),
    type: (x.type as 'movie' | 'series') || 'series',
    categorySlug: String(x.categorySlug || 'khmer-drama'),
    releaseYear: Number(x.releaseYear || 2026),
    posterUrl: String(x.posterUrl || ''),
    coverUrl: String(x.coverUrl || ''),
    creatorId: String(x.creatorId || ''),
    creatorName: String(x.creatorName || ''),
    isPremium: Boolean(x.isPremium),
    featured: Boolean(x.featured),
    status: (x.status as ModerationStatus) || 'pending',
    moderationNote: String(x.moderationNote || ''),
    rightsConfirmed: Boolean(x.rightsConfirmed),
    viewsCount: Number(x.viewsCount || 0),
    ratingAvg: Number(x.ratingAvg || 0),
    ratingCount: Number(x.ratingCount || 0),
    createdAt: toMillis(x.createdAt),
    updatedAt: toMillis(x.updatedAt),
  };
}

function mapEpisodeDoc(id: string, x: Record<string, unknown>): Episode {
  return {
    id,
    seriesId: String(x.seriesId || ''),
    episodeNumber: Number(x.episodeNumber || 1),
    title: String(x.title || ''),
    description: String(x.description || ''),
    durationSec: Number(x.durationSec || 0),
    videoUrl: String(x.videoUrl || ''),
    videoFormat: (x.videoFormat as 'mp4' | 'hls' | 'webm') || 'mp4',
    subtitleUrl: String(x.subtitleUrl || ''),
    subtitleLang: String(x.subtitleLang || ''),
    thumbnailUrl: String(x.thumbnailUrl || ''),
    isPremium: Boolean(x.isPremium),
    creatorId: String(x.creatorId || ''),
    status: (x.status as 'pending' | 'approved' | 'rejected') || 'pending',
    viewsCount: Number(x.viewsCount || 0),
    createdAt: toMillis(x.createdAt),
    updatedAt: toMillis(x.updatedAt),
  };
}

export async function fetchApprovedSeries(): Promise<Series[]> {
  try {
    const q = query(collection(db, 'series'), where('status', '==', 'approved'));
    const snap = await getDocs(q);
    const dbItems = snap.docs.map((d) => mapSeriesDoc(d.id, d.data()));
    // Merge curated starter titles that are not yet in Firestore so the storefront is always rich & functional
    const dbIds = new Set(dbItems.map((s) => s.id));
    const merged = [...dbItems, ...INITIAL_SERIES.filter((s) => !dbIds.has(s.id))];
    return merged.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return INITIAL_SERIES;
  }
}

export async function fetchAllSeriesAdmin(): Promise<Series[]> {
  const path = 'series';
  try {
    const snap = await getDocs(collection(db, 'series'));
    const dbItems = snap.docs.map((d) => mapSeriesDoc(d.id, d.data()));
    return dbItems.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchCreatorSeries(creatorId: string): Promise<Series[]> {
  const path = 'series';
  try {
    const q = query(collection(db, 'series'), where('creatorId', '==', creatorId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapSeriesDoc(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchSeriesById(seriesId: string): Promise<Series | null> {
  try {
    const snap = await getDoc(doc(db, 'series', seriesId));
    if (snap.exists()) return mapSeriesDoc(snap.id, snap.data());
  } catch {
    // Fallback to initial curated catalog if not yet persisted to Firestore
  }
  return INITIAL_SERIES.find((s) => s.id === seriesId) || null;
}

export async function fetchEpisodesForSeries(seriesId: string, includeUnapproved = false): Promise<Episode[]> {
  try {
    const q = includeUnapproved
      ? query(collection(db, 'episodes'), where('seriesId', '==', seriesId))
      : query(
          collection(db, 'episodes'),
          where('seriesId', '==', seriesId),
          where('status', '==', 'approved')
        );
    const snap = await getDocs(q);
    const dbEps = snap.docs.map((d) => mapEpisodeDoc(d.id, d.data()));
    const dbIds = new Set(dbEps.map((e) => e.id));
    const seeded = INITIAL_EPISODES.filter((e) => e.seriesId === seriesId && !dbIds.has(e.id));
    return [...dbEps, ...seeded].sort((a, b) => a.episodeNumber - b.episodeNumber);
  } catch {
    return INITIAL_EPISODES.filter((e) => e.seriesId === seriesId).sort(
      (a, b) => a.episodeNumber - b.episodeNumber
    );
  }
}

export async function fetchEpisodeById(episodeId: string): Promise<Episode | null> {
  try {
    const snap = await getDoc(doc(db, 'episodes', episodeId));
    if (snap.exists()) return mapEpisodeDoc(snap.id, snap.data());
  } catch {
    // fallback to initial catalog
  }
  return INITIAL_EPISODES.find((e) => e.id === episodeId) || null;
}

export async function fetchAllEpisodesAdmin(): Promise<Episode[]> {
  const path = 'episodes';
  try {
    const snap = await getDocs(collection(db, 'episodes'));
    return snap.docs.map((d) => mapEpisodeDoc(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// Creator submits new series + episodes + upload_request (ALL start in `pending` status)
export async function submitCreatorSeriesWithEpisodes(params: {
  creatorId: string;
  creatorEmail: string;
  creatorName: string;
  title: string;
  khmerTitle?: string;
  description: string;
  type: 'movie' | 'series';
  categorySlug: string;
  releaseYear: number;
  posterUrl: string;
  coverUrl: string;
  rightsConfirmed: boolean;
  episodes: Array<{
    episodeNumber: number;
    title: string;
    description?: string;
    durationSec: number;
    videoUrl: string;
    videoFormat: 'mp4' | 'hls' | 'webm';
    subtitleUrl?: string;
    subtitleLang?: string;
    thumbnailUrl?: string;
  }>;
}): Promise<string> {
  if (!params.rightsConfirmed) {
    throw new Error('You must confirm you hold valid distribution rights before uploading.');
  }
  const seriesId = makeDocId('ser');
  const seriesPath = `series/${seriesId}`;
  try {
    await ensureCreatorProfile({
      uid: params.creatorId,
      studioName: params.creatorName,
    });

    await setDoc(doc(db, 'series', seriesId), {
      title: clampStr(params.title, 160),
      khmerTitle: clampStr(params.khmerTitle, 180),
      description: clampStr(params.description, 2000),
      type: params.type,
      categorySlug: clampStr(params.categorySlug, 64),
      releaseYear: Number(params.releaseYear),
      posterUrl: clampStr(params.posterUrl, 600),
      coverUrl: clampStr(params.coverUrl || params.posterUrl, 600),
      creatorId: params.creatorId,
      creatorName: clampStr(params.creatorName, 100),
      isPremium: false,
      featured: false,
      status: 'pending',
      moderationNote: '',
      rightsConfirmed: true,
      viewsCount: 0,
      ratingAvg: 0,
      ratingCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const ep of params.episodes) {
      const epId = makeDocId('ep');
      await setDoc(doc(db, 'episodes', epId), {
        seriesId,
        episodeNumber: Number(ep.episodeNumber),
        title: clampStr(ep.title, 160),
        description: clampStr(ep.description, 1000),
        durationSec: Math.max(0, Number(ep.durationSec || 0)),
        videoUrl: clampStr(ep.videoUrl, 800),
        videoFormat: ep.videoFormat,
        subtitleUrl: clampStr(ep.subtitleUrl, 800),
        subtitleLang: clampStr(ep.subtitleLang || 'Khmer / English', 40),
        thumbnailUrl: clampStr(ep.thumbnailUrl || params.posterUrl, 600),
        isPremium: false,
        creatorId: params.creatorId,
        status: 'pending',
        viewsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const reqId = makeDocId('req');
    await setDoc(doc(db, 'upload_requests', reqId), {
      seriesId,
      seriesTitle: clampStr(params.title, 160),
      creatorId: params.creatorId,
      creatorEmail: clampStr(params.creatorEmail, 200),
      rightsConfirmed: true,
      status: 'pending',
      adminNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return seriesId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, seriesPath);
  }
}

export async function creatorUpdateOwnSeries(
  seriesId: string,
  updates: {
    title: string;
    khmerTitle?: string;
    description: string;
    type: 'movie' | 'series';
    categorySlug: string;
    releaseYear: number;
    posterUrl: string;
    coverUrl: string;
  }
): Promise<void> {
  const path = `series/${seriesId}`;
  try {
    await updateDoc(doc(db, 'series', seriesId), {
      title: clampStr(updates.title, 160),
      khmerTitle: clampStr(updates.khmerTitle, 180),
      description: clampStr(updates.description, 2000),
      type: updates.type,
      categorySlug: clampStr(updates.categorySlug, 64),
      releaseYear: Number(updates.releaseYear),
      posterUrl: clampStr(updates.posterUrl, 600),
      coverUrl: clampStr(updates.coverUrl, 600),
      status: 'pending', // Re-enters moderation queue on edit
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSeriesAndEpisodes(
  seriesId: string,
  actor?: { uid: string; email: string; isAdmin?: boolean }
): Promise<void> {
  const path = `series/${seriesId}`;
  try {
    const epsSnap = await getDocs(query(collection(db, 'episodes'), where('seriesId', '==', seriesId)));
    for (const epDoc of epsSnap.docs) {
      await deleteDoc(doc(db, 'episodes', epDoc.id));
    }
    await deleteDoc(doc(db, 'series', seriesId));
    if (actor?.isAdmin) {
      await writeAuditLog({
        actorId: actor.uid,
        actorEmail: actor.email,
        action: 'DELETE_SERIES',
        targetCollection: 'series',
        targetId: seriesId,
        summary: `Deleted series ${seriesId} and ${epsSnap.size} associated episodes`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminModerateSeries(
  seriesId: string,
  updates: {
    status?: ModerationStatus;
    isPremium?: boolean;
    featured?: boolean;
    moderationNote?: string;
  },
  actor: { uid: string; email: string }
): Promise<void> {
  const path = `series/${seriesId}`;
  try {
    await updateDoc(doc(db, 'series', seriesId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    // Cascade approval/rejection/premium state to episodes of this series when moderating status or premium
    if (updates.status || typeof updates.isPremium === 'boolean') {
      const epsSnap = await getDocs(query(collection(db, 'episodes'), where('seriesId', '==', seriesId)));
      for (const epDoc of epsSnap.docs) {
        const epUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (updates.status === 'approved') epUpdates.status = 'approved';
        if (updates.status === 'rejected') epUpdates.status = 'rejected';
        if (updates.status === 'pending' || updates.status === 'changes_requested') {
          epUpdates.status = 'pending';
        }
        if (typeof updates.isPremium === 'boolean') epUpdates.isPremium = updates.isPremium;
        await updateDoc(doc(db, 'episodes', epDoc.id), epUpdates);
      }
    }

    // Update any matching upload_request
    if (updates.status) {
      const reqSnap = await getDocs(
        query(collection(db, 'upload_requests'), where('seriesId', '==', seriesId))
      );
      for (const rDoc of reqSnap.docs) {
        await updateDoc(doc(db, 'upload_requests', rDoc.id), {
          status: updates.status,
          adminNote: clampStr(updates.moderationNote, 500),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'MODERATE_SERIES',
      targetCollection: 'series',
      targetId: seriesId,
      summary: `Moderated series ${seriesId}: ${JSON.stringify(updates)}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminSeedStarterCatalog(actor: { uid: string; email: string }): Promise<number> {
  let count = 0;
  for (const cat of INITIAL_CATEGORIES) {
    await setDoc(doc(db, 'categories', cat.id), {
      slug: cat.slug,
      name: cat.name,
      khmerName: cat.khmerName || '',
      description: cat.description || '',
      sortOrder: cat.sortOrder,
      createdAt: serverTimestamp(),
    });
  }
  for (const ser of INITIAL_SERIES) {
    await setDoc(doc(db, 'series', ser.id), {
      title: ser.title,
      khmerTitle: ser.khmerTitle || '',
      description: ser.description,
      type: ser.type,
      categorySlug: ser.categorySlug,
      releaseYear: ser.releaseYear,
      posterUrl: ser.posterUrl,
      coverUrl: ser.coverUrl,
      creatorId: actor.uid,
      creatorName: ser.creatorName,
      isPremium: ser.isPremium,
      featured: ser.featured,
      status: 'approved',
      moderationNote: '',
      rightsConfirmed: true,
      viewsCount: ser.viewsCount,
      ratingAvg: ser.ratingAvg,
      ratingCount: ser.ratingCount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    count += 1;
  }
  for (const ep of INITIAL_EPISODES) {
    await setDoc(doc(db, 'episodes', ep.id), {
      seriesId: ep.seriesId,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      description: ep.description || '',
      durationSec: ep.durationSec,
      videoUrl: ep.videoUrl,
      videoFormat: ep.videoFormat,
      subtitleUrl: ep.subtitleUrl || '',
      subtitleLang: ep.subtitleLang || 'Khmer / English',
      thumbnailUrl: ep.thumbnailUrl || '',
      isPremium: ep.isPremium,
      creatorId: actor.uid,
      status: 'approved',
      viewsCount: ep.viewsCount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await writeAuditLog({
    actorId: actor.uid,
    actorEmail: actor.email,
    action: 'SEED_CATALOG',
    targetCollection: 'series',
    targetId: 'starter_catalog',
    summary: `Published ${count} curated starter series and categories to Firestore`,
  });
  return count;
}

// ============================================================================
// SUBSCRIPTIONS & PAYMENTS (CAMBODIA KHR)
// ============================================================================
export async function fetchUserSubscription(userId: string): Promise<Subscription | null> {
  const path = 'subscriptions';
  try {
    const q = query(collection(db, 'subscriptions'), where('userId', '==', userId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const subs = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          userId: x.userId,
          userEmail: x.userEmail || '',
          plan: x.plan as PlanType,
          status: x.status as SubscriptionStatus,
          amountKhr: toIntegerKhr(Number(x.amountKhr || 0)),
          currency: 'KHR' as const,
          startedAt: x.startedAt ? toMillis(x.startedAt) : undefined,
          expiresAt: toMillis(x.expiresAt),
          paymentId: x.paymentId || '',
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        } as Subscription;
      })
      .sort((a, b) => b.expiresAt - a.expiresAt);
    return subs[0] || null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listAllSubscriptionsAdmin(): Promise<Subscription[]> {
  const path = 'subscriptions';
  try {
    const snap = await getDocs(collection(db, 'subscriptions'));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          userId: x.userId,
          userEmail: x.userEmail || '',
          plan: x.plan as PlanType,
          status: x.status as SubscriptionStatus,
          amountKhr: toIntegerKhr(Number(x.amountKhr || 0)),
          currency: 'KHR' as const,
          startedAt: x.startedAt ? toMillis(x.startedAt) : undefined,
          expiresAt: toMillis(x.expiresAt),
          paymentId: x.paymentId || '',
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createPendingPaymentRecord(params: {
  userId: string;
  userEmail: string;
  plan: PlanType;
  method: PaymentMethod;
  amountKhr: number;
  exchangeRateKhrPerUsd: number;
  orderRef: string;
}): Promise<PaymentRecord> {
  const paymentId = makeDocId('pay');
  const path = `payments/${paymentId}`;
  try {
    await setDoc(doc(db, 'payments', paymentId), {
      userId: params.userId,
      userEmail: clampStr(params.userEmail, 200),
      plan: params.plan,
      method: params.method,
      amountKhr: toIntegerKhr(params.amountKhr),
      currency: 'KHR',
      exchangeRateKhrPerUsd: toIntegerKhr(params.exchangeRateKhrPerUsd),
      status: 'pending',
      orderRef: clampStr(params.orderRef, 80),
      providerRef: '',
      receiptRef: '',
      manualNote: '',
      verifiedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      id: paymentId,
      userId: params.userId,
      userEmail: params.userEmail,
      plan: params.plan,
      method: params.method,
      amountKhr: toIntegerKhr(params.amountKhr),
      currency: 'KHR',
      exchangeRateKhrPerUsd: toIntegerKhr(params.exchangeRateKhrPerUsd),
      status: 'pending',
      orderRef: params.orderRef,
      providerRef: '',
      receiptRef: '',
      manualNote: '',
      verifiedBy: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function submitManualPaymentProof(
  paymentId: string,
  receiptRef: string,
  manualNote: string
): Promise<void> {
  const path = `payments/${paymentId}`;
  try {
    await updateDoc(doc(db, 'payments', paymentId), {
      receiptRef: clampStr(receiptRef, 200),
      manualNote: clampStr(manualNote, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function listUserPayments(userId: string): Promise<PaymentRecord[]> {
  const path = 'payments';
  try {
    const q = query(collection(db, 'payments'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          userId: x.userId,
          userEmail: x.userEmail,
          plan: x.plan as PlanType,
          method: x.method as PaymentMethod,
          amountKhr: toIntegerKhr(Number(x.amountKhr || 0)),
          currency: 'KHR' as const,
          exchangeRateKhrPerUsd: Number(x.exchangeRateKhrPerUsd || 4000),
          status: x.status as PaymentStatus,
          orderRef: x.orderRef,
          providerRef: x.providerRef || '',
          receiptRef: x.receiptRef || '',
          manualNote: x.manualNote || '',
          verifiedBy: x.verifiedBy || '',
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listAllPaymentsAdmin(): Promise<PaymentRecord[]> {
  const path = 'payments';
  try {
    const snap = await getDocs(collection(db, 'payments'));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          userId: x.userId,
          userEmail: x.userEmail,
          plan: x.plan as PlanType,
          method: x.method as PaymentMethod,
          amountKhr: toIntegerKhr(Number(x.amountKhr || 0)),
          currency: 'KHR' as const,
          exchangeRateKhrPerUsd: Number(x.exchangeRateKhrPerUsd || 4000),
          status: x.status as PaymentStatus,
          orderRef: x.orderRef,
          providerRef: x.providerRef || '',
          receiptRef: x.receiptRef || '',
          manualNote: x.manualNote || '',
          verifiedBy: x.verifiedBy || '',
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminApprovePaymentAndActivatePremium(
  payment: PaymentRecord,
  actor: { uid: string; email: string }
): Promise<void> {
  const payPath = `payments/${payment.id}`;
  try {
    await updateDoc(doc(db, 'payments', payment.id), {
      status: 'paid',
      verifiedBy: actor.email,
      updatedAt: serverTimestamp(),
    });

    const existingSub = await fetchUserSubscription(payment.userId);
    const nextExpiryMs = calculateExpiryTimestamp(
      payment.plan,
      Date.now(),
      existingSub?.status === 'active' ? existingSub.expiresAt : undefined
    );
    const subId = existingSub?.id || `sub_${payment.userId}`;
    const subRef = doc(db, 'subscriptions', subId);
    const subSnap = await getDoc(subRef);

    if (subSnap.exists()) {
      await updateDoc(subRef, {
        plan: payment.plan,
        status: 'active',
        amountKhr: toIntegerKhr(payment.amountKhr),
        currency: 'KHR',
        startedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(nextExpiryMs),
        paymentId: payment.id,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(subRef, {
        userId: payment.userId,
        userEmail: payment.userEmail,
        plan: payment.plan,
        status: 'active',
        amountKhr: toIntegerKhr(payment.amountKhr),
        currency: 'KHR',
        startedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(nextExpiryMs),
        paymentId: payment.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'APPROVE_PAYMENT',
      targetCollection: 'payments',
      targetId: payment.id,
      summary: `Approved ${payment.orderRef} (៛${payment.amountKhr} KHR) and activated ${payment.plan} Premium for ${payment.userEmail}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, payPath);
  }
}

export async function adminUpdatePaymentStatus(
  payment: PaymentRecord,
  newStatus: PaymentStatus,
  actor: { uid: string; email: string }
): Promise<void> {
  const path = `payments/${payment.id}`;
  try {
    await updateDoc(doc(db, 'payments', payment.id), {
      status: newStatus,
      verifiedBy: actor.email,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'UPDATE_PAYMENT_STATUS',
      targetCollection: 'payments',
      targetId: payment.id,
      summary: `Set payment ${payment.orderRef} status to ${newStatus}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminUpsertSubscription(
  params: {
    userId: string;
    userEmail: string;
    plan: PlanType;
    status: SubscriptionStatus;
    amountKhr: number;
    expiresAtMs: number;
  },
  actor: { uid: string; email: string }
): Promise<void> {
  const subId = `sub_${params.userId}`;
  const path = `subscriptions/${subId}`;
  try {
    const ref = doc(db, 'subscriptions', subId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        plan: params.plan,
        status: params.status,
        amountKhr: toIntegerKhr(params.amountKhr),
        currency: 'KHR',
        expiresAt: Timestamp.fromMillis(params.expiresAtMs),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: params.userId,
        userEmail: clampStr(params.userEmail, 200),
        plan: params.plan,
        status: params.status,
        amountKhr: toIntegerKhr(params.amountKhr),
        currency: 'KHR',
        startedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(params.expiresAtMs),
        paymentId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'MANAGE_SUBSCRIPTION',
      targetCollection: 'subscriptions',
      targetId: subId,
      summary: `Set subscription for ${params.userEmail} to ${params.status} (${params.plan}, expires ${new Date(params.expiresAtMs).toISOString().slice(0, 10)})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// FAVORITES, WATCH HISTORY, COMMENTS, UPLOAD REQUESTS & REPORTS
// ============================================================================
export async function listUserFavorites(userId: string): Promise<FavoriteItem[]> {
  const path = 'favorites';
  try {
    const q = query(collection(db, 'favorites'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          userId: x.userId,
          seriesId: x.seriesId,
          seriesTitle: x.seriesTitle,
          posterUrl: x.posterUrl || '',
          createdAt: toMillis(x.createdAt),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function toggleFavoriteSeries(params: {
  userId: string;
  series: Pick<Series, 'id' | 'title' | 'posterUrl'>;
  existingFavId?: string;
}): Promise<boolean> {
  if (params.existingFavId) {
    const path = `favorites/${params.existingFavId}`;
    try {
      await deleteDoc(doc(db, 'favorites', params.existingFavId));
      return false;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
  const favId = `fav_${params.userId}_${params.series.id}`.slice(0, 128);
  const path = `favorites/${favId}`;
  try {
    await setDoc(doc(db, 'favorites', favId), {
      userId: params.userId,
      seriesId: params.series.id,
      seriesTitle: clampStr(params.series.title, 160),
      posterUrl: clampStr(params.series.posterUrl, 600),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveWatchProgress(params: {
  userId: string;
  seriesId: string;
  episodeId: string;
  seriesTitle: string;
  episodeTitle: string;
  posterUrl?: string;
  positionSec: number;
  durationSec: number;
}): Promise<void> {
  const historyId = `hist_${params.userId}_${params.episodeId}`.slice(0, 128);
  const path = `watch_history/${historyId}`;
  try {
    const ref = doc(db, 'watch_history', historyId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        positionSec: Math.max(0, Math.floor(params.positionSec)),
        durationSec: Math.max(0, Math.floor(params.durationSec)),
        episodeTitle: clampStr(params.episodeTitle, 160),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: params.userId,
        seriesId: params.seriesId,
        episodeId: params.episodeId,
        seriesTitle: clampStr(params.seriesTitle, 160),
        episodeTitle: clampStr(params.episodeTitle, 160),
        posterUrl: clampStr(params.posterUrl, 600),
        positionSec: Math.max(0, Math.floor(params.positionSec)),
        durationSec: Math.max(0, Math.floor(params.durationSec)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listUserWatchHistory(userId: string): Promise<WatchHistoryItem[]> {
  const path = 'watch_history';
  try {
    const q = query(collection(db, 'watch_history'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          userId: x.userId,
          seriesId: x.seriesId,
          episodeId: x.episodeId,
          seriesTitle: x.seriesTitle,
          episodeTitle: x.episodeTitle,
          posterUrl: x.posterUrl || '',
          positionSec: Number(x.positionSec || 0),
          durationSec: Number(x.durationSec || 0),
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listCommentsForSeries(seriesId: string): Promise<CommentItem[]> {
  try {
    const q = query(collection(db, 'comments'), where('seriesId', '==', seriesId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          seriesId: x.seriesId,
          userId: x.userId,
          userName: x.userName,
          userAvatar: x.userAvatar || '',
          rating: Number(x.rating || 5),
          content: x.content,
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function createSeriesComment(params: {
  seriesId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  content: string;
}): Promise<CommentItem> {
  const commentId = makeDocId('cmt');
  const path = `comments/${commentId}`;
  try {
    const safeRating = Math.min(5, Math.max(1, Math.round(params.rating)));
    await setDoc(doc(db, 'comments', commentId), {
      seriesId: params.seriesId,
      userId: params.userId,
      userName: clampStr(params.userName, 100),
      userAvatar: clampStr(params.userAvatar, 500),
      rating: safeRating,
      content: clampStr(params.content, 1000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      id: commentId,
      seriesId: params.seriesId,
      userId: params.userId,
      userName: params.userName,
      userAvatar: params.userAvatar || '',
      rating: safeRating,
      content: clampStr(params.content, 1000),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function listUploadRequestsAdmin(): Promise<UploadRequest[]> {
  const path = 'upload_requests';
  try {
    const snap = await getDocs(collection(db, 'upload_requests'));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          seriesId: x.seriesId,
          seriesTitle: x.seriesTitle,
          creatorId: x.creatorId,
          creatorEmail: x.creatorEmail,
          rightsConfirmed: Boolean(x.rightsConfirmed),
          status: x.status as ModerationStatus,
          adminNote: x.adminNote || '',
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createContentReport(params: {
  seriesId: string;
  seriesTitle: string;
  episodeId?: string;
  reporterId: string;
  reporterEmail: string;
  reason: ReportReason;
  details: string;
}): Promise<void> {
  const reportId = makeDocId('rep');
  const path = `reports/${reportId}`;
  try {
    await setDoc(doc(db, 'reports', reportId), {
      seriesId: params.seriesId,
      seriesTitle: clampStr(params.seriesTitle, 160),
      episodeId: clampStr(params.episodeId, 128),
      reporterId: params.reporterId,
      reporterEmail: clampStr(params.reporterEmail, 200),
      reason: params.reason,
      details: clampStr(params.details, 1000),
      status: 'open',
      adminAction: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function listReportsAdmin(): Promise<ReportItem[]> {
  const path = 'reports';
  try {
    const snap = await getDocs(collection(db, 'reports'));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          seriesId: x.seriesId,
          seriesTitle: x.seriesTitle || '',
          episodeId: x.episodeId || '',
          reporterId: x.reporterId,
          reporterEmail: x.reporterEmail,
          reason: x.reason as ReportReason,
          details: x.details,
          status: x.status as 'open' | 'resolved' | 'dismissed',
          adminAction: x.adminAction || '',
          createdAt: toMillis(x.createdAt),
          updatedAt: toMillis(x.updatedAt),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminResolveReport(
  reportId: string,
  status: 'resolved' | 'dismissed',
  adminAction: string,
  actor: { uid: string; email: string }
): Promise<void> {
  const path = `reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      adminAction: clampStr(adminAction, 300),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'RESOLVE_REPORT',
      targetCollection: 'reports',
      targetId: reportId,
      summary: `Marked report ${reportId} as ${status}: ${adminAction}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
