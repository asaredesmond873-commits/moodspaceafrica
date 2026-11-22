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
import { auth, db, googleProvider } from '../firebase';
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
        setAuthError(null);
        void cleanupAccidentalAutoSeededPosts(loaded.uid).catch(() => {});
      })
      .catch((err) => {
        if (!mounted) return;
        if (isSilentAuthError(err)) {
          setAuthError(null);
          return;
        }
        const msg = err instanceof Error ? err.message : 'Unable to complete Google sign-in.';
        setAuthError(msg);
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
        try {
          const loaded = await ensureUserProfile(nextUser);
          if (!mounted) return;
          setProfile(loaded);
          setAuthError(null);
          void cleanupAccidentalAutoSeededPosts(loaded.uid).catch(() => {});

          unsubProfile = onSnapshot(doc(db, 'publicProfiles', nextUser.uid), (snap) => {
            if (snap.exists() && mounted) {
              setProfile(snap.data() as PublicProfile);
            }
          });
        } catch (err) {
          if (mounted) {
            setAuthError(err instanceof Error ? err.message : 'Unable to load your profile.');
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
      setAuthError(null);
      void cleanupAccidentalAutoSeededPosts(loaded.uid).catch(() => {});
      return loaded;
    } catch (err) {
      if (isSilentAuthError(err)) {
        setAuthError(null);
        return null;
      }
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      setAuthError(msg);
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
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const loaded = await ensureUserProfile(auth.currentUser);
    setProfile(loaded);
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
        setLocalProfile: setProfile,
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
