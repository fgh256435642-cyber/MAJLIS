import React, { useState } from 'react';
import {
  Ban,
  Bug,
  CheckCircle2,
  Database,
  Download,
  Info,
  Keyboard,
  Laptop,
  Loader2,
  LogOut,
  RotateCcw,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useUserSettings } from '../../hooks/useUserSettings';
import { t } from '../../i18n/translations';
import {
  APP_VERSION,
  clearAppLocalCacheAndReload,
  DEFAULT_SHORTCUTS,
  exportAllMyUserData,
  revokeAllOtherSessions,
  revokeSingleSession,
  submitProblemReport,
  unblockUser,
  updatePrivacySettings,
} from '../../services/nexusService';
import type {
  DmPermission,
  FriendRequestPermission,
  ShortcutActionId,
} from '../../types/nexus';
import { formatKeyboardShortcutFromEvent } from '../../utils/validation';
import { UserAvatar } from '../NexusLogo';

export function PrivacySafetySection() {
  const { firebaseUser, language, preferredStatus } = useAuth();
  const { settings, blockedUsers, sessions, currentSessionId, updateSetting } =
    useUserSettings();
  const { pushToast } = useToast();
  const [revokingAll, setRevokingAll] = useState(false);

  const uid = firebaseUser?.uid;

  const handleFriendPermission = async (val: FriendRequestPermission) => {
    if (!uid) return;
    try {
      await updatePrivacySettings(
        uid,
        {
          hideOnlineStatus: settings.hideOnlineStatus,
          friendRequestPermission: val,
          dmPermission: settings.dmPermission,
          profileVisible: settings.profileVisible,
        },
        preferredStatus
      );
      await updateSetting({ friendRequestPermission: val });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleDmPermission = async (val: DmPermission) => {
    if (!uid) return;
    try {
      await updatePrivacySettings(
        uid,
        {
          hideOnlineStatus: settings.hideOnlineStatus,
          friendRequestPermission: settings.friendRequestPermission,
          dmPermission: val,
          profileVisible: settings.profileVisible,
        },
        preferredStatus
      );
      await updateSetting({ dmPermission: val });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleHideOnline = async (checked: boolean) => {
    if (!uid) return;
    try {
      await updatePrivacySettings(
        uid,
        {
          hideOnlineStatus: checked,
          friendRequestPermission: settings.friendRequestPermission,
          dmPermission: settings.dmPermission,
          profileVisible: settings.profileVisible,
        },
        preferredStatus
      );
      await updateSetting({ hideOnlineStatus: checked });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleProfileVisible = async (checked: boolean) => {
    if (!uid) return;
    try {
      await updatePrivacySettings(
        uid,
        {
          hideOnlineStatus: settings.hideOnlineStatus,
          friendRequestPermission: settings.friendRequestPermission,
          dmPermission: settings.dmPermission,
          profileVisible: checked,
        },
        preferredStatus
      );
      await updateSetting({ profileVisible: checked });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleSignOutAllDevices = async (includeCurrent: boolean) => {
    if (!uid) return;
    setRevokingAll(true);
    try {
      await revokeAllOtherSessions(
        uid,
        includeCurrent ? '' : currentSessionId,
        settings
      );
      pushToast({ type: 'success', title: t(language, 'allDevicesSignedOutToast') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-nexus" />
          <span>{t(language, 'privacyAndSafety')}</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'privacyAndSafetySubtitle')}
        </p>
      </div>

      {/* Who can send friend requests & DMs */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-5">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(language, 'whoCanSendFriendRequests')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                ['everyone', t(language, 'permEveryone')],
                ['friends_of_friends', t(language, 'permFriendsOfFriends')],
                ['nobody', t(language, 'permNobody')],
              ] as [FriendRequestPermission, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void handleFriendPermission(id)}
                className={`p-2.5 rounded-xl border text-xs font-semibold text-start transition-colors ${
                  settings.friendRequestPermission === id
                    ? 'border-nexus bg-nexus/10 text-slate-950 dark:text-white'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-white/10">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(language, 'whoCanSendDms')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                ['server_members', t(language, 'dmServerMembers')],
                ['friends_only', t(language, 'dmFriendsOnly')],
              ] as [DmPermission, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void handleDmPermission(id)}
                className={`p-2.5 rounded-xl border text-xs font-semibold text-start transition-colors ${
                  settings.dmPermission === id
                    ? 'border-nexus bg-nexus/10 text-slate-950 dark:text-white'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-white/10 cursor-pointer">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(language, 'hideOnlineStatus')}
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              {t(language, 'hideOnlineStatusDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.hideOnlineStatus}
            onChange={(e) => void handleHideOnline(e.target.checked)}
            className="w-4 h-4 accent-nexus"
          />
        </label>

        <label className="flex items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-white/10 cursor-pointer">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(language, 'profileVisible')}
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              {t(language, 'profileVisibleDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.profileVisible}
            onChange={(e) => void handleProfileVisible(e.target.checked)}
            className="w-4 h-4 accent-nexus"
          />
        </label>
      </div>

      {/* Blocked Users */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          <Ban className="w-3.5 h-3.5 text-rose-500" />
          <span>
            {t(language, 'blockedUsersTitle')} ({blockedUsers.length})
          </span>
        </div>
        {blockedUsers.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {t(language, 'noBlockedUsers')}
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {blockedUsers.map((b) => (
              <div key={b.uid} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar src={b.avatarUrl} name={b.displayName} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {b.displayName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                      @{b.username}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!uid) return;
                    try {
                      await unblockUser(uid, b.uid);
                      pushToast({ type: 'info', title: t(language, 'userUnblockedToast') });
                    } catch (err) {
                      pushToast({
                        type: 'error',
                        title: t(language, 'errorGeneric'),
                        description: err instanceof Error ? err.message : undefined,
                      });
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold"
                >
                  {t(language, 'unblockUser')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connected Devices / Sessions */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            <Laptop className="w-3.5 h-3.5 text-nexus" />
            <span>
              {t(language, 'activeDevicesTitle')} ({sessions.length})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={revokingAll || sessions.length <= 1}
              onClick={() => void handleSignOutAllDevices(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40 text-xs font-semibold"
            >
              {t(language, 'signOutOtherDevices')}
            </button>
            <button
              type="button"
              disabled={revokingAll}
              onClick={() => void handleSignOutAllDevices(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/15 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-semibold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t(language, 'signOutAllDevices')}</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-white/10">
          {sessions.map((sess) => {
            const isCurrent = sess.id === currentSessionId;
            return (
              <div key={sess.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {sess.deviceName} · {sess.browser}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                        {t(language, 'currentDeviceBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">
                    {sess.platform}
                  </div>
                </div>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!uid) return;
                      try {
                        await revokeSingleSession(uid, sess.id);
                        pushToast({ type: 'info', title: t(language, 'sessionRevokedToast') });
                      } catch (err) {
                        pushToast({
                          type: 'error',
                          title: t(language, 'errorGeneric'),
                          description: err instanceof Error ? err.message : undefined,
                        });
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-semibold transition-colors"
                  >
                    {t(language, 'signOutDevice')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function KeybindsSection() {
  const { language } = useAuth();
  const { settings, updateSetting } = useUserSettings();
  const [recordingAction, setRecordingAction] = useState<ShortcutActionId | null>(null);

  const actions: ReadonlyArray<{ id: ShortcutActionId; label: string }> = [
    { id: 'quickSwitcher', label: t(language, 'shortcutQuickSwitcher') },
    { id: 'toggleSidebar', label: t(language, 'shortcutToggleSidebar') },
    { id: 'toggleMute', label: t(language, 'shortcutToggleMute') },
    { id: 'toggleDeafen', label: t(language, 'shortcutToggleDeafen') },
    { id: 'openSettings', label: t(language, 'shortcutOpenSettings') },
  ];

  React.useEffect(() => {
    if (!recordingAction) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        setRecordingAction(null);
        return;
      }
      const formatted = formatKeyboardShortcutFromEvent(e);
      if (!formatted) return;
      void updateSetting({
        shortcuts: {
          ...settings.shortcuts,
          [recordingAction]: formatted,
        },
      });
      setRecordingAction(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recordingAction, settings.shortcuts, updateSetting]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-nexus" />
            <span>{t(language, 'keybindsTitle')}</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            {t(language, 'keybindsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void updateSetting({ shortcuts: { ...DEFAULT_SHORTCUTS } })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t(language, 'resetShortcuts')}</span>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] divide-y divide-slate-200 dark:divide-white/10">
        {actions.map((act) => {
          const isRec = recordingAction === act.id;
          return (
            <div key={act.id} className="p-4 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {act.label}
              </span>
              <button
                type="button"
                onClick={() => setRecordingAction(act.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-colors ${
                  isRec
                    ? 'border-rose-500 bg-rose-500/15 text-rose-500 animate-pulse'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] hover:border-nexus'
                }`}
              >
                {isRec ? t(language, 'pressShortcutNow') : settings.shortcuts[act.id]}
              </button>
            </div>
          );
        })}

        <div className="p-4 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-zinc-400">
          <span>{t(language, 'shortcutNewlineChat')}</span>
          <kbd className="px-2 py-1 rounded bg-slate-100 dark:bg-[#1E1F22] font-mono">
            Shift + Enter
          </kbd>
        </div>
        <div className="p-4 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-zinc-400">
          <span>{t(language, 'shortcutClosePanels')}</span>
          <kbd className="px-2 py-1 rounded bg-slate-100 dark:bg-[#1E1F22] font-mono">Esc</kbd>
        </div>
      </div>
    </div>
  );
}

export function MyDataSection() {
  const { firebaseUser, language } = useAuth();
  const { pushToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleExport = async () => {
    if (!firebaseUser) return;
    setExporting(true);
    try {
      const data = await exportAllMyUserData(firebaseUser.uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexuschat-data-${firebaseUser.uid.slice(0, 6)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      pushToast({ type: 'success', title: t(language, 'dataExportReady') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-nexus" />
          <span>{t(language, 'myDataTitle')}</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'myDataSubtitle')}
        </p>
      </div>

      <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {t(language, 'downloadMyData')}
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {t(language, 'downloadMyDataDesc')}
          </p>
        </div>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExport()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-xs font-semibold shrink-0"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>{t(language, 'downloadDataButton')}</span>
        </button>
      </div>

      <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {t(language, 'clearCacheTitle')}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              {t(language, 'clearCacheDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmClear((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-semibold transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t(language, 'clearCacheButton')}</span>
          </button>
        </div>

        {confirmClear && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-amber-800 dark:text-amber-200">
              {t(language, 'clearCacheConfirmText')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => clearAppLocalCacheAndReload()}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold"
              >
                {t(language, 'confirmClearAndReload')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-zinc-300"
              >
                {t(language, 'cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AboutSection() {
  const { firebaseUser, language } = useAuth();
  const { pushToast } = useToast();
  const [category, setCategory] = useState('bug');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setSubmitting(true);
    try {
      await submitProblemReport(firebaseUser.uid, { category, subject, description });
      setSubject('');
      setDescription('');
      setSubmitted(true);
      pushToast({ type: 'success', title: t(language, 'reportSubmittedToast') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Info className="w-5 h-5 text-nexus" />
          <span>{t(language, 'aboutAppTitle')}</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'aboutAppSubtitle')}
        </p>
      </div>

      {/* Version Card */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] flex items-center justify-between gap-4">
        <div>
          <div className="text-base font-bold text-slate-900 dark:text-white">
            {t(language, 'appName')}
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {t(language, 'buildVersionLabel')} v{APP_VERSION}
          </div>
        </div>
        <span className="px-3 py-1 rounded-full bg-nexus/15 text-nexus text-xs font-bold font-mono">
          v{APP_VERSION}
        </span>
      </div>

      {/* What's New Changelog */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Sparkles className="w-4 h-4 text-nexus" />
          <span>{t(language, 'whatsNewTitle')}</span>
        </div>
        <ul className="space-y-2 text-xs text-slate-600 dark:text-zinc-300 list-disc ps-5">
          <li>{t(language, 'changelogItem1')}</li>
          <li>{t(language, 'changelogItem2')}</li>
          <li>{t(language, 'changelogItem3')}</li>
          <li>{t(language, 'changelogItem4')}</li>
        </ul>
      </div>

      {/* Report a Problem */}
      <form
        onSubmit={handleSubmitReport}
        className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Bug className="w-4 h-4 text-nexus" />
          <span>{t(language, 'reportProblemTitle')}</span>
        </div>

        {submitted && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{t(language, 'reportSubmittedToast')}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">{t(language, 'reportCategory')}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm"
            >
              <option value="bug">{t(language, 'reportCatBug')}</option>
              <option value="voice">{t(language, 'reportCatVoice')}</option>
              <option value="privacy">{t(language, 'reportCatPrivacy')}</option>
              <option value="feature">{t(language, 'reportCatFeature')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">{t(language, 'reportSubject')}</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t(language, 'reportSubjectPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1">{t(language, 'reportDescription')}</label>
          <textarea
            rows={4}
            required
            minLength={5}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t(language, 'reportDescriptionPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-xs font-semibold"
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{t(language, 'submitReport')}</span>
        </button>
      </form>
    </div>
  );
}
