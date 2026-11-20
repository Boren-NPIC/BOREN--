import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Clock, Crown, KeyRound, Receipt, Shield, Upload, User as UserIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  listUserPayments,
  listUserWatchHistory,
  updateOwnUserProfile,
} from '../lib/firestoreService';
import { uploadFileResumable } from '../lib/apiClient';
import { formatKhr, getEffectiveSubscriptionStatus } from '../utils/billing';
import { formatDuration, validateImageFile } from '../utils/media';
import type { PaymentRecord, WatchHistoryItem } from '../types';

export function ProfilePage() {
  const {
    firebaseUser,
    profile,
    role,
    isAdmin,
    isEmailVerified,
    subscription,
    favorites,
    refreshUserData,
    changeUserPassword,
  } = useApp();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setPhotoURL(profile.photoURL || '');
    }
  }, [profile]);

  useEffect(() => {
    if (!firebaseUser || !isEmailVerified) return;
    void Promise.all([
      listUserWatchHistory(firebaseUser.uid).catch(() => []),
      listUserPayments(firebaseUser.uid).catch(() => []),
    ]).then(([hist, pays]) => {
      setHistory(hist);
      setPayments(pays);
    });
  }, [firebaseUser, isEmailVerified]);

  if (!firebaseUser) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Sign in to view your profile</h1>
        <p className="text-sm text-zinc-400">
          Manage your profile avatar, password, watchlist, watch history, and KHR subscription receipts.
        </p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold">
          Sign In
        </Link>
      </div>
    );
  }

  const effectiveSubStatus = getEffectiveSubscriptionStatus(subscription);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.valid) {
      setProfileMsg(check.error || 'Invalid avatar image.');
      return;
    }
    setProfileBusy(true);
    setProfileMsg('Uploading avatar...');
    try {
      const res = await uploadFileResumable({ file, kind: 'image' });
      setPhotoURL(res.url);
      setProfileMsg('Avatar uploaded. Click Save Profile to apply.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Avatar upload failed.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailVerified) {
      setProfileMsg('Verify your email first to save profile changes.');
      return;
    }
    setProfileBusy(true);
    setProfileMsg('');
    try {
      await updateOwnUserProfile(firebaseUser.uid, { displayName, photoURL });
      await refreshUserData();
      setProfileMsg('Profile saved.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPassMsg('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassMsg('Passwords do not match.');
      return;
    }
    setPassBusy(true);
    setPassMsg('');
    try {
      await changeUserPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPassMsg('Password updated successfully.');
    } catch (err) {
      setPassMsg(
        err instanceof Error
          ? err.message
          : 'Could not change password. If you signed in with Google or long ago, sign in again first.'
      );
    } finally {
      setPassBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          {photoURL ? (
            <img
              src={photoURL}
              alt={displayName || 'Avatar'}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border border-white/15"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <UserIcon className="w-7 h-7" />
            </div>
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {profile?.displayName || firebaseUser.displayName || 'Viewer'}
            </h1>
            <p className="text-sm text-zinc-400">
              {firebaseUser.email} · Role: <span className="text-cyan-300 capitalize">{role}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/creator/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-zinc-100"
          >
            <Upload className="w-4 h-4 text-cyan-300" />
            Creator Studio
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-sm font-medium text-cyan-200"
            >
              <Shield className="w-4 h-4" />
              Admin Control Panel
            </Link>
          )}
        </div>
      </div>

      {/* Membership Summary + Profile & Password Forms */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subscription Status */}
        <section className="rounded-xl border border-white/10 bg-[#111119] p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-purple-300">
              <Crown className="w-5 h-5" />
              <h2 className="text-base font-semibold text-white">Membership Status</h2>
            </div>
            <p className="text-2xl font-bold text-white capitalize">
              {isAdmin ? 'Admin Full Access' : effectiveSubStatus === 'none' ? 'Free Plan' : effectiveSubStatus}
            </p>
            {subscription ? (
              <div className="text-xs text-zinc-400 space-y-1">
                <p>
                  Plan: <span className="text-zinc-200 capitalize">{subscription.plan}</span> (
                  <span className="font-mono-tabular">{formatKhr(subscription.amountKhr)}</span>)
                </p>
                <p>
                  Expires:{' '}
                  <span className="font-mono-tabular text-zinc-200">
                    {new Date(subscription.expiresAt).toLocaleDateString()}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 leading-relaxed">
                Upgrade to Premium to unlock all exclusive Khmer, Chinese, Korean, and Thai dramas with KHQR or ABA PayWay.
              </p>
            )}
          </div>
          <Link
            to="/membership"
            className="w-full text-center py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white transition-colors"
          >
            {effectiveSubStatus === 'active' ? 'Renew or Manage Plan' : 'Upgrade to Premium'}
          </Link>
        </section>

        {/* Edit Profile */}
        <form onSubmit={handleSaveProfile} className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
          <h2 className="text-base font-semibold text-white">Profile Settings</h2>
          <div>
            <label htmlFor="profile-name" className="block text-xs text-zinc-400 mb-1.5">
              Display Name
            </label>
            <input
              id="profile-name"
              type="text"
              required
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label htmlFor="profile-avatar-file" className="block text-xs text-zinc-400 mb-1.5">
              Upload Profile Avatar (JPG/PNG/WebP)
            </label>
            <input
              id="profile-avatar-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="w-full text-xs text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-zinc-100 hover:file:bg-white/20"
            />
          </div>
          {profileMsg && <p className="text-xs text-cyan-300">{profileMsg}</p>}
          <button
            type="submit"
            disabled={profileBusy}
            className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium text-white"
          >
            {profileBusy ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        {/* Change Password */}
        <form onSubmit={handleChangePassword} className="rounded-xl border border-white/10 bg-[#111119] p-6 space-y-4">
          <div className="flex items-center gap-2 text-cyan-300">
            <KeyRound className="w-4 h-4" />
            <h2 className="text-base font-semibold text-white">Change Password</h2>
          </div>
          <div>
            <label htmlFor="new-pass" className="block text-xs text-zinc-400 mb-1.5">
              New Password
            </label>
            <input
              id="new-pass"
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label htmlFor="confirm-pass" className="block text-xs text-zinc-400 mb-1.5">
              Confirm New Password
            </label>
            <input
              id="confirm-pass"
              type="password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3 py-2 text-sm text-white"
            />
          </div>
          {passMsg && <p className="text-xs text-cyan-300">{passMsg}</p>}
          <button
            type="submit"
            disabled={passBusy}
            className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium text-white"
          >
            {passBusy ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Favorites & Watch History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <Bookmark className="w-4 h-4 text-cyan-300" />
            <h2 className="text-lg font-semibold text-white">Saved Favorites ({favorites.length})</h2>
          </div>
          {favorites.length === 0 ? (
            <p className="text-sm text-zinc-500">You have not saved any dramas to your watchlist yet.</p>
          ) : (
            <div className="space-y-2.5">
              {favorites.map((fav) => (
                <Link
                  key={fav.id}
                  to={`/series/${fav.seriesId}`}
                  className="flex items-center gap-3.5 p-3 rounded-xl border border-white/10 bg-[#111119] hover:border-cyan-400/40 transition-colors"
                >
                  {fav.posterUrl && (
                    <img
                      src={fav.posterUrl}
                      alt={fav.seriesTitle}
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 rounded-md object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{fav.seriesTitle}</p>
                    <p className="text-xs text-zinc-400">Saved {new Date(fav.createdAt).toLocaleDateString()}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <Clock className="w-4 h-4 text-purple-300" />
            <h2 className="text-lg font-semibold text-white">Watch History ({history.length})</h2>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">Episodes you watch will appear here with automatic resume positions.</p>
          ) : (
            <div className="space-y-2.5">
              {history.map((h) => (
                <Link
                  key={h.id}
                  to={`/watch/${h.episodeId}`}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-white/10 bg-[#111119] hover:border-purple-400/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{h.seriesTitle}</p>
                    <p className="text-xs text-zinc-400 truncate">{h.episodeTitle}</p>
                  </div>
                  <span className="text-xs font-mono-tabular text-cyan-300 shrink-0">
                    Resume {formatDuration(h.positionSec)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Personal Payment History */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Receipt className="w-4 h-4 text-cyan-300" />
          <h2 className="text-lg font-semibold text-white">My Payment History (KHR)</h2>
        </div>

        {payments.length === 0 ? (
          <p className="text-sm text-zinc-500">No subscription transactions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111119]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Order Ref</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono-tabular text-xs text-zinc-200">{p.orderRef}</td>
                    <td className="px-4 py-3 capitalize text-zinc-200">{p.plan}</td>
                    <td className="px-4 py-3 uppercase text-xs text-zinc-400">{p.method.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-white">{formatKhr(p.amountKhr)}</td>
                    <td className="px-4 py-3 capitalize text-xs font-medium">
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
                    <td className="px-4 py-3 font-mono-tabular text-xs text-zinc-400">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
