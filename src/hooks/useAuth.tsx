import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../services/firebase';
import {
  applyDocumentThemeAndDirection,
  ensureUserProfile,
  pingUserPresence,
  updateUserSettings,
} from '../services/majlisService';
import type {
  AppearanceMode,
  Language,
  PublicUser,
  SelectableUserStatus,
  ThemeMode,
  UserPrivate,
  UserStatus,
} from '../types/majlis';
import { normalizeAppearanceMode, normalizeThemeMode } from '../types/majlis';
import {
  getSelfEffectiveStatus,
  IDLE_TIMEOUT_MS,
  PRESENCE_HEARTBEAT_MS,
} from '../utils/validation';

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  needsVerification: boolean;
  userPrivate: UserPrivate | null;
  publicUser: PublicUser | null;
  theme: ThemeMode;
  appearanceMode: AppearanceMode;
  language: Language;
  isNavigatorOnline: boolean;
  presenceNowMs: number;
  preferredStatus: SelectableUserStatus;
  effectiveSelfStatus: UserStatus;
  setLocalTheme: (theme: ThemeMode) => void;
  setLocalAppearanceMode: (mode: AppearanceMode) => void;
  setLocalLanguage: (language: Language) => void;
  changeTheme: (theme: ThemeMode) => Promise<void>;
  changeLanguage: (language: Language) => Promise<void>;
  changePresenceStatus: (status: SelectableUserStatus) => Promise<void>;
  refreshVerification: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userPrivate, setUserPrivate] = useState<UserPrivate | null>(null);
  const [publicUser, setPublicUser] = useState<PublicUser | null>(null);
  const [isNavigatorOnline, setIsNavigatorOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [presenceNowMs, setPresenceNowMs] = useState<number>(() => Date.now());
  const [localTheme, setLocalTheme] = useState<ThemeMode>(() => {
    return normalizeThemeMode(localStorage.getItem('majlis_theme'));
  });
  const [localAppearanceMode, setLocalAppearanceMode] = useState<AppearanceMode>(() =>
    normalizeAppearanceMode(localStorage.getItem('majlis_appearance_mode'))
  );
  const [localLanguage, setLocalLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('majlis_lang');
    return saved === 'en' ? 'en' : 'ar';
  });
  const [preferredStatus, setPreferredStatus] = useState<SelectableUserStatus>('online');
  const [isAutoIdle, setIsAutoIdle] = useState(false);
  const [verificationTick, setVerificationTick] = useState(0);
  const profileRepairKeyRef = useRef<string | null>(null);

  const theme = localTheme;
  const appearanceMode = localAppearanceMode;
  const language = userPrivate?.language ?? localLanguage;

  useEffect(() => {
    applyDocumentThemeAndDirection(theme, language, appearanceMode);
    localStorage.setItem('majlis_theme', theme);
    localStorage.setItem('majlis_appearance_mode', appearanceMode);
    localStorage.setItem('majlis_lang', language);

  }, [theme, appearanceMode, language]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);

      if (user && user.emailVerified) {
        const pendingUsername = sessionStorage.getItem('majlis_pending_username') || undefined;
        const pendingDisplay = sessionStorage.getItem('majlis_pending_display') || undefined;
        try {
          const ensured = await ensureUserProfile(user, pendingUsername, pendingDisplay);
          setPublicUser((prev) => prev || ensured);
          sessionStorage.removeItem('majlis_pending_username');
          sessionStorage.removeItem('majlis_pending_display');
        } catch (err) {
          console.error('Failed to bootstrap profile:', err);
        }
      } else {
        profileRepairKeyRef.current = null;
        setUserPrivate(null);
        setPublicUser(null);
      }
    });
    return unsub;
  }, []);

  const needsVerification = Boolean(firebaseUser && !firebaseUser.emailVerified);

  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;

    const uid = firebaseUser.uid;
    const repairKey = `${uid}_${verificationTick}`;
    const triggerRepairIfNeeded = () => {
      if (profileRepairKeyRef.current === repairKey) return;
      profileRepairKeyRef.current = repairKey;
      void ensureUserProfile(firebaseUser)
        .then((ensured) => {
          setPublicUser((prev) => prev || ensured);
        })
        .catch((err) => {
          console.error('Failed to self-heal missing profile:', err);
        });
    };

    const unsubPriv = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setUserPrivate(snap.data() as UserPrivate);
        } else {
          setUserPrivate(null);
          triggerRepairIfNeeded();
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${uid}`);
      }
    );

    const unsubPub = onSnapshot(
      doc(db, 'publicUsers', uid),
      (snap) => {
        if (snap.exists()) {
          setPublicUser(snap.data() as PublicUser);
        } else {
          setPublicUser(null);
          triggerRepairIfNeeded();
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `publicUsers/${uid}`);
      }
    );

    return () => {
      unsubPriv();
      unsubPub();
    };
  }, [firebaseUser, verificationTick]);

  // Restore saved presence preference when authenticated user changes
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setPreferredStatus('online');
      setIsAutoIdle(false);
      return;
    }
    const saved = localStorage.getItem(`majlis_presence_${firebaseUser.uid}`);
    if (saved === 'idle' || saved === 'dnd' || saved === 'online') {
      setPreferredStatus(saved);
    } else {
      setPreferredStatus('online');
    }
    setIsAutoIdle(false);
  }, [firebaseUser?.uid]);

  const activePresenceTarget: SelectableUserStatus =
    preferredStatus === 'online' ? (isAutoIdle ? 'idle' : 'online') : preferredStatus;

  const effectiveSelfStatus: UserStatus = publicUser?.hideOnlineStatus
    ? 'offline'
    : getSelfEffectiveStatus(publicUser?.status || activePresenceTarget, isNavigatorOnline);

  // Automatic inactivity detection (transitions 'online' -> 'idle' after IDLE_TIMEOUT_MS)
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;
    if (preferredStatus !== 'online') {
      setIsAutoIdle(false);
      return;
    }

    let idleTimer: number | null = null;
    let lastActivityAt = Date.now();

    const scheduleIdleTimer = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        setIsAutoIdle(true);
      }, IDLE_TIMEOUT_MS);
    };

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityAt < 1000 && !isAutoIdle) return;
      lastActivityAt = now;
      if (isAutoIdle) {
        setIsAutoIdle(false);
      }
      scheduleIdleTimer();
    };

    scheduleIdleTimer();
    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });

    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [firebaseUser, preferredStatus, isAutoIdle]);

  const hideOnline = Boolean(publicUser?.hideOnlineStatus);

  // Automatic presence: 30s heartbeat + online/idle/dnd/offline network + tab close handling
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;
    const uid = firebaseUser.uid;

    const syncActivePresence = () => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        setIsNavigatorOnline(true);
        void pingUserPresence(uid, activePresenceTarget, hideOnline);
      } else {
        setIsNavigatorOnline(false);
      }
    };

    syncActivePresence();

    const heartbeatInterval = window.setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        void pingUserPresence(uid, activePresenceTarget, hideOnline);
      }
    }, PRESENCE_HEARTBEAT_MS);

    // Periodic UI clock tick so stale >60s users transition to offline automatically
    const uiTickInterval = window.setInterval(() => {
      setPresenceNowMs(Date.now());
    }, 15_000);

    const handleOnline = () => {
      setIsNavigatorOnline(true);
      setPresenceNowMs(Date.now());
      void pingUserPresence(uid, activePresenceTarget, hideOnline);
    };

    const handleOffline = () => {
      setIsNavigatorOnline(false);
      setPresenceNowMs(Date.now());
      void pingUserPresence(uid, 'offline', true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        setPresenceNowMs(Date.now());
        void pingUserPresence(uid, activePresenceTarget, hideOnline);
      }
    };

    const handleUnload = () => {
      void pingUserPresence(uid, 'offline', true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.clearInterval(heartbeatInterval);
      window.clearInterval(uiTickInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [firebaseUser, activePresenceTarget, hideOnline]);

  const changeTheme = useCallback(
    async (nextTheme: ThemeMode) => {
      setLocalTheme(nextTheme);
      if (firebaseUser?.emailVerified) {
        await updateUserSettings(firebaseUser.uid, { theme: appearanceMode });
      }
    },
    [firebaseUser, appearanceMode]
  );

  const changeLanguage = useCallback(
    async (nextLang: Language) => {
      setLocalLanguage(nextLang);
      if (firebaseUser?.emailVerified) {
        await updateUserSettings(firebaseUser.uid, { language: nextLang });
      }
    },
    [firebaseUser]
  );

  const changePresenceStatus = useCallback(
    async (nextStatus: SelectableUserStatus) => {
      setPreferredStatus(nextStatus);
      setIsAutoIdle(false);
      if (firebaseUser?.uid) {
        localStorage.setItem(`majlis_presence_${firebaseUser.uid}`, nextStatus);
        if (firebaseUser.emailVerified && (typeof navigator === 'undefined' || navigator.onLine)) {
          await pingUserPresence(firebaseUser.uid, nextStatus, hideOnline);
        }
      }
    },
    [firebaseUser, hideOnline]
  );

  const refreshVerification = useCallback(async () => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const updated = auth.currentUser;
    setFirebaseUser(updated);
    setVerificationTick((n) => n + 1);
    if (updated.emailVerified) {
      const pendingUsername = sessionStorage.getItem('majlis_pending_username') || undefined;
      const pendingDisplay = sessionStorage.getItem('majlis_pending_display') || undefined;
      const ensured = await ensureUserProfile(updated, pendingUsername, pendingDisplay);
      setPublicUser((prev) => prev || ensured);
      sessionStorage.removeItem('majlis_pending_username');
      sessionStorage.removeItem('majlis_pending_display');
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    if (firebaseUser?.emailVerified) {
      await pingUserPresence(firebaseUser.uid, 'offline', true);
    }
    await signOut(auth);
  }, [firebaseUser]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        needsVerification,
        userPrivate,
        publicUser,
        theme,
        appearanceMode,
        language,
        isNavigatorOnline,
        presenceNowMs,
        preferredStatus,
        effectiveSelfStatus,
        setLocalTheme,
        setLocalAppearanceMode,
        setLocalLanguage,
        changeTheme,
        changeLanguage,
        changePresenceStatus,
        refreshVerification,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
