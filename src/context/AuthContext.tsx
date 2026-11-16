import {
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
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setUser(nextUser);
      if (nextUser) {
        try {
          const loaded = await ensureUserProfile(nextUser);
          setProfile(loaded);
          setAuthError(null);
          void cleanupAccidentalAutoSeededPosts(loaded.uid).catch(() => {});

          unsubProfile = onSnapshot(doc(db, 'publicProfiles', nextUser.uid), (snap) => {
            if (snap.exists()) {
              setProfile(snap.data() as PublicProfile);
            }
          });
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Unable to load your profile.');
        }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });

    return () => {
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
      void cleanupAccidentalAutoSeededPosts(loaded.uid).catch(() => {});
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
