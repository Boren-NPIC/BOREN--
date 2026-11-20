import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, BOOTSTRAPPED_ADMIN_EMAIL, googleProvider } from '../lib/firebase';
import {
  fetchApprovedSeries,
  fetchCategories,
  fetchSiteSettings,
  fetchUserSubscription,
  listUserFavorites,
  syncUserProfile,
} from '../lib/firestoreService';
import { DEFAULT_SITE_SETTINGS, isSubscriptionActive } from '../utils/billing';
import { INITIAL_CATEGORIES, INITIAL_SERIES } from '../data/catalogSeed';
import type {
  Category,
  FavoriteItem,
  Series,
  SiteSettings,
  Subscription,
  UserProfile,
  UserRole,
} from '../types';

interface AppContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  role: UserRole;
  isAdmin: boolean;
  isEmailVerified: boolean;
  authReady: boolean;
  subscription: Subscription | null;
  isPremiumActive: boolean;
  favorites: FavoriteItem[];
  siteSettings: SiteSettings;
  categories: Category[];
  catalog: Series[];
  catalogLoading: boolean;
  refreshCatalog: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshUserData: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<{ needsVerification: boolean }>;
  resendVerification: () => Promise<void>;
  reloadVerificationStatus: () => Promise<boolean>;
  changeUserPassword: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [authReady, setAuthReady] = useState(false);

  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [catalog, setCatalog] = useState<Series[]>(INITIAL_SERIES);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    const settings = await fetchSiteSettings();
    setSiteSettings(settings);
  }, []);

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const [cats, seriesList] = await Promise.all([fetchCategories(), fetchApprovedSeries()]);
      setCategories(cats);
      setCatalog(seriesList);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const hydrateSignedInUser = useCallback(async (user: FirebaseUser) => {
    const isBootstrappedAdmin =
      user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() && user.emailVerified;

    if (!user.emailVerified) {
      setProfile({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Viewer',
        photoURL: user.photoURL || '',
        role: 'user',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setSubscription(null);
      setFavorites([]);
      return;
    }

    try {
      const synced = await syncUserProfile({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Viewer',
        photoURL: user.photoURL || '',
        isBootstrappedAdmin,
      });
      setProfile(synced);

      const [sub, favs] = await Promise.all([
        fetchUserSubscription(user.uid).catch(() => null),
        listUserFavorites(user.uid).catch(() => []),
      ]);
      setSubscription(sub);
      setFavorites(favs);
    } catch (err) {
      console.error('Failed to hydrate user Firestore profile:', err);
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    if (!auth.currentUser) return;
    await hydrateSignedInUser(auth.currentUser);
  }, [hydrateSignedInUser]);

  useEffect(() => {
    void refreshSettings();
    void refreshCatalog();
  }, [refreshSettings, refreshCatalog]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await hydrateSignedInUser(user);
      } else {
        setProfile(null);
        setSubscription(null);
        setFavorites([]);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [hydrateSignedInUser]);

  const loginWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    await hydrateSignedInUser(cred.user);
  }, [hydrateSignedInUser]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await hydrateSignedInUser(cred.user);
    },
    [hydrateSignedInUser]
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: displayName.trim() });
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // Non-fatal if SMTP/quota throttled
      }
      await hydrateSignedInUser(cred.user);
      return { needsVerification: !cred.user.emailVerified };
    },
    [hydrateSignedInUser]
  );

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }, []);

  const reloadVerificationStatus = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const updated = auth.currentUser;
    setFirebaseUser(updated);
    if (updated.emailVerified) {
      await hydrateSignedInUser(updated);
      return true;
    }
    return false;
  }, [hydrateSignedInUser]);

  const changeUserPassword = useCallback(async (newPassword: string) => {
    if (!auth.currentUser) throw new Error('Please sign in first.');
    await updatePassword(auth.currentUser, newPassword);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const isAdmin = useMemo(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return false;
    if (firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) return true;
    return profile?.role === 'admin';
  }, [firebaseUser, profile]);

  const role: UserRole = useMemo(() => {
    if (!firebaseUser) return 'visitor';
    if (isAdmin) return 'admin';
    return profile?.role || 'user';
  }, [firebaseUser, isAdmin, profile]);

  const isPremiumActive = useMemo(() => {
    if (isAdmin) return true;
    return isSubscriptionActive(subscription);
  }, [isAdmin, subscription]);

  const value = useMemo<AppContextValue>(
    () => ({
      firebaseUser,
      profile,
      role,
      isAdmin,
      isEmailVerified: Boolean(firebaseUser?.emailVerified),
      authReady,
      subscription,
      isPremiumActive,
      favorites,
      siteSettings,
      categories,
      catalog,
      catalogLoading,
      refreshCatalog,
      refreshSettings,
      refreshUserData,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      resendVerification,
      reloadVerificationStatus,
      changeUserPassword,
      logout,
    }),
    [
      firebaseUser,
      profile,
      role,
      isAdmin,
      authReady,
      subscription,
      isPremiumActive,
      favorites,
      siteSettings,
      categories,
      catalog,
      catalogLoading,
      refreshCatalog,
      refreshSettings,
      refreshUserData,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      resendVerification,
      reloadVerificationStatus,
      changeUserPassword,
      logout,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
