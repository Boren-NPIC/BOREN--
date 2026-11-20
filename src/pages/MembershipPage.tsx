import { Link } from 'react-router-dom';
import { Check, Crown, ShieldCheck, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatKhr,
  getEffectiveSubscriptionStatus,
  khrToUsdReference,
} from '../utils/billing';

export function MembershipPage() {
  const { siteSettings, subscription, isAdmin, firebaseUser } = useApp();
  const effectiveStatus = getEffectiveSubscriptionStatus(subscription);

  const monthlyKhr = siteSettings.monthlyPriceKhr;
  const yearlyKhr = siteSettings.yearlyPriceKhr;
  const exchangeRate = siteSettings.exchangeRateKhrPerUsd;

  const comparisonRows = [
    { feature: 'Browse full Khmer, Chinese, Korean & Thai catalog', free: true, premium: true },
    { feature: 'Watch all Free movies & community dramas', free: true, premium: true },
    { feature: 'Create favorites watchlist & track resume position', free: true, premium: true },
    { feature: 'Unlimited access to Premium Originals & exclusive finales', free: false, premium: true },
    {
      feature: siteSettings.adFreePremiumEnabled
        ? 'Ad-free cinema playback experience'
        : 'Priority HD & HLS streaming access',
      free: false,
      premium: true,
    },
    { feature: 'Verified KHQR & ABA PayWay Cambodia billing receipts', free: false, premium: true },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="max-w-2xl space-y-3">
        <p className="text-xs sm:text-sm font-medium text-cyan-300 tracking-wide">
          BORINA TV Premium · Cambodia KHR Billing
        </p>
        <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
          Stream every Khmer & Asian drama in Khmer Riel
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
          Transparent pricing in KHR (៛) with KHQR and ABA PayWay support. Reference exchange rate:{' '}
          <span className="font-mono-tabular text-zinc-200">
            1 USD = {exchangeRate.toLocaleString('en-US')} KHR
          </span>
          .
        </p>
      </div>

      {/* Live Subscription Status Banner */}
      {firebaseUser && (
        <div className="rounded-xl border border-white/10 bg-[#111119] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">Your Current Membership</p>
            <p className="text-lg font-semibold text-white capitalize">
              {isAdmin
                ? 'Administrator (Full Premium Access)'
                : effectiveStatus === 'active'
                ? `Active Premium (${subscription?.plan})`
                : effectiveStatus === 'expired'
                ? 'Expired Premium Membership'
                : effectiveStatus === 'suspended'
                ? 'Suspended Membership'
                : effectiveStatus === 'pending'
                ? 'Pending Payment Verification'
                : 'Free Member'}
            </p>
            {subscription && (
              <p className="text-xs text-zinc-400 font-mono-tabular">
                Expiration Date: {new Date(subscription.expiresAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}
          </div>
          <Link
            to="/profile"
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-medium text-white"
          >
            View Billing History
          </Link>
        </div>
      )}

      {/* KHR Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Premium */}
        <article className="rounded-2xl border border-white/10 bg-[#111119] p-8 flex flex-col justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Monthly Premium</h2>
              <span className="text-xs font-medium text-cyan-300">Flexible 30-Day Pass</span>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-bold text-white font-mono-tabular">
                {formatKhr(monthlyKhr)}
                <span className="text-base font-normal text-zinc-400"> / month</span>
              </p>
              <p className="text-xs text-zinc-400 font-mono-tabular">
                Approx. {khrToUsdReference(monthlyKhr, exchangeRate)} at 1 USD = {exchangeRate.toLocaleString()} KHR
              </p>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Full access to all Premium movies, Korean/Chinese/Thai/Khmer series, and exclusive finale episodes for 30 days.
            </p>
            <ul className="space-y-2.5 text-sm text-zinc-300 pt-2">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                All Free & Premium series and feature films
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                {siteSettings.adFreePremiumEnabled ? 'Ad-free streaming across desktop & mobile' : 'Full HD & HLS adaptive playback'}
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                Pay via KHQR or ABA PayWay
              </li>
            </ul>
          </div>

          <Link
            to="/payment?plan=monthly"
            className="w-full py-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-center text-sm font-semibold text-white transition-colors"
          >
            Subscribe Now — {formatKhr(monthlyKhr)}
          </Link>
        </article>

        {/* Yearly Premium */}
        <article className="rounded-2xl border border-purple-500/50 bg-[#141122] p-8 flex flex-col justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white inline-flex items-center gap-2">
                <Crown className="w-5 h-5 text-purple-400" />
                Yearly Premium
              </h2>
              <span className="text-xs font-medium text-purple-300">Full 365-Day Pass</span>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-bold text-white font-mono-tabular">
                {formatKhr(yearlyKhr)}
                <span className="text-base font-normal text-zinc-400"> / year</span>
              </p>
              <p className="text-xs text-zinc-400 font-mono-tabular">
                Approx. {khrToUsdReference(yearlyKhr, exchangeRate)} at 1 USD = {exchangeRate.toLocaleString()} KHR
              </p>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Uninterrupted annual cinema membership covering every Premiere release, exclusive finale, and community film for a full year.
            </p>
            <ul className="space-y-2.5 text-sm text-zinc-200 pt-2">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                365 days of unlimited Premium Originals
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                {siteSettings.adFreePremiumEnabled ? 'Ad-free streaming across all devices' : 'Priority HLS streaming'}
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                Single annual KHQR or ABA PayWay payment
              </li>
            </ul>
          </div>

          <Link
            to="/payment?plan=yearly"
            className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-center text-sm font-semibold text-white transition-colors"
          >
            Subscribe Now — {formatKhr(yearlyKhr)}
          </Link>
        </article>
      </div>

      {/* Free vs Premium Matrix */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Free vs Premium Benefits</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111119]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs text-zinc-400">
              <tr>
                <th className="px-5 py-3.5 font-medium">Benefit</th>
                <th className="px-5 py-3.5 font-medium text-center">Free Account</th>
                <th className="px-5 py-3.5 font-medium text-center text-purple-300">Premium Member</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {comparisonRows.map((row) => (
                <tr key={row.feature}>
                  <td className="px-5 py-3.5 text-zinc-200">{row.feature}</td>
                  <td className="px-5 py-3.5 text-center">
                    {row.free ? (
                      <Check className="w-4 h-4 text-cyan-400 inline" aria-label="Included" />
                    ) : (
                      <X className="w-4 h-4 text-zinc-600 inline" aria-label="Not included" />
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <Check className="w-4 h-4 text-purple-400 inline" aria-label="Included" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-xl border border-white/10 bg-[#111119] p-5 flex items-start gap-3 text-xs sm:text-sm text-zinc-400">
        <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-zinc-200">Verified Payment Security:</strong> BORINA TV verifies all KHQR and ABA PayWay transactions server-side or via Administrator confirmation before activating Premium access. We never trust client-side payment flags.
        </p>
      </div>
    </div>
  );
}
