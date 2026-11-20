import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Database,
  Download,
  Film,
  Flag,
  History,
  LayoutGrid,
  Receipt,
  Settings,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  adminApprovePaymentAndActivatePremium,
  adminDeleteCategory,
  adminModerateSeries,
  adminResolveReport,
  adminSaveCategory,
  adminSeedStarterCatalog,
  adminToggleCreatorVerified,
  adminUpdatePaymentStatus,
  adminUpdateUserAccount,
  adminUpsertSubscription,
  deleteSeriesAndEpisodes,
  fetchAllSeriesAdmin,
  listAllPaymentsAdmin,
  listAllSubscriptionsAdmin,
  listAllUsers,
  listAuditLogs,
  listCreators,
  listReportsAdmin,
  saveSiteSettings,
} from '../lib/firestoreService';
import { fetchPaymentGatewayStatus } from '../lib/apiClient';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/firebase';
import {
  computeRevenueMetrics,
  formatKhr,
  generatePaymentsCsv,
  khrToUsdReference,
} from '../utils/billing';
import type {
  AccountStatus,
  AuditLogItem,
  CreatorProfile,
  PaymentGatewayStatus,
  PaymentRecord,
  PlanType,
  ReportItem,
  Series,
  SiteSettings,
  Subscription,
  SubscriptionStatus,
  UserProfile,
} from '../types';

type AdminTab =
  | 'overview'
  | 'premium'
  | 'payments'
  | 'content'
  | 'users'
  | 'categories'
  | 'reports'
  | 'audit';

export function AdminPage() {
  const {
    firebaseUser,
    isAdmin,
    siteSettings,
    categories,
    refreshSettings,
    refreshCatalog,
  } = useApp();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Admin datasets
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [gatewayEnv, setGatewayEnv] = useState<PaymentGatewayStatus | null>(null);

  // Editable Premium & Site Settings Form
  const [settingsForm, setSettingsForm] = useState<Omit<SiteSettings, 'updatedAt'>>({
    monthlyPriceKhr: siteSettings.monthlyPriceKhr,
    yearlyPriceKhr: siteSettings.yearlyPriceKhr,
    exchangeRateKhrPerUsd: siteSettings.exchangeRateKhrPerUsd,
    currency: 'KHR',
    khqrEnabled: siteSettings.khqrEnabled,
    abaPayWayEnabled: siteSettings.abaPayWayEnabled,
    manualVerificationEnabled: siteSettings.manualVerificationEnabled,
    adFreePremiumEnabled: siteSettings.adFreePremiumEnabled,
    khqrMerchantDisplayName: siteSettings.khqrMerchantDisplayName || '',
    abaMerchantDisplayName: siteSettings.abaMerchantDisplayName || '',
    manualInstructions: siteSettings.manualInstructions || '',
    heroTitle: siteSettings.heroTitle || '',
    heroSubtitle: siteSettings.heroSubtitle || '',
    heroBannerUrl: siteSettings.heroBannerUrl || '',
    announcementBanner: siteSettings.announcementBanner || '',
  });

  // Category creation form
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [newCatKhmer, setNewCatKhmer] = useState('');
  const [newCatOrder, setNewCatOrder] = useState(5);

  // Manual subscription manager form
  const [subTargetUid, setSubTargetUid] = useState('');
  const [subTargetEmail, setSubTargetEmail] = useState('');
  const [subPlan, setSubPlan] = useState<PlanType>('monthly');
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>('active');
  const [subExpiryDate, setSubExpiryDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  useEffect(() => {
    setSettingsForm({
      monthlyPriceKhr: siteSettings.monthlyPriceKhr,
      yearlyPriceKhr: siteSettings.yearlyPriceKhr,
      exchangeRateKhrPerUsd: siteSettings.exchangeRateKhrPerUsd,
      currency: 'KHR',
      khqrEnabled: siteSettings.khqrEnabled,
      abaPayWayEnabled: siteSettings.abaPayWayEnabled,
      manualVerificationEnabled: siteSettings.manualVerificationEnabled,
      adFreePremiumEnabled: siteSettings.adFreePremiumEnabled,
      khqrMerchantDisplayName: siteSettings.khqrMerchantDisplayName || '',
      abaMerchantDisplayName: siteSettings.abaMerchantDisplayName || '',
      manualInstructions: siteSettings.manualInstructions || '',
      heroTitle: siteSettings.heroTitle || '',
      heroSubtitle: siteSettings.heroSubtitle || '',
      heroBannerUrl: siteSettings.heroBannerUrl || '',
      announcementBanner: siteSettings.announcementBanner || '',
    });
  }, [siteSettings]);

  const loadAllAdminData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [u, c, s, p, subs, rep, logs, gw] = await Promise.all([
        listAllUsers().catch(() => []),
        listCreators().catch(() => []),
        fetchAllSeriesAdmin().catch(() => []),
        listAllPaymentsAdmin().catch(() => []),
        listAllSubscriptionsAdmin().catch(() => []),
        listReportsAdmin().catch(() => []),
        listAuditLogs().catch(() => []),
        fetchPaymentGatewayStatus().catch(() => null),
      ]);
      setUsers(u);
      setCreators(c);
      setAllSeries(s);
      setPayments(p);
      setSubscriptions(subs);
      setReports(rep);
      setAuditLogs(logs);
      setGatewayEnv(gw);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadAllAdminData();
  }, [loadAllAdminData]);

  const revenue = useMemo(() => computeRevenueMetrics(payments), [payments]);

  if (!firebaseUser || !isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 flex items-center justify-center mx-auto">
          <Shield className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">Restricted Admin Control Panel</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Access to <span className="font-mono-tabular text-zinc-200">/admin</span> requires a verified Administrator account (bootstrapped owner:{' '}
          <span className="font-mono-tabular text-cyan-300">{BOOTSTRAPPED_ADMIN_EMAIL}</span>). All writes are enforced by hardened Cloud Firestore Security Rules.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/login" className="px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold">
            Sign In as Admin
          </Link>
          <Link to="/" className="px-5 py-2.5 rounded-lg bg-white/10 text-zinc-200 text-sm font-medium">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const actor = { uid: firebaseUser.uid, email: firebaseUser.email || BOOTSTRAPPED_ADMIN_EMAIL };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('Saving KHR pricing & platform settings...');
    try {
      await saveSiteSettings(settingsForm, actor);
      await refreshSettings();
      await loadAllAdminData();
      setFeedback('Settings saved to Firestore and recorded in Audit Log.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to save settings.');
    }
  };

  const handleExportCsv = () => {
    const csv = generatePaymentsCsv(payments);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `borina-tv-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSeedCatalog = async () => {
    setFeedback('Publishing curated starter dramas & categories to Firestore...');
    try {
      const count = await adminSeedStarterCatalog(actor);
      await refreshCatalog();
      await loadAllAdminData();
      setFeedback(`Seeded ${count} starter titles and categories to Firestore.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Catalog seed failed.');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim() || !newCatSlug.trim()) return;
    await adminSaveCategory(
      {
        name: newCatName.trim(),
        slug: newCatSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        khmerName: newCatKhmer.trim(),
        sortOrder: newCatOrder,
      },
      actor
    );
    setNewCatName('');
    setNewCatSlug('');
    setNewCatKhmer('');
    await refreshCatalog();
    await loadAllAdminData();
    setFeedback('Category saved.');
  };

  const handleManualSubscriptionSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTargetUid.trim() || !subTargetEmail.trim()) return;
    const expiryMs = new Date(`${subExpiryDate}T23:59:59Z`).getTime();
    await adminUpsertSubscription(
      {
        userId: subTargetUid.trim(),
        userEmail: subTargetEmail.trim(),
        plan: subPlan,
        status: subStatus,
        amountKhr:
          subPlan === 'yearly' ? siteSettings.yearlyPriceKhr : siteSettings.monthlyPriceKhr,
        expiresAtMs: expiryMs,
      },
      actor
    );
    await loadAllAdminData();
    setFeedback(`Subscription updated for ${subTargetEmail.trim()}.`);
  };

  const pendingUploadsCount = allSeries.filter((s) => s.status === 'pending').length;
  const activeSubsCount = subscriptions.filter(
    (s) => s.status === 'active' && s.expiresAt > Date.now()
  ).length;
  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  const navItems: Array<{ key: AdminTab; label: string; icon: React.ReactNode }> = [
    { key: 'overview', label: 'Overview', icon: <LayoutGrid className="w-4 h-4" /> },
    { key: 'premium', label: 'Premium & Pricing', icon: <Settings className="w-4 h-4" /> },
    { key: 'payments', label: 'Payments & Subs', icon: <Receipt className="w-4 h-4" /> },
    { key: 'content', label: `Content (${pendingUploadsCount})`, icon: <Film className="w-4 h-4" /> },
    { key: 'users', label: 'Users & Creators', icon: <Users className="w-4 h-4" /> },
    { key: 'categories', label: 'Categories', icon: <Database className="w-4 h-4" /> },
    { key: 'reports', label: `Reports (${openReportsCount})`, icon: <Flag className="w-4 h-4" /> },
    { key: 'audit', label: 'Audit Log', icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs font-medium text-cyan-300">BORINA TV · Administration & KHR Billing</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-0.5">Admin Control Panel</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-cyan-300" />
            Export Payments CSV
          </button>
          <button
            type="button"
            onClick={handleSeedCatalog}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs sm:text-sm font-semibold text-white whitespace-nowrap"
          >
            <Database className="w-4 h-4" />
            Seed Starter Catalog
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-4 py-3 text-xs sm:text-sm text-cyan-200 flex items-center justify-between gap-2">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} aria-label="Dismiss message">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              tab === item.key
                ? 'bg-purple-600 text-white'
                : 'bg-[#111119] text-zinc-300 hover:text-white border border-white/10'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-xs text-zinc-400">Syncing Firestore collections...</p>}

      {/* TAB 1: OVERVIEW & REVENUE STATISTICS */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminKpi
              label="Total Verified Revenue"
              value={formatKhr(revenue.totalPaidKhr)}
              sub={khrToUsdReference(revenue.totalPaidKhr, siteSettings.exchangeRateKhrPerUsd)}
            />
            <AdminKpi
              label="Monthly Plan Revenue"
              value={formatKhr(revenue.monthlyPlanRevenueKhr)}
              sub={`This month: ${formatKhr(revenue.currentMonthRevenueKhr)}`}
            />
            <AdminKpi
              label="Yearly Plan Revenue"
              value={formatKhr(revenue.yearlyPlanRevenueKhr)}
              sub={`This year: ${formatKhr(revenue.currentYearRevenueKhr)}`}
            />
            <AdminKpi
              label="Active Premium Subs"
              value={String(activeSubsCount)}
              sub={`${revenue.pendingCount} pending payment requests`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AdminKpi label="Registered Users" value={String(users.length)} sub={`${creators.length} Creator studios`} />
            <AdminKpi label="Pending Uploads" value={String(pendingUploadsCount)} sub={`${allSeries.length} Firestore titles`} />
            <AdminKpi label="Open Reports" value={String(openReportsCount)} sub="Copyright & moderation queue" />
          </div>
        </div>
      )}

      {/* TAB 2: PREMIUM PRICING, GATEWAYS & SITE BANNERS */}
      {tab === 'premium' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
              <h2 className="text-base font-semibold text-white">KHR Pricing & Exchange Rate</h2>
              <p className="text-xs text-zinc-400">
                All subscription transactions use integer KHR values saved directly to Firestore.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="admin-monthly-khr" className="block text-xs text-zinc-300 mb-1">
                    Monthly Premium Price (KHR ៛)
                  </label>
                  <input
                    id="admin-monthly-khr"
                    type="number"
                    min={1000}
                    step={500}
                    required
                    value={settingsForm.monthlyPriceKhr}
                    onChange={(e) =>
                      setSettingsForm((f) => ({ ...f, monthlyPriceKhr: Math.round(Number(e.target.value)) }))
                    }
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2 text-sm font-mono-tabular text-white"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1 font-mono-tabular">
                    Preview: {formatKhr(settingsForm.monthlyPriceKhr)} ({khrToUsdReference(settingsForm.monthlyPriceKhr, settingsForm.exchangeRateKhrPerUsd)})
                  </p>
                </div>

                <div>
                  <label htmlFor="admin-yearly-khr" className="block text-xs text-zinc-300 mb-1">
                    Yearly Premium Price (KHR ៛)
                  </label>
                  <input
                    id="admin-yearly-khr"
                    type="number"
                    min={1000}
                    step={1000}
                    required
                    value={settingsForm.yearlyPriceKhr}
                    onChange={(e) =>
                      setSettingsForm((f) => ({ ...f, yearlyPriceKhr: Math.round(Number(e.target.value)) }))
                    }
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2 text-sm font-mono-tabular text-white"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1 font-mono-tabular">
                    Preview: {formatKhr(settingsForm.yearlyPriceKhr)} ({khrToUsdReference(settingsForm.yearlyPriceKhr, settingsForm.exchangeRateKhrPerUsd)})
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="admin-fx-rate" className="block text-xs text-zinc-300 mb-1">
                  Reference Exchange Rate (KHR per 1 USD)
                </label>
                <input
                  id="admin-fx-rate"
                  type="number"
                  min={100}
                  step={50}
                  required
                  value={settingsForm.exchangeRateKhrPerUsd}
                  onChange={(e) =>
                    setSettingsForm((f) => ({
                      ...f,
                      exchangeRateKhrPerUsd: Math.round(Number(e.target.value)),
                    }))
                  }
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2 text-sm font-mono-tabular text-white"
                />
              </div>

              <div className="space-y-2.5 pt-2 border-t border-white/10">
                <ToggleRow
                  label="Enable KHQR (Bakong Cambodia)"
                  checked={settingsForm.khqrEnabled}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, khqrEnabled: v }))}
                />
                <ToggleRow
                  label="Enable ABA PayWay Checkout"
                  checked={settingsForm.abaPayWayEnabled}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, abaPayWayEnabled: v }))}
                />
                <ToggleRow
                  label="Enable Manual Payment Verification Fallback"
                  checked={settingsForm.manualVerificationEnabled}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, manualVerificationEnabled: v }))}
                />
                <ToggleRow
                  label="Ad-Free Experience for Premium Users"
                  checked={settingsForm.adFreePremiumEnabled}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, adFreePremiumEnabled: v }))}
                />
              </div>
            </section>

            {/* Merchant Credential Security Status + Website Banners */}
            <section className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
              <h2 className="text-base font-semibold text-white">Merchant Credentials & Banners</h2>

              <div className="rounded-lg border border-white/10 bg-[#090910] p-4 space-y-2 text-xs">
                <p className="font-semibold text-zinc-200">Server-Side Payment Gateway Credentials (.env)</p>
                <p className="text-zinc-400">
                  KHQR Credentials:{' '}
                  <span className={gatewayEnv?.khqrConfigured ? 'text-emerald-400' : 'text-amber-300'}>
                    {gatewayEnv?.khqrConfigured ? `Configured (${gatewayEnv.khqrMerchantName})` : 'Not Configured — Pending Manual Flow'}
                  </span>
                </p>
                <p className="text-zinc-400">
                  ABA PayWay Credentials:{' '}
                  <span className={gatewayEnv?.abaPayWayConfigured ? 'text-emerald-400' : 'text-amber-300'}>
                    {gatewayEnv?.abaPayWayConfigured
                      ? `Configured (${gatewayEnv.abaMerchantIdMasked})`
                      : 'Not Configured — Pending Manual Flow'}
                  </span>
                </p>
                <p className="text-zinc-500 leading-relaxed">
                  Secret keys (`KHQR_API_TOKEN`, `ABA_PAYWAY_API_KEY`) are read exclusively from server environment variables and are never stored in browser-readable Firestore documents.
                </p>
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">Manual Payment Desk Instructions</label>
                <textarea
                  rows={2}
                  maxLength={600}
                  value={settingsForm.manualInstructions}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, manualInstructions: e.target.value }))}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">Hero Banner Headline</label>
                <input
                  type="text"
                  maxLength={160}
                  value={settingsForm.heroTitle}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, heroTitle: e.target.value }))}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">Hero Banner Image URL</label>
                <input
                  type="text"
                  maxLength={600}
                  value={settingsForm.heroBannerUrl}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, heroBannerUrl: e.target.value }))}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-300 mb-1">Top Announcement Banner (optional)</label>
                <input
                  type="text"
                  maxLength={240}
                  value={settingsForm.announcementBanner}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, announcementBanner: e.target.value }))}
                  placeholder="e.g. New Khmer Drama Premiere every Friday at 8PM!"
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>
            </section>
          </div>

          <button
            type="submit"
            className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white"
          >
            Save Pricing, Gateways & Banner Settings
          </button>
        </form>
      )}

      {/* TAB 3: PAYMENTS MODERATION & SUBSCRIPTION MANAGEMENT */}
      {tab === 'payments' && (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">All Payment Transactions ({payments.length})</h2>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-xs font-medium text-white"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111119]">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-white/10 text-xs text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Order Ref</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Plan / Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Receipt Proof</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        No payment records found yet.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-mono-tabular text-xs text-cyan-300">{p.orderRef}</td>
                        <td className="px-4 py-3 text-zinc-200">{p.userEmail}</td>
                        <td className="px-4 py-3 capitalize text-zinc-300">
                          {p.plan} · {p.method.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular text-white">
                          {formatKhr(p.amountKhr)}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400">
                          {p.receiptRef ? `${p.receiptRef} ${p.manualNote ? `(${p.manualNote})` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 capitalize font-medium">
                          <span
                            className={
                              p.status === 'paid'
                                ? 'text-emerald-400'
                                : p.status === 'pending'
                                ? 'text-amber-300'
                                : 'text-rose-400'
                            }
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                          {p.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  await adminApprovePaymentAndActivatePremium(p, actor);
                                  await loadAllAdminData();
                                  setFeedback(`Approved ${p.orderRef} and activated Premium for ${p.userEmail}.`);
                                }}
                                className="px-2.5 py-1 rounded bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 text-xs font-medium"
                              >
                                Approve & Activate
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await adminUpdatePaymentStatus(p, 'failed', actor);
                                  await loadAllAdminData();
                                  setFeedback(`Marked ${p.orderRef} as failed.`);
                                }}
                                className="px-2.5 py-1 rounded bg-rose-600/25 hover:bg-rose-600/40 text-rose-200 text-xs font-medium"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {p.status === 'paid' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await adminUpdatePaymentStatus(p, 'refunded', actor);
                                await loadAllAdminData();
                                setFeedback(`Marked ${p.orderRef} as refunded.`);
                              }}
                              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-zinc-200 text-xs"
                            >
                              Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Direct Subscription Override Form */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleManualSubscriptionSave}
              className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4"
            >
              <h2 className="text-base font-semibold text-white">Activate, Suspend, or Set Expiration Date</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">User UID</label>
                  <input
                    type="text"
                    required
                    value={subTargetUid}
                    onChange={(e) => setSubTargetUid(e.target.value)}
                    placeholder="Select or paste user UID"
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs font-mono-tabular text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">User Email</label>
                  <input
                    type="email"
                    required
                    value={subTargetEmail}
                    onChange={(e) => setSubTargetEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Plan</label>
                  <select
                    value={subPlan}
                    onChange={(e) => setSubPlan(e.target.value as PlanType)}
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs text-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Status</label>
                  <select
                    value={subStatus}
                    onChange={(e) => setSubStatus(e.target.value as SubscriptionStatus)}
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs text-white"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="expired">Expired</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Expiration Date</label>
                  <input
                    type="date"
                    required
                    value={subExpiryDate}
                    onChange={(e) => setSubExpiryDate(e.target.value)}
                    className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-xs font-mono-tabular text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white"
              >
                Apply Membership Update
              </button>
            </form>

            <div className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-3">
              <h2 className="text-base font-semibold text-white">Active & Recent Subscriptions ({subscriptions.length})</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {subscriptions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 text-xs border-b border-white/10 pb-2"
                  >
                    <div className="min-w-0">
                      <p className="text-zinc-200 truncate">{s.userEmail || s.userId}</p>
                      <p className="text-zinc-500 font-mono-tabular">
                        {s.plan} · Expires {new Date(s.expiresAt).toISOString().slice(0, 10)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSubTargetUid(s.userId);
                        setSubTargetEmail(s.userEmail || '');
                        setSubPlan(s.plan);
                        setSubStatus(s.status);
                        setSubExpiryDate(new Date(s.expiresAt).toISOString().slice(0, 10));
                      }}
                      className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-cyan-300 shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: CONTENT & UPLOAD MODERATION */}
      {tab === 'content' && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Movies, Series & Upload Moderation Queue ({allSeries.length})</h2>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111119]">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-white/10 text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Creator</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Moderation Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {allSeries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                      No Firestore series yet. Click "Seed Starter Catalog" above or submit an upload from Creator Studio.
                    </td>
                  </tr>
                ) : (
                  allSeries.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{s.title}</p>
                        <p className="text-xs text-zinc-500">
                          {s.type} · {s.categorySlug} · {s.releaseYear}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{s.creatorName}</td>
                      <td className="px-4 py-3 capitalize font-medium">
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
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={async () => {
                            await adminModerateSeries(s.id, { isPremium: !s.isPremium }, actor);
                            await refreshCatalog();
                            await loadAllAdminData();
                            setFeedback(`Updated "${s.title}" to ${!s.isPremium ? 'Premium' : 'Free'}.`);
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${
                            s.isPremium
                              ? 'bg-purple-600/30 text-purple-200'
                              : 'bg-cyan-600/20 text-cyan-200'
                          }`}
                        >
                          {s.isPremium ? 'Premium' : 'Free'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={async () => {
                            await adminModerateSeries(s.id, { status: 'approved', moderationNote: '' }, actor);
                            await refreshCatalog();
                            await loadAllAdminData();
                            setFeedback(`Approved and published "${s.title}".`);
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 text-xs"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminModerateSeries(
                              s.id,
                              {
                                status: 'changes_requested',
                                moderationNote: 'Please verify video audio sync and subtitle formatting.',
                              },
                              actor
                            );
                            await refreshCatalog();
                            await loadAllAdminData();
                            setFeedback(`Requested changes on "${s.title}".`);
                          }}
                          className="px-2.5 py-1 rounded bg-amber-600/25 hover:bg-amber-600/40 text-amber-200 text-xs"
                        >
                          Request Changes
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminModerateSeries(
                              s.id,
                              { status: 'rejected', moderationNote: 'Did not pass copyright or quality guidelines.' },
                              actor
                            );
                            await refreshCatalog();
                            await loadAllAdminData();
                            setFeedback(`Rejected "${s.title}".`);
                          }}
                          className="px-2.5 py-1 rounded bg-rose-600/25 hover:bg-rose-600/40 text-rose-200 text-xs"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteSeriesAndEpisodes(s.id, { ...actor, isAdmin: true });
                            await refreshCatalog();
                            await loadAllAdminData();
                            setFeedback(`Deleted "${s.title}".`);
                          }}
                          aria-label={`Delete ${s.title}`}
                          className="p-1.5 rounded bg-white/5 hover:bg-rose-600/30 text-zinc-400 hover:text-rose-200 inline-flex align-middle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 5: USERS & CREATORS */}
      {tab === 'users' && (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Registered Users ({users.length})</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111119]">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-white/10 text-xs text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Account Status</th>
                    <th className="px-4 py-3 text-right">Quick Subscription</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {users.map((u) => (
                    <tr key={u.uid}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{u.displayName}</p>
                        <p className="text-xs text-zinc-400">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Role for ${u.email}`}
                          value={u.role}
                          onChange={async (e) => {
                            await adminUpdateUserAccount(
                              u.uid,
                              { role: e.target.value as 'user' | 'creator' | 'admin' },
                              actor
                            );
                            await loadAllAdminData();
                            setFeedback(`Updated role for ${u.email}.`);
                          }}
                          className="rounded bg-[#090910] border border-white/10 px-2.5 py-1 text-xs text-white"
                        >
                          <option value="user">User</option>
                          <option value="creator">Creator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Account status for ${u.email}`}
                          value={u.status}
                          onChange={async (e) => {
                            await adminUpdateUserAccount(
                              u.uid,
                              { status: e.target.value as AccountStatus },
                              actor
                            );
                            await loadAllAdminData();
                            setFeedback(`Updated account status for ${u.email}.`);
                          }}
                          className="rounded bg-[#090910] border border-white/10 px-2.5 py-1 text-xs text-white"
                        >
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                          <option value="banned">Banned</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSubTargetUid(u.uid);
                            setSubTargetEmail(u.email);
                            setTab('payments');
                          }}
                          className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs text-cyan-300"
                        >
                          Manage Premium
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Creator Studios ({creators.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {creators.map((c) => (
                <div key={c.uid} className="rounded-xl border border-white/10 bg-[#111119] p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{c.studioName}</p>
                    <p className="text-xs text-zinc-400">{c.verified ? 'Verified Studio' : 'Unverified'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await adminToggleCreatorVerified(c.uid, !c.verified, actor);
                      await loadAllAdminData();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-medium text-cyan-300 shrink-0"
                  >
                    {c.verified ? 'Revoke' : 'Verify'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 6: CATEGORIES */}
      {tab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSaveCategory} className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
            <h2 className="text-base font-semibold text-white">Add or Update Category</h2>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Category Name (English)</label>
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Action Cinema"
                className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">URL Slug</label>
              <input
                type="text"
                required
                value={newCatSlug}
                onChange={(e) => setNewCatSlug(e.target.value)}
                placeholder="action-cinema"
                className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm font-mono-tabular text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Khmer Label</label>
                <input
                  type="text"
                  value={newCatKhmer}
                  onChange={(e) => setNewCatKhmer(e.target.value)}
                  placeholder="ភាពយន្តសកម្មភាព"
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Sort Order</label>
                <input
                  type="number"
                  value={newCatOrder}
                  onChange={(e) => setNewCatOrder(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm font-mono-tabular text-white"
                />
              </div>
            </div>
            <button type="submit" className="px-4 py-2 rounded-lg bg-purple-600 text-xs font-semibold text-white">
              Save Category
            </button>
          </form>

          <div className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-3">
            <h2 className="text-base font-semibold text-white">Active Categories ({categories.length})</h2>
            <div className="divide-y divide-white/10">
              {categories.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {c.name} {c.khmerName && <span className="text-zinc-400">· {c.khmerName}</span>}
                    </p>
                    <p className="text-xs font-mono-tabular text-zinc-500">/{c.slug}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await adminDeleteCategory(c.id, actor);
                      await refreshCatalog();
                      await loadAllAdminData();
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: COPYRIGHT & CONTENT REPORTS */}
      {tab === 'reports' && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Copyright & Moderation Reports ({reports.length})</h2>
          {reports.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#111119] p-8 text-center text-sm text-zinc-500">
              No content or copyright reports submitted yet.
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl border border-white/10 bg-[#111119] p-5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      {r.seriesTitle || r.seriesId} · <span className="uppercase text-rose-300 text-xs">{r.reason}</span>
                    </p>
                    <span className="text-xs text-zinc-400 capitalize">{r.status}</span>
                  </div>
                  <p className="text-sm text-zinc-300">{r.details}</p>
                  <p className="text-xs text-zinc-500">Reported by {r.reporterEmail}</p>
                  {r.status === 'open' && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteSeriesAndEpisodes(r.seriesId, { ...actor, isAdmin: true });
                          await adminResolveReport(r.id, 'resolved', 'Removed infringing content', actor);
                          await refreshCatalog();
                          await loadAllAdminData();
                          setFeedback('Removed reported series and resolved complaint.');
                        }}
                        className="px-3 py-1.5 rounded bg-rose-600 text-xs font-semibold text-white"
                      >
                        Remove Series & Resolve
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await adminResolveReport(r.id, 'dismissed', 'Reviewed and dismissed', actor);
                          await loadAllAdminData();
                        }}
                        className="px-3 py-1.5 rounded bg-white/10 text-xs text-zinc-200"
                      >
                        Dismiss Report
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 8: IMMUTABLE ADMIN AUDIT LOG */}
      {tab === 'audit' && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Immutable Admin Audit Log ({auditLogs.length})</h2>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111119]">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-white/10 text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      Administrative actions will be recorded here automatically.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 font-mono-tabular text-xs text-zinc-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-300">{log.actorEmail}</td>
                      <td className="px-4 py-3 font-mono-tabular text-xs text-cyan-300">{log.action}</td>
                      <td className="px-4 py-3 text-xs text-zinc-200">{log.summary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function AdminKpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111119] p-5 space-y-1.5">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="text-2xl font-bold font-mono-tabular text-white">{value}</p>
      <p className="text-xs text-zinc-500 font-mono-tabular">{sub}</p>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
      <span className="text-sm text-zinc-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${
          checked ? 'bg-cyan-500 justify-end' : 'bg-zinc-700 justify-start'
        }`}
      >
        <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
          {checked && <Check className="w-3 h-3 text-zinc-900" />}
        </span>
      </button>
    </label>
  );
}
