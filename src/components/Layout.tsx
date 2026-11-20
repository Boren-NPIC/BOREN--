import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Crown,
  Film,
  LogOut,
  Menu,
  Shield,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    firebaseUser,
    profile,
    isAdmin,
    isEmailVerified,
    isPremiumActive,
    siteSettings,
    resendVerification,
    reloadVerificationStatus,
    logout,
  } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState('');
  const navigate = useNavigate();

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    await logout();
    navigate('/');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 ${
      isActive ? 'text-cyan-300 border-b border-cyan-400' : 'text-zinc-300 hover:text-white'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-[#07070b] text-zinc-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-16 bg-[#07070b]/92 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <Link
            to="/"
            className="text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            BORINA <span className="text-cyan-400">TV</span>
          </Link>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7"
          >
            <NavLink to="/movies" className={navLinkClass}>
              Movies
            </NavLink>
            <NavLink to="/series" className={navLinkClass}>
              Series
            </NavLink>
            <NavLink to="/free" className={navLinkClass}>
              Free
            </NavLink>
            <NavLink to="/premium" className={navLinkClass}>
              Premium
            </NavLink>
            <NavLink to="/membership" className={navLinkClass}>
              Membership
            </NavLink>
          </nav>

          {/* Zone 3: Single Primary Action / Account Control */}
          <div className="flex items-center gap-3 shrink-0">
            {firebaseUser ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((o) => !o)}
                  aria-expanded={accountMenuOpen}
                  aria-label="Open account menu"
                  className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#14141f] hover:bg-[#1c1c2b] border border-white/10 text-sm font-medium text-zinc-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <UserIcon className="w-4 h-4 text-cyan-300" />
                  <span className="max-w-[120px] truncate">
                    {profile?.displayName || firebaseUser.displayName || 'Account'}
                  </span>
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 rounded-xl bg-[#111119] border border-white/10 shadow-2xl py-2 z-50"
                  >
                    <div className="px-4 py-2.5 border-b border-white/10">
                      <p className="text-sm font-semibold text-white truncate">
                        {profile?.displayName || firebaseUser.displayName || 'Viewer'}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">{firebaseUser.email}</p>
                      <p className="text-xs mt-1 text-zinc-400">
                        {isAdmin ? 'Admin' : isPremiumActive ? 'Premium Member' : 'Free Member'}
                      </p>
                    </div>
                    <Link
                      to="/profile"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <UserIcon className="w-4 h-4 text-zinc-400" />
                      Profile & Watchlist
                    </Link>
                    <Link
                      to="/creator/dashboard"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <Upload className="w-4 h-4 text-cyan-400" />
                      Creator Studio
                    </Link>
                    <Link
                      to="/membership"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <Crown className="w-4 h-4 text-purple-400" />
                      Premium Billing
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-cyan-300 hover:bg-white/5"
                      >
                        <Shield className="w-4 h-4 text-cyan-400" />
                        Admin Panel
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-300 hover:bg-white/5 border-t border-white/10 mt-1"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden p-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/5"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0e0e16] border-b border-white/10 px-4 py-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: '/', label: 'Home' },
              { to: '/movies', label: 'Movies' },
              { to: '/series', label: 'Series' },
              { to: '/free', label: 'Free Watch' },
              { to: '/premium', label: 'Premium' },
              { to: '/membership', label: 'Membership' },
              { to: '/creator/dashboard', label: 'Creator Studio' },
              { to: '/profile', label: 'Profile' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg bg-white/5 text-sm font-medium text-zinc-200 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg bg-cyan-500/15 text-sm font-medium text-cyan-300 col-span-2"
              >
                Admin Control Panel
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Optional Admin Announcement Banner */}
      {siteSettings.announcementBanner && (
        <div className="bg-purple-950/60 border-b border-purple-500/20 px-4 py-2 text-center text-xs sm:text-sm text-purple-100">
          {siteSettings.announcementBanner}
        </div>
      )}

      {/* Email Verification Prompt for newly registered Email/Password accounts */}
      {firebaseUser && !isEmailVerified && (
        <div className="bg-amber-950/60 border-b border-amber-500/30 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-amber-100">
            <span>
              Please verify your email address ({firebaseUser.email}) to save favorites, submit uploads, or initiate KHR payments.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await resendVerification();
                  setVerifyFeedback('Verification email sent. Check your inbox.');
                }}
                className="px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-medium whitespace-nowrap"
              >
                Resend Email
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await reloadVerificationStatus();
                  setVerifyFeedback(ok ? 'Email verified!' : 'Not verified yet — click the link in your inbox.');
                }}
                className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white font-medium whitespace-nowrap"
              >
                Refresh Status
              </button>
            </div>
            {verifyFeedback && <p className="w-full text-xs text-amber-200">{verifyFeedback}</p>}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Clean Editorial Footer */}
      <footer className="border-t border-white/10 bg-[#050508] mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <Link to="/" className="inline-flex items-center gap-2 text-lg font-bold text-white">
              <Film className="w-5 h-5 text-cyan-400" />
              BORINA TV
            </Link>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Community streaming cinema for Khmer, Chinese, Korean, and Thai dramas. Built with creator moderation and KHR billing.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Browse Catalog</h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link to="/movies" className="hover:text-white transition-colors">Movies</Link></li>
              <li><Link to="/series" className="hover:text-white transition-colors">TV Series</Link></li>
              <li><Link to="/free" className="hover:text-white transition-colors">Free to Watch</Link></li>
              <li><Link to="/premium" className="hover:text-white transition-colors">Premium Originals</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Drama Categories</h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link to="/category/khmer-drama" className="hover:text-white transition-colors">Khmer Drama · រឿងភាគខ្មែរ</Link></li>
              <li><Link to="/category/chinese-drama" className="hover:text-white transition-colors">Chinese Drama · រឿងភាគចិន</Link></li>
              <li><Link to="/category/korean-drama" className="hover:text-white transition-colors">Korean Drama · រឿងភាគកូរ៉េ</Link></li>
              <li><Link to="/category/thai-drama" className="hover:text-white transition-colors">Thai Drama · រឿងភាគថៃ</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Platform</h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link to="/membership" className="hover:text-white transition-colors">Premium Membership (KHR)</Link></li>
              <li><Link to="/creator/dashboard" className="hover:text-white transition-colors">Creator Studio</Link></li>
              <li><Link to="/creator/upload" className="hover:text-white transition-colors">Upload Series / Movie</Link></li>
              <li><Link to="/admin" className="hover:text-white transition-colors">Admin Control Panel</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 px-4 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} BORINA TV Cambodia. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
