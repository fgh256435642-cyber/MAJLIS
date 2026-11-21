import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import {
  createDefaultUserSettings,
  getLocalSessionCreatedAtMs,
  getOrCreateLocalSessionId,
  registerCurrentSession,
  saveDetailedUserSettings,
  updateCustomStatus,
} from '../services/nexusService';
import type {
  BlockedUser,
  NotificationMode,
  UserSession,
  UserSettings,
} from '../types/nexus';
import {
  darkenHexColor,
  getAccentContrast,
  isDndScheduleActive,
  isTargetMuted,
  isValidHexColor,
} from '../utils/validation';
import { useAuth } from './useAuth';
import { useToast } from './useToast';

interface UserSettingsContextValue {
  settings: UserSettings;
  settingsLoaded: boolean;
  blockedUsers: BlockedUser[];
  blockedUserIds: Set<string>;
  sessions: UserSession[];
  currentSessionId: string;
  isEffectivelyDnd: boolean;
  updateSetting: (
    partial: Partial<UserSettings>,
    options?: { silent?: boolean }
  ) => Promise<void>;
  getServerNotificationMode: (serverId?: string) => NotificationMode;
  isServerMuted: (serverId?: string) => boolean;
  isChannelMuted: (channelId?: string) => boolean;
  muteServer: (serverId: string, durationMs: number | 'forever' | 'unmute') => Promise<void>;
  setServerNotificationMode: (serverId: string, mode: NotificationMode) => Promise<void>;
  muteChannel: (channelId: string, durationMs: number | 'forever' | 'unmute') => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null);

function loadCachedSettings(uid?: string): UserSettings {
  const base = createDefaultUserSettings(uid || 'guest');
  if (typeof localStorage !== 'undefined') {
    const savedTheme = localStorage.getItem('nexus_theme');
    if (
      savedTheme === 'basic' ||
      savedTheme === 'warm' ||
      savedTheme === 'royal' ||
      savedTheme === 'forest' ||
      savedTheme === 'ocean'
    ) {
      base.themeMode = savedTheme;
    }
    const savedLang = localStorage.getItem('nexus_lang');
    if (savedLang === 'en' || savedLang === 'ar') {
      base.language = savedLang;
    }
  }
  if (!uid) return base;
  try {
    const raw = localStorage.getItem(`nexus_user_settings_${uid}`);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      ...base,
      ...parsed,
      uid,
      shortcuts: { ...base.shortcuts, ...(parsed.shortcuts || {}) },
      serverNotifications: parsed.serverNotifications || {},
      channelMutes: parsed.channelMutes || {},
    };
  } catch {
    return base;
  }
}

export function UserSettingsProvider({ children }: { children: React.ReactNode }) {
  const {
    firebaseUser,
    publicUser,
    preferredStatus,
    language,
    setLocalTheme,
    setLocalLanguage,
    changeAccentColor,
    logout,
  } = useAuth();
  const { pushToast } = useToast();

  const uid = firebaseUser?.emailVerified ? firebaseUser.uid : undefined;
  const [settings, setSettings] = useState<UserSettings>(() => loadCachedSettings(uid));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() =>
    getOrCreateLocalSessionId()
  );

  const sessionRegisteredRef = useRef(false);
  const seenSelfSessionDocRef = useRef(false);
  const hasRemotePrefsRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pendingPatchRef = useRef<Partial<UserSettings>>({});
  const inFlightPatchRef = useRef<Partial<UserSettings>>({});
  const flushTimerRef = useRef<number | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingHasNonSilentRef = useRef(false);
  const debounceWaitersRef = useRef<Array<() => void>>([]);

  // Hydrate cached settings immediately on user change
  useEffect(() => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    pendingPatchRef.current = {};
    inFlightPatchRef.current = {};
    pendingHasNonSilentRef.current = false;
    hasRemotePrefsRef.current = false;
    debounceWaitersRef.current.forEach((resolve) => resolve());
    debounceWaitersRef.current = [];
    const nextCached = loadCachedSettings(uid);
    settingsRef.current = nextCached;
    setSettings(nextCached);
    setSettingsLoaded(false);
    sessionRegisteredRef.current = false;
    seenSelfSessionDocRef.current = false;
  }, [uid]);

  // Subscribe to Firestore detailed settings, blocked users & active sessions
  useEffect(() => {
    if (!uid) {
      setBlockedUsers([]);
      setSessions([]);
      return;
    }

    const activeSessId = getOrCreateLocalSessionId();
    setCurrentSessionId(activeSessId);

    void registerCurrentSession(uid).then((id) => {
      setCurrentSessionId(id);
      sessionRegisteredRef.current = true;
    });

    const unsubSettings = onSnapshot(
      doc(db, 'users', uid, 'settings', 'preferences'),
      (snap) => {
        if (snap.exists()) {
          hasRemotePrefsRef.current = true;
          const data = snap.data() as Partial<UserSettings>;
          const defaults = createDefaultUserSettings(uid);
          const inFlight = inFlightPatchRef.current;
          const queued = pendingPatchRef.current;
          const merged: UserSettings = {
            ...defaults,
            ...data,
            ...inFlight,
            ...queued,
            uid,
            shortcuts: {
              ...defaults.shortcuts,
              ...(data.shortcuts || {}),
              ...(inFlight.shortcuts || {}),
              ...(queued.shortcuts || {}),
            },
            serverNotifications:
              queued.serverNotifications ||
              inFlight.serverNotifications ||
              data.serverNotifications ||
              {},
            channelMutes:
              queued.channelMutes ||
              inFlight.channelMutes ||
              data.channelMutes ||
              {},
          };
          settingsRef.current = merged;
          setSettings(merged);
          try {
            localStorage.setItem(`nexus_user_settings_${uid}`, JSON.stringify(merged));
          } catch {
            // Ignore quota errors
          }

          // Check global session revocation timestamp
          const localCreatedMs = getLocalSessionCreatedAtMs();
          if (merged.sessionRevokedBeforeMs && merged.sessionRevokedBeforeMs > localCreatedMs) {
            void logout();
            return;
          }
        }
        setSettingsLoaded(true);
      },
      () => {
        setSettingsLoaded(true);
      }
    );

    const unsubBlocked = onSnapshot(
      collection(db, 'users', uid, 'blockedUsers'),
      (snap) => {
        setBlockedUsers(snap.docs.map((d) => d.data() as BlockedUser));
      },
      () => {}
    );

    const unsubSessions = onSnapshot(
      collection(db, 'users', uid, 'sessions'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as UserSession)
          .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        setSessions(list);

        const hasMine = list.some((s) => s.id === activeSessId);
        if (hasMine) {
          seenSelfSessionDocRef.current = true;
        } else if (sessionRegisteredRef.current && seenSelfSessionDocRef.current) {
          // Session was explicitly revoked from another device
          void logout();
        }
      },
      () => {}
    );

    return () => {
      unsubSettings();
      unsubBlocked();
      unsubSessions();
    };
  }, [uid, logout]);

  // Sync theme, accent, language & accessibility modifiers onto <html>
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (uid && settingsLoaded && hasRemotePrefsRef.current) {
      setLocalTheme(settings.themeMode);
      setLocalLanguage(settings.language);
      if (settings.accentPreset !== 'custom') {
        changeAccentColor(settings.accentPreset);
      }
    }

    if (settings.accentPreset === 'custom' && isValidHexColor(settings.customAccentHex)) {
      root.setAttribute('data-accent', 'custom');
      root.style.setProperty('--nexus-accent', settings.customAccentHex);
      root.style.setProperty('--nexus-accent-hover', darkenHexColor(settings.customAccentHex));
      root.style.setProperty('--accent', settings.customAccentHex);
      root.style.setProperty('--accent-hover', darkenHexColor(settings.customAccentHex));
      root.style.setProperty('--nexus-accent-hover', darkenHexColor(settings.customAccentHex));
      root.style.setProperty('--accent-contrast', getAccentContrast(settings.customAccentHex));
      root.style.setProperty('--lk-accent', settings.customAccentHex);
      localStorage.setItem('nexus_accent_custom', settings.customAccentHex);
    } else {
      root.style.removeProperty('--nexus-accent');
      root.style.removeProperty('--nexus-accent-hover');
      const presetHex: Record<string, string> = {
        indigo: '#5865F2',
        blue: '#2563EB',
        green: '#10B981',
        violet: '#8B5CF6',
        rose: '#E11D48',
        amber: '#D97706',
        cyan: '#0891B2',
        pink: '#DB2777',
      };
      const hex = presetHex[settings.accentPreset] || '#5865F2';
      root.style.setProperty('--accent', hex);
      root.style.setProperty('--nexus-accent', hex);
      root.style.setProperty('--accent-hover', darkenHexColor(hex));
      root.style.setProperty('--nexus-accent-hover', darkenHexColor(hex));
      root.style.setProperty('--accent-contrast', getAccentContrast(hex));
      root.style.setProperty('--lk-accent', hex);
      localStorage.removeItem('nexus_accent_custom');
      root.setAttribute('data-accent', settings.accentPreset === 'custom' ? 'indigo' : settings.accentPreset);
    }

    root.setAttribute('data-font-size', settings.fontSize);
    root.setAttribute('data-density', settings.density);
    root.setAttribute('data-avatar-shape', settings.avatarShape);
    root.setAttribute('data-reduced-motion', String(settings.reducedMotion));
    root.setAttribute('data-high-contrast', String(settings.highContrast));
    root.setAttribute('data-reduce-transparency', String(settings.reduceTransparency));
    root.setAttribute('data-large-controls', String(settings.largeControls));
  }, [settings, uid, settingsLoaded, setLocalTheme, setLocalLanguage, changeAccentColor]);

  // Clear expired custom status automatically
  useEffect(() => {
    if (!uid || !publicUser) return;
    const exp = publicUser.customStatusExpiresAtMs;
    if (!exp || exp <= 0) return;

    const remaining = exp - Date.now();
    if (remaining <= 0) {
      void updateCustomStatus(uid, '', '', 'none');
      return;
    }

    const timer = window.setTimeout(() => {
      void updateCustomStatus(uid, '', '', 'none');
    }, Math.min(remaining + 200, 2_147_483_647));

    return () => window.clearTimeout(timer);
  }, [uid, publicUser]);

  const flushPendingWrite = useCallback(
    async (targetUid: string): Promise<void> => {
      const patch = pendingPatchRef.current;
      if (Object.keys(patch).length === 0) return;

      const baseBefore = settingsRef.current;
      const shouldShowToast = pendingHasNonSilentRef.current;
      pendingPatchRef.current = {};
      pendingHasNonSilentRef.current = false;
      inFlightPatchRef.current = {
        ...inFlightPatchRef.current,
        ...patch,
        ...(patch.shortcuts
          ? {
              shortcuts: {
                ...settingsRef.current.shortcuts,
                ...(inFlightPatchRef.current.shortcuts || {}),
                ...patch.shortcuts,
              },
            }
          : {}),
      };

      writeQueueRef.current = writeQueueRef.current.then(async () => {
        try {
          const saved = await saveDetailedUserSettings(targetUid, baseBefore, patch);
          hasRemotePrefsRef.current = true;
          inFlightPatchRef.current = {};
          const newerPending = pendingPatchRef.current;
          const reconciled: UserSettings =
            Object.keys(newerPending).length > 0
              ? {
                  ...saved,
                  ...newerPending,
                  shortcuts: {
                    ...saved.shortcuts,
                    ...(newerPending.shortcuts || {}),
                  },
                  serverNotifications:
                    newerPending.serverNotifications || saved.serverNotifications,
                  channelMutes: newerPending.channelMutes || saved.channelMutes,
                }
              : saved;
          settingsRef.current = reconciled;
          setSettings(reconciled);
          try {
            localStorage.setItem(
              `nexus_user_settings_${targetUid}`,
              JSON.stringify(reconciled)
            );
          } catch {
            // Ignore quota error
          }
          if (shouldShowToast) {
            pushToast({
              type: 'success',
              title: (patch.language || baseBefore.language || language) === 'ar' ? 'تم الحفظ' : 'Saved',
            });
          }
        } catch (err) {
          inFlightPatchRef.current = {};
          pushToast({
            type: 'error',
            title: language === 'ar' ? 'تعذر حفظ الإعدادات' : 'Failed to save settings',
            description: err instanceof Error ? err.message : undefined,
          });
        }
      });

      await writeQueueRef.current;
    },
    [pushToast, language]
  );

  const updateSetting = useCallback(
    async (partial: Partial<UserSettings>, options?: { silent?: boolean }) => {
      const current = settingsRef.current;
      const optimistic: UserSettings = {
        ...current,
        ...partial,
        shortcuts: partial.shortcuts
          ? { ...current.shortcuts, ...partial.shortcuts }
          : current.shortcuts,
      };
      settingsRef.current = optimistic;
      setSettings(optimistic);

      if (partial.themeMode !== undefined) {
        setLocalTheme(partial.themeMode);
      }
      if (partial.language !== undefined) {
        setLocalLanguage(partial.language);
      }
      if (partial.accentPreset !== undefined && partial.accentPreset !== 'custom') {
        changeAccentColor(partial.accentPreset);
      }

      if (!uid) return;
      try {
        localStorage.setItem(`nexus_user_settings_${uid}`, JSON.stringify(optimistic));
      } catch {
        // Ignore storage error
      }

      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        ...partial,
        ...(partial.shortcuts
          ? { shortcuts: { ...(pendingPatchRef.current.shortcuts || {}), ...partial.shortcuts } }
          : {}),
      };
      if (!options?.silent) {
        pendingHasNonSilentRef.current = true;
      }

      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      if (options?.silent) {
        await new Promise<void>((resolve) => {
          debounceWaitersRef.current.push(resolve);
          flushTimerRef.current = window.setTimeout(() => {
            flushTimerRef.current = null;
            const waiters = debounceWaitersRef.current.splice(0);
            void flushPendingWrite(uid).finally(() => {
              waiters.forEach((done) => done());
            });
          }, 220);
        });
        return;
      }

      const waiters = debounceWaitersRef.current.splice(0);
      await flushPendingWrite(uid).finally(() => {
        waiters.forEach((done) => done());
      });
    },
    [uid, flushPendingWrite, setLocalTheme, setLocalLanguage, changeAccentColor]
  );

  const blockedUserIds = useMemo(
    () => new Set(blockedUsers.map((b) => b.uid)),
    [blockedUsers]
  );

  const isEffectivelyDnd = useMemo(() => {
    if (preferredStatus === 'dnd') return true;
    return isDndScheduleActive(
      settings.dndScheduleEnabled,
      settings.dndStartHour,
      settings.dndEndHour
    );
  }, [preferredStatus, settings.dndScheduleEnabled, settings.dndStartHour, settings.dndEndHour]);

  const getServerNotificationMode = useCallback(
    (serverId?: string): NotificationMode => {
      if (serverId && settings.serverNotifications?.[serverId]?.mode) {
        return settings.serverNotifications[serverId].mode as NotificationMode;
      }
      return settings.notificationMode;
    },
    [settings.serverNotifications, settings.notificationMode]
  );

  const isServerMuted = useCallback(
    (serverId?: string): boolean => {
      if (!serverId) return false;
      return isTargetMuted(settings.serverNotifications?.[serverId]?.mutedUntilMs);
    },
    [settings.serverNotifications]
  );

  const isChannelMuted = useCallback(
    (channelId?: string): boolean => {
      if (!channelId) return false;
      return isTargetMuted(settings.channelMutes?.[channelId]);
    },
    [settings.channelMutes]
  );

  const muteServer = useCallback(
    async (serverId: string, durationMs: number | 'forever' | 'unmute') => {
      const prev = settingsRef.current.serverNotifications || {};
      const existing = prev[serverId] || {};
      const nextPref =
        durationMs === 'unmute'
          ? { ...existing, mutedUntilMs: 0 }
          : {
              ...existing,
              mutedUntilMs: durationMs === 'forever' ? -1 : Date.now() + durationMs,
            };
      await updateSetting({
        serverNotifications: {
          ...prev,
          [serverId]: nextPref,
        },
      });
    },
    [updateSetting]
  );

  const setServerNotificationMode = useCallback(
    async (serverId: string, mode: NotificationMode) => {
      const prev = settingsRef.current.serverNotifications || {};
      await updateSetting({
        serverNotifications: {
          ...prev,
          [serverId]: {
            ...(prev[serverId] || {}),
            mode,
          },
        },
      });
    },
    [updateSetting]
  );

  const muteChannel = useCallback(
    async (channelId: string, durationMs: number | 'forever' | 'unmute') => {
      const prev = { ...(settingsRef.current.channelMutes || {}) };
      if (durationMs === 'unmute') {
        delete prev[channelId];
      } else {
        prev[channelId] = durationMs === 'forever' ? -1 : Date.now() + durationMs;
      }
      await updateSetting({ channelMutes: prev });
    },
    [updateSetting]
  );

  return (
    <UserSettingsContext.Provider
      value={{
        settings,
        settingsLoaded,
        blockedUsers,
        blockedUserIds,
        sessions,
        currentSessionId,
        isEffectivelyDnd,
        updateSetting,
        getServerNotificationMode,
        isServerMuted,
        isChannelMuted,
        muteServer,
        setServerNotificationMode,
        muteChannel,
      }}
    >
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  const ctx = useContext(UserSettingsContext);
  if (!ctx) throw new Error('useUserSettings must be used within UserSettingsProvider');
  return ctx;
}
