import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { auth, googleProvider } from '../firebase';
import { ensureUserProfile, syncFeedToOnlyTidalRave } from '../services/firestoreService';
import type { PublicProfile } from '../types';

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
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const loaded = await ensureUserProfile(nextUser);
          setProfile(loaded);
          setAuthError(null);
          void syncFeedToOnlyTidalRave(loaded).catch(() => {});
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Unable to load your profile.');
        }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const loaded = await ensureUserProfile(cred.user);
      setProfile(loaded);
      void syncFeedToOnlyTidalRave(loaded).catch(() => {});
      return loaded;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in was cancelled or failed.';
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
