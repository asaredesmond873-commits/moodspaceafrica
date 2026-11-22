import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { cleanupAccidentalAutoSeededPosts, ensureUserProfile } from '../services/firestoreService';
import type { PublicProfile } from '../types';

const SILENT_AUTH_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/popup-blocked',
  'auth/user-cancelled',
  'auth/redirect-cancelled-by-user',
  'auth/redirect-operation-pending',
]);

function isSilentAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err && typeof err.code === 'string' ? err.code : '';
  if (SILENT_AUTH_CODES.has(code)) return true;
  const msg = 'message' in err && typeof err.message === 'string' ? err.message : '';
  return (
    msg.includes('popup-closed-by-user') ||
    msg.includes('cancelled-popup-request') ||
    msg.includes('popup-blocked') ||
    msg.includes('user-cancelled') ||
    msg.includes('redirect-cancelled-by-user')
  );
}

function formatFriendlyAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
      ? err.code
      : '';
  if (code === 'auth/network-request-failed') {
    return 'Network connection interrupted. Please check your internet and try again.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many sign-in attempts. Please wait a moment and try again.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for Google Sign-In.';
  }
  const raw = err instanceof Error ? err.message : 'Unable to sign in right now.';
  if (raw.startsWith('{')) {
    return 'Unable to sync your profile right now. Please try signing in again.';
  }
  return raw;
}

function readCachedProfile(uid: string): PublicProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`moodspace_profile_cache_v1_${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicProfile;
    if (parsed && parsed.uid === uid && parsed.displayName) {
      return { ...parsed, createdAt: null, updatedAt: null };
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: PublicProfile) {
  if (typeof window === 'undefined') return;
  try {
    const slim = {
      uid: profile.uid,
      displayName: profile.displayName,
      bio: profile.bio,
      location: profile.location,
      accountType: profile.accountType,
      avatarUrl: profile.avatarUrl.startsWith('data:') && profile.avatarUrl.length > 50000 ? '' : profile.avatarUrl,
      isPublic: profile.isPublic,
      badgeVerified: Boolean(profile.badgeVerified),
      verifiedLabel: profile.verifiedLabel || '',
    };
    window.localStorage.setItem(`moodspace_profile_cache_v1_${profile.uid}`, JSON.stringify(slim));
  } catch {
    // Ignore storage quota errors
  }
}

interface AuthContextValue {
  user: User | null;
  profile: PublicProfile | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<PublicProfile | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setLocalProfile: (next: PublicProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubProfile: (() => void) | null = null;

    void getRedirectResult(auth)
      .then(async (result) => {
        if (!mounted || !result?.user) return;
        const loaded = await ensureUserProfile(result.user);
        if (!mounted) return;
        setProfile(loaded);
        writeCachedProfile(loaded);
        setAuthError(null);
        void cleanupAccidentalAutoSeededPosts(loaded.uid).catch(() => {});
      })
      .catch((err) => {
        if (!mounted) return;
        if (isSilentAuthError(err)) {
          setAuthError(null);
          return;
        }
        setAuthError(formatFriendlyAuthError(err));
      });

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && mounted) {
        setAuthError(null);
        setAuthBusy(false);
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setUser(nextUser);
      if (nextUser) {
        const cached = readCachedProfile(nextUser.uid);
        if (cached && mounted) {
          setProfile(cached);
          setAuthReady(true);
        }

        try {
          const loaded = await ensureUserProfile(nextUser);
          if (!mounted) return;
          setProfile(loaded);
          writeCachedProfile(loaded);
          setAuthError(null);
          void cleanupAccidentalAutoSeededPosts(loaded.uid).catch(() => {});

          unsubProfile = onSnapshot(
            doc(db, 'publicProfiles', nextUser.uid),
            (snap) => {
              if (snap.exists() && mounted) {
                const live = snap.data() as PublicProfile;
                setProfile(live);
                writeCachedProfile(live);
              }
            },
            (error) => {
              try {
                handleFirestoreError(error, OperationType.GET, `publicProfiles/${nextUser.uid}`);
              } catch {
                // Keep cached profile active if listener encounters transient error
              }
            }
          );
        } catch (err) {
          if (mounted) {
            setAuthError(formatFriendlyAuthError(err));
          }
        }
      } else {
        setProfile(null);
      }
      if (mounted) {
        setAuthReady(true);
      }
    });

    return () => {
      mounted = false;
      window.removeEventListener('pageshow', handlePageShow);
      if (unsubProfile) unsubProfile();
      unsubAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const loaded = await ensureUserProfile(cred.user);
      setProfile(loaded);
      writeCachedProfile(loaded);
      setAuthError(null);
      void cleanupAccidentalAutoSeededPosts(loaded.uid).catch(() => {});
      return loaded;
    } catch (err) {
      if (isSilentAuthError(err)) {
        setAuthError(null);
        return null;
      }
      setAuthError(formatFriendlyAuthError(err));
      return null;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthBusy(true);
    try {
      await signOut(auth);
      setProfile(null);
      setAuthError(null);
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const loaded = await ensureUserProfile(auth.currentUser);
    setProfile(loaded);
    writeCachedProfile(loaded);
  }, []);

  const setLocalProfile = useCallback((next: PublicProfile) => {
    setProfile(next);
    writeCachedProfile(next);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authReady,
        authBusy,
        authError,
        signInWithGoogle,
        logout,
        refreshProfile,
        setLocalProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
