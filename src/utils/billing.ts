import type {
  Episode,
  PaymentRecord,
  PlanType,
  Series,
  SiteSettings,
  Subscription,
  UserRole,
} from '../types';

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  monthlyPriceKhr: 8000,
  yearlyPriceKhr: 100000,
  exchangeRateKhrPerUsd: 4000,
  currency: 'KHR',
  khqrEnabled: true,
  abaPayWayEnabled: true,
  manualVerificationEnabled: true,
  adFreePremiumEnabled: true,
  khqrMerchantDisplayName: 'BORINA TV Cambodia',
  abaMerchantDisplayName: 'BORINA TV Streaming',
  manualInstructions:
    'If automated gateway credentials are not yet configured, complete transfer via official BORINA TV KHQR or ABA merchant desk and submit your transaction reference below for Admin verification.',
  heroTitle: 'Twilight Over Angkor',
  heroSubtitle:
    'Stream original Khmer, Chinese, Korean, and Thai dramas crafted by independent studios across Southeast Asia.',
  heroBannerUrl: '/src/assets/images/hero_angkor_twilight_1795154613551.jpg',
  announcementBanner: '',
  updatedAt: Date.now(),
};

/**
 * Normalize any numeric input into a safe positive integer KHR value.
 */
export function toIntegerKhr(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

/**
 * Format integer KHR amount using the official Khmer Riel symbol (៛).
 */
export function formatKhr(amountKhr: number): string {
  const intVal = toIntegerKhr(amountKhr);
  return `៛${intVal.toLocaleString('en-US')}`;
}

/**
 * Calculate reference USD equivalent from integer KHR and configurable exchange rate.
 */
export function khrToUsdReference(
  amountKhr: number,
  exchangeRateKhrPerUsd: number = DEFAULT_SITE_SETTINGS.exchangeRateKhrPerUsd
): string {
  const rate = exchangeRateKhrPerUsd > 0 ? exchangeRateKhrPerUsd : 4000;
  const usd = toIntegerKhr(amountKhr) / rate;
  return `$${usd.toFixed(2)} USD`;
}

/**
 * Return exact integer KHR price for a given subscription plan from live settings.
 */
export function calculatePlanAmountKhr(
  plan: PlanType,
  settings: Pick<SiteSettings, 'monthlyPriceKhr' | 'yearlyPriceKhr'>
): number {
  return plan === 'yearly'
    ? toIntegerKhr(settings.yearlyPriceKhr)
    : toIntegerKhr(settings.monthlyPriceKhr);
}

/**
 * Compute expiration date (UTC ms) for monthly (+30 days) or yearly (+365 days) plans.
 * Extends from existing active expiry if renewing early.
 */
export function calculateExpiryTimestamp(
  plan: PlanType,
  baseTimestampMs: number = Date.now(),
  currentExpiresAtMs?: number
): number {
  const anchor =
    currentExpiresAtMs && currentExpiresAtMs > baseTimestampMs
      ? currentExpiresAtMs
      : baseTimestampMs;
  const days = plan === 'yearly' ? 365 : 30;
  return anchor + days * 24 * 60 * 60 * 1000;
}

/**
 * Determine whether a subscription currently grants active Premium access.
 */
export function isSubscriptionActive(
  subscription: Subscription | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'active') return false;
  return subscription.expiresAt > nowMs;
}

/**
 * Effective subscription status accounting for real-time expiration.
 */
export function getEffectiveSubscriptionStatus(
  subscription: Subscription | null | undefined,
  nowMs: number = Date.now()
): 'none' | 'active' | 'expired' | 'pending' | 'suspended' {
  if (!subscription) return 'none';
  if (subscription.status === 'active' && subscription.expiresAt <= nowMs) {
    return 'expired';
  }
  return subscription.status;
}

/**
 * Authorization gate for Free vs Premium video playback.
 */
export function canAccessEpisode(params: {
  episode: Pick<Episode, 'isPremium' | 'status' | 'creatorId'>;
  series: Pick<Series, 'isPremium' | 'status' | 'creatorId'>;
  subscription: Subscription | null | undefined;
  userId?: string | null;
  userRole?: UserRole;
  nowMs?: number;
}): { allowed: boolean; reason: 'ok' | 'unapproved' | 'auth_required' | 'premium_required' } {
  const { episode, series, subscription, userId, userRole = 'visitor', nowMs = Date.now() } = params;
  const isOwner = Boolean(userId && (episode.creatorId === userId || series.creatorId === userId));
  const isAdmin = userRole === 'admin';

  if (series.status !== 'approved' || episode.status !== 'approved') {
    if (isAdmin || isOwner) return { allowed: true, reason: 'ok' };
    return { allowed: false, reason: 'unapproved' };
  }

  const requiresPremium = Boolean(episode.isPremium || series.isPremium);
  if (!requiresPremium) {
    return { allowed: true, reason: 'ok' };
  }

  if (isAdmin || isOwner) {
    return { allowed: true, reason: 'ok' };
  }

  if (!userId) {
    return { allowed: false, reason: 'auth_required' };
  }

  if (isSubscriptionActive(subscription, nowMs)) {
    return { allowed: true, reason: 'ok' };
  }

  return { allowed: false, reason: 'premium_required' };
}

export interface RevenueMetrics {
  totalPaidKhr: number;
  monthlyPlanRevenueKhr: number;
  yearlyPlanRevenueKhr: number;
  currentMonthRevenueKhr: number;
  currentYearRevenueKhr: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  refundedKhr: number;
}

/**
 * Aggregate integer KHR revenue statistics from payment transaction records.
 */
export function computeRevenueMetrics(
  payments: PaymentRecord[],
  nowMs: number = Date.now()
): RevenueMetrics {
  const now = new Date(nowMs);
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  const metrics: RevenueMetrics = {
    totalPaidKhr: 0,
    monthlyPlanRevenueKhr: 0,
    yearlyPlanRevenueKhr: 0,
    currentMonthRevenueKhr: 0,
    currentYearRevenueKhr: 0,
    paidCount: 0,
    pendingCount: 0,
    failedCount: 0,
    refundedKhr: 0,
  };

  for (const p of payments) {
    const amt = toIntegerKhr(p.amountKhr);
    if (p.status === 'paid') {
      metrics.paidCount += 1;
      metrics.totalPaidKhr += amt;
      if (p.plan === 'monthly') metrics.monthlyPlanRevenueKhr += amt;
      if (p.plan === 'yearly') metrics.yearlyPlanRevenueKhr += amt;
      const d = new Date(p.createdAt);
      if (d.getUTCFullYear() === currentYear) {
        metrics.currentYearRevenueKhr += amt;
        if (d.getUTCMonth() === currentMonth) {
          metrics.currentMonthRevenueKhr += amt;
        }
      }
    } else if (p.status === 'pending') {
      metrics.pendingCount += 1;
    } else if (p.status === 'failed' || p.status === 'expired') {
      metrics.failedCount += 1;
    } else if (p.status === 'refunded') {
      metrics.refundedKhr += amt;
    }
  }

  return metrics;
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export payment transactions as a standards-compliant CSV string.
 */
export function generatePaymentsCsv(payments: PaymentRecord[]): string {
  const headers = [
    'Order Reference',
    'User Email',
    'Plan',
    'Method',
    'Amount (KHR)',
    'Currency',
    'Exchange Rate (KHR/USD)',
    'Status',
    'Receipt Ref',
    'Verified By',
    'Created At (ISO)',
  ];
  const rows = payments.map((p) =>
    [
      p.orderRef,
      p.userEmail,
      p.plan,
      p.method,
      toIntegerKhr(p.amountKhr),
      p.currency,
      p.exchangeRateKhrPerUsd,
      p.status,
      p.receiptRef || '',
      p.verifiedBy || '',
      new Date(p.createdAt).toISOString(),
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  return [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}

/**
 * Generate a deterministic-format unique order reference for KHQR / ABA PayWay.
 */
export function createOrderReference(prefix: 'KHQR' | 'ABA' | 'MAN', nowMs: number = Date.now()): string {
  const ts = Math.floor(nowMs / 1000).toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BTV-${prefix}-${ts}-${rand}`;
}
