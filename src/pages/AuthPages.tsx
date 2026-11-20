import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { useApp } from '../context/AppContext';

function mapAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not yet enabled in your Firebase Console (Authentication → Sign-in method → Enable Email/Password). You can use Google Sign-In immediately below.';
  }
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (msg.includes('auth/weak-password')) {
    return 'Password must be at least 6 characters long.';
  }
  if (msg.includes('auth/popup-closed-by-user')) {
    return 'Sign-in popup was closed before completing authentication.';
  }
  return msg;
}

export function LoginPage() {
  const { loginWithEmail, loginWithGoogle } = useApp();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await loginWithEmail(email, password);
      navigate('/profile');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await loginWithGoogle();
      navigate('/profile');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="rounded-2xl border border-white/10 bg-[#111119] p-8 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-white">Sign in to BORINA TV</h1>
          <p className="text-sm text-zinc-400">
            Access your watchlist, resume playback, upload dramas, and manage Premium billing.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleGoogle}
          className="w-full py-2.5 px-4 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          Continue with Google
        </button>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-white/10" />
          <span className="px-3 text-xs text-zinc-500">or sign in with email</span>
          <div className="flex-grow border-t border-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-zinc-300 mb-1.5">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="viewer@borina.tv"
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200 leading-relaxed">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors"
          >
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-center text-zinc-400">
          New to BORINA TV?{' '}
          <Link to="/register" className="text-cyan-300 hover:text-cyan-200 font-medium">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { registerWithEmail, loginWithGoogle } = useApp();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await registerWithEmail(email, password, displayName);
      if (result.needsVerification) {
        setSuccessMsg(
          'Account created! Please check your email inbox to verify your address before uploading content or initiating KHR payments.'
        );
      } else {
        navigate('/profile');
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await loginWithGoogle();
      navigate('/profile');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="rounded-2xl border border-white/10 bg-[#111119] p-8 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-white">Create your BORINA TV account</h1>
          <p className="text-sm text-zinc-400">
            Save favorite dramas, track watch history, and publish original films as a Creator.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleGoogle}
          className="w-full py-2.5 px-4 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Sign up with Google (Instant Verified)
        </button>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-white/10" />
          <span className="px-3 text-xs text-zinc-500">or register with email</span>
          <div className="flex-grow border-t border-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-xs font-medium text-zinc-300 mb-1.5">
              Full Name / Display Name
            </label>
            <input
              id="reg-name"
              type="text"
              required
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Sokha Dara"
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs font-medium text-zinc-300 mb-1.5">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-xs font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label htmlFor="reg-confirm" className="block text-xs font-medium text-zinc-300 mb-1.5">
              Confirm Password
            </label>
            <input
              id="reg-confirm"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full rounded-lg bg-[#090910] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200 leading-relaxed">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 p-3 text-xs text-cyan-200 leading-relaxed">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors"
          >
            {busy ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-xs text-center text-zinc-400">
          Already registered?{' '}
          <Link to="/login" className="text-cyan-300 hover:text-cyan-200 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
