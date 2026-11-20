export type UserRole = 'visitor' | 'user' | 'creator' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'banned';
export type ContentType = 'movie' | 'series';
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';
export type EpisodeStatus = 'pending' | 'approved' | 'rejected';
export type VideoFormat = 'mp4' | 'hls' | 'webm';
export type PlanType = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'expired' | 'pending' | 'suspended';
export type PaymentMethod = 'khqr' | 'aba_payway' | 'manual';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
export type ReportReason = 'copyright' | 'inappropriate' | 'broken_video' | 'spam';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'user' | 'creator' | 'admin';
  status: AccountStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorProfile {
  uid: string;
  studioName: string;
  bio?: string;
  avatarUrl?: string;
  verified: boolean;
  totalViews: number;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  khmerName?: string;
  description?: string;
  sortOrder: number;
  createdAt: number;
}

export interface Series {
  id: string;
  title: string;
  khmerTitle?: string;
  description: string;
  type: ContentType;
  categorySlug: string;
  releaseYear: number;
  posterUrl: string;
  coverUrl: string;
  creatorId: string;
  creatorName: string;
  isPremium: boolean;
  featured: boolean;
  status: ModerationStatus;
  moderationNote?: string;
  rightsConfirmed: boolean;
  viewsCount: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Episode {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  description?: string;
  durationSec: number;
  videoUrl: string;
  videoFormat: VideoFormat;
  subtitleUrl?: string;
  subtitleLang?: string;
  thumbnailUrl?: string;
  isPremium: boolean;
  creatorId: string;
  status: EpisodeStatus;
  viewsCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Subscription {
  id: string;
  userId: string;
  userEmail?: string;
  plan: PlanType;
  status: SubscriptionStatus;
  amountKhr: number;
  currency: 'KHR';
  startedAt?: number;
  expiresAt: number;
  paymentId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  userEmail: string;
  plan: PlanType;
  method: PaymentMethod;
  amountKhr: number;
  currency: 'KHR';
  exchangeRateKhrPerUsd: number;
  status: PaymentStatus;
  orderRef: string;
  providerRef?: string;
  receiptRef?: string;
  manualNote?: string;
  verifiedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WatchHistoryItem {
  id: string;
  userId: string;
  seriesId: string;
  episodeId: string;
  seriesTitle: string;
  episodeTitle: string;
  posterUrl?: string;
  positionSec: number;
  durationSec: number;
  createdAt: number;
  updatedAt: number;
}

export interface FavoriteItem {
  id: string;
  userId: string;
  seriesId: string;
  seriesTitle: string;
  posterUrl?: string;
  createdAt: number;
}

export interface CommentItem {
  id: string;
  seriesId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface UploadRequest {
  id: string;
  seriesId: string;
  seriesTitle: string;
  creatorId: string;
  creatorEmail: string;
  rightsConfirmed: boolean;
  status: ModerationStatus;
  adminNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReportItem {
  id: string;
  seriesId: string;
  seriesTitle?: string;
  episodeId?: string;
  reporterId: string;
  reporterEmail: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  adminAction?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SiteSettings {
  monthlyPriceKhr: number;
  yearlyPriceKhr: number;
  exchangeRateKhrPerUsd: number;
  currency: 'KHR';
  khqrEnabled: boolean;
  abaPayWayEnabled: boolean;
  manualVerificationEnabled: boolean;
  adFreePremiumEnabled: boolean;
  khqrMerchantDisplayName?: string;
  abaMerchantDisplayName?: string;
  manualInstructions?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroBannerUrl?: string;
  announcementBanner?: string;
  updatedAt: number;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  createdAt: number;
}

export interface PaymentGatewayStatus {
  khqrConfigured: boolean;
  abaPayWayConfigured: boolean;
  khqrMerchantName: string | null;
  abaMerchantIdMasked: string | null;
}

export interface PaymentOrderResult {
  orderRef: string;
  plan: PlanType;
  method: PaymentMethod;
  amountKhr: number;
  currency: 'KHR';
  exchangeRateKhrPerUsd: number;
  status: 'pending';
  providerConfigured: boolean;
  setupRequiredReason?: string;
  instructions: string[];
  expiresAtIso: string;
  abaCheckoutPayload?: {
    endpoint: string;
    tranId: string;
    reqTime: string;
    amount: string;
    currency: string;
    hash: string;
    merchantId: string;
  };
  khqrPayload?: {
    merchantName: string;
    merchantCity: string;
    billNumber: string;
    amountKhr: number;
    currencyCode: '116';
  };
}
