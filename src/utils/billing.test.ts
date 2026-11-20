import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SITE_SETTINGS,
  calculateExpiryTimestamp,
  calculatePlanAmountKhr,
  canAccessEpisode,
  computeRevenueMetrics,
  formatKhr,
  generatePaymentsCsv,
  getEffectiveSubscriptionStatus,
  isSubscriptionActive,
  khrToUsdReference,
} from './billing';
import type { PaymentRecord, Subscription } from '../types';

test('default KHR pricing and integer formatting match Cambodia production requirements', () => {
  assert.equal(DEFAULT_SITE_SETTINGS.monthlyPriceKhr, 8000);
  assert.equal(DEFAULT_SITE_SETTINGS.yearlyPriceKhr, 100000);
  assert.equal(DEFAULT_SITE_SETTINGS.exchangeRateKhrPerUsd, 4000);
  assert.equal(formatKhr(8000), '៛8,000');
  assert.equal(formatKhr(100000), '៛100,000');
  assert.equal(khrToUsdReference(8000, 4000), '$2.00 USD');
  assert.equal(khrToUsdReference(100000, 4000), '$25.00 USD');
});

test('plan amount calculation enforces integer KHR and respects admin updates', () => {
  const custom = { monthlyPriceKhr: 12500.4, yearlyPriceKhr: 119999.9 };
  assert.equal(calculatePlanAmountKhr('monthly', custom), 12500);
  assert.equal(calculatePlanAmountKhr('yearly', custom), 120000);
});

test('subscription expiry and active/expired checks enforce real expiration timestamps', () => {
  const now = Date.UTC(2026, 10, 19, 12, 0, 0);
  const monthlyExpiry = calculateExpiryTimestamp('monthly', now);
  const yearlyExpiry = calculateExpiryTimestamp('yearly', now);
  assert.equal(monthlyExpiry - now, 30 * 24 * 60 * 60 * 1000);
  assert.equal(yearlyExpiry - now, 365 * 24 * 60 * 60 * 1000);

  const activeSub: Subscription = {
    id: 'sub1',
    userId: 'u1',
    plan: 'monthly',
    status: 'active',
    amountKhr: 8000,
    currency: 'KHR',
    expiresAt: monthlyExpiry,
    createdAt: now,
    updatedAt: now,
  };
  assert.equal(isSubscriptionActive(activeSub, now), true);
  assert.equal(getEffectiveSubscriptionStatus(activeSub, now), 'active');

  const afterExpiry = monthlyExpiry + 1000;
  assert.equal(isSubscriptionActive(activeSub, afterExpiry), false);
  assert.equal(getEffectiveSubscriptionStatus(activeSub, afterExpiry), 'expired');
});

test('Premium video access authorization enforces Free vs Premium, expiration, and moderation status', () => {
  const now = Date.UTC(2026, 10, 19, 12, 0, 0);
  const freeSeries = { isPremium: false, status: 'approved' as const, creatorId: 'c1' };
  const premiumSeries = { isPremium: true, status: 'approved' as const, creatorId: 'c1' };
  const pendingSeries = { isPremium: false, status: 'pending' as const, creatorId: 'c1' };
  const freeEp = { isPremium: false, status: 'approved' as const, creatorId: 'c1' };
  const premiumEp = { isPremium: true, status: 'approved' as const, creatorId: 'c1' };

  // Visitor can watch Free approved content
  assert.equal(
    canAccessEpisode({ episode: freeEp, series: freeSeries, subscription: null, nowMs: now }).allowed,
    true
  );

  // Visitor cannot watch Premium content
  const visitorPrem = canAccessEpisode({
    episode: premiumEp,
    series: premiumSeries,
    subscription: null,
    nowMs: now,
  });
  assert.equal(visitorPrem.allowed, false);
  assert.equal(visitorPrem.reason, 'auth_required');

  // Signed-in Free user cannot watch Premium content
  const freeUserPrem = canAccessEpisode({
    episode: premiumEp,
    series: premiumSeries,
    subscription: null,
    userId: 'u2',
    userRole: 'user',
    nowMs: now,
  });
  assert.equal(freeUserPrem.allowed, false);
  assert.equal(freeUserPrem.reason, 'premium_required');

  // Active Premium subscriber can watch Premium content
  const activeSub: Subscription = {
    id: 'sub2',
    userId: 'u2',
    plan: 'yearly',
    status: 'active',
    amountKhr: 100000,
    currency: 'KHR',
    expiresAt: now + 86400_000,
    createdAt: now,
    updatedAt: now,
  };
  assert.equal(
    canAccessEpisode({
      episode: premiumEp,
      series: premiumSeries,
      subscription: activeSub,
      userId: 'u2',
      userRole: 'user',
      nowMs: now,
    }).allowed,
    true
  );

  // Pending content is blocked for non-owner users, allowed for creator owner & admin
  assert.equal(
    canAccessEpisode({
      episode: freeEp,
      series: pendingSeries,
      subscription: activeSub,
      userId: 'u2',
      userRole: 'user',
      nowMs: now,
    }).reason,
    'unapproved'
  );
  assert.equal(
    canAccessEpisode({
      episode: freeEp,
      series: pendingSeries,
      subscription: null,
      userId: 'c1',
      userRole: 'creator',
      nowMs: now,
    }).allowed,
    true
  );
});

test('revenue metrics and CSV export calculate KHR totals accurately', () => {
  const now = Date.UTC(2026, 10, 19, 12, 0, 0);
  const payments: PaymentRecord[] = [
    {
      id: 'p1',
      userId: 'u1',
      userEmail: 'a@example.com',
      plan: 'monthly',
      method: 'khqr',
      amountKhr: 8000,
      currency: 'KHR',
      exchangeRateKhrPerUsd: 4000,
      status: 'paid',
      orderRef: 'BTV-KHQR-001',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'p2',
      userId: 'u2',
      userEmail: 'b@example.com',
      plan: 'yearly',
      method: 'aba_payway',
      amountKhr: 100000,
      currency: 'KHR',
      exchangeRateKhrPerUsd: 4000,
      status: 'paid',
      orderRef: 'BTV-ABA-002',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'p3',
      userId: 'u3',
      userEmail: 'c@example.com',
      plan: 'monthly',
      method: 'manual',
      amountKhr: 8000,
      currency: 'KHR',
      exchangeRateKhrPerUsd: 4000,
      status: 'pending',
      orderRef: 'BTV-MAN-003',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const metrics = computeRevenueMetrics(payments, now);
  assert.equal(metrics.totalPaidKhr, 108000);
  assert.equal(metrics.monthlyPlanRevenueKhr, 8000);
  assert.equal(metrics.yearlyPlanRevenueKhr, 100000);
  assert.equal(metrics.paidCount, 2);
  assert.equal(metrics.pendingCount, 1);

  const csv = generatePaymentsCsv(payments);
  assert.ok(csv.includes('Order Reference,User Email,Plan'));
  assert.ok(csv.includes('BTV-KHQR-001,a@example.com,monthly,khqr,8000,KHR'));
  assert.ok(csv.includes('BTV-ABA-002,b@example.com,yearly,aba_payway,100000,KHR'));
});
