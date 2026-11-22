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
} from '../../services/majlisService';
import type {
  DmPermission,
  FriendRequestPermission,
  ShortcutActionId,
} from '../../types/majlis';
import { formatKeyboardShortcutFromEvent } from '../../utils/validation';
import { UserAvatar } from '../MajlisLogo';

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
        <h2 className="text-link font-bold text-text dark:text-text flex items-center gap-2">
          <Shield className="w-5 h-5 text-link" />
          <span>{t(language, 'privacyAndSafety')}</span>
        </h2>
        <p className="text-link text-text-muted dark:text-text-muted mt-1">
          {t(language, 'privacyAndSafetySubtitle')}
        </p>
      </div>

      {/* Who can send friend requests & DMs */}
      <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-5">
        <div className="space-y-2">
          <div className="text-link font-semibold text-text dark:text-text">
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
                className={`p-2.5 rounded-xl border text-link font-semibold text-link transition-colors ${
                  settings.friendRequestPermission === id
                    ? 'border-accent bg-accent/10 text-text dark:text-text'
                    : 'border-border dark:border-border hover:bg-elevated dark:hover:bg-elevated'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-3 border-accent border-border dark:border-border">
          <div className="text-link font-semibold text-text dark:text-text">
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
                className={`p-2.5 rounded-xl border text-link font-semibold text-link transition-colors ${
                  settings.dmPermission === id
                    ? 'border-accent bg-accent/10 text-text dark:text-text'
                    : 'border-border dark:border-border hover:bg-elevated dark:hover:bg-elevated'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 pt-3 border-accent border-border dark:border-border cursor-pointer">
          <div>
            <div className="text-link font-semibold text-text dark:text-text">
              {t(language, 'hideOnlineStatus')}
            </div>
            <div className="text-link text-text-muted dark:text-text-muted">
              {t(language, 'hideOnlineStatusDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.hideOnlineStatus}
            onChange={(e) => void handleHideOnline(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
        </label>

        <label className="flex items-center justify-between gap-4 pt-3 border-accent border-border dark:border-border cursor-pointer">
          <div>
            <div className="text-link font-semibold text-text dark:text-text">
              {t(language, 'profileVisible')}
            </div>
            <div className="text-link text-text-muted dark:text-text-muted">
              {t(language, 'profileVisibleDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.profileVisible}
            onChange={(e) => void handleProfileVisible(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
        </label>
      </div>

      {/* Blocked Users */}
      <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-3">
        <div className="flex items-center gap-2 text-link font-bold uppercase tracking-wider text-text-muted dark:text-text-muted">
          <Ban className="w-3.5 h-3.5 text-danger" />
          <span>
            {t(language, 'blockedUsersTitle')} ({blockedUsers.length})
          </span>
        </div>
        {blockedUsers.length === 0 ? (
          <p className="text-link text-text-muted dark:text-text-muted">
            {t(language, 'noBlockedUsers')}
          </p>
        ) : (
          <div className="divide-accent border-border dark:border-border">
            {blockedUsers.map((b) => (
              <div key={b.uid} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar src={b.avatarUrl} name={b.displayName} size="sm" />
                  <div className="min-w-0">
                    <div className="text-link font-semibold text-text dark:text-text truncate">
                      {b.displayName}
                    </div>
                    <div className="text-link text-text-muted dark:text-text-muted truncate">
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
                  className="px-3 py-1.5 rounded-lg border border-border dark:border-border hover:bg-main dark:hover:bg-main text-link font-semibold"
                >
                  {t(language, 'unblockUser')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connected Devices / Sessions */}
      <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-link font-bold uppercase tracking-wider text-text-muted dark:text-text-muted">
            <Laptop className="w-3.5 h-3.5 text-link" />
            <span>
              {t(language, 'activeDevicesTitle')} ({sessions.length})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={revokingAll || sessions.length <= 1}
              onClick={() => void handleSignOutAllDevices(false)}
              className="px-3 py-1.5 rounded-lg border border-border dark:border-border hover:bg-main dark:hover:bg-main disabled:opacity-40 text-link font-semibold"
            >
              {t(language, 'signOutOtherDevices')}
            </button>
            <button
              type="button"
              disabled={revokingAll}
              onClick={() => void handleSignOutAllDevices(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-danger/15 text-danger dark:text-danger hover:bg-danger hover:text-text text-link font-semibold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t(language, 'signOutAllDevices')}</span>
            </button>
          </div>
        </div>

        <div className="divide-accent border-border dark:border-border">
          {sessions.map((sess) => {
            const isCurrent = sess.id === currentSessionId;
            return (
              <div key={sess.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-link font-semibold text-text dark:text-text truncate">
                      {sess.deviceName} · {sess.browser}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-success/15 text-success dark:text-success text-[10px] font-bold">
                        {t(language, 'currentDeviceBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-link text-text-muted dark:text-text-muted">
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
                    className="px-2.5 py-1 rounded-lg bg-danger/10 text-danger dark:text-danger hover:bg-danger hover:text-text text-link font-semibold transition-colors"
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
          <h2 className="text-link font-bold text-text dark:text-text flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-link" />
            <span>{t(language, 'keybindsTitle')}</span>
          </h2>
          <p className="text-link text-text-muted dark:text-text-muted mt-1">
            {t(language, 'keybindsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void updateSetting({ shortcuts: { ...DEFAULT_SHORTCUTS } })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border dark:border-border hover:bg-main dark:hover:bg-main text-link font-semibold"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t(language, 'resetShortcuts')}</span>
        </button>
      </div>

      <div className="rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated divide-accent border-border dark:border-border">
        {actions.map((act) => {
          const isRec = recordingAction === act.id;
          return (
            <div key={act.id} className="p-4 flex items-center justify-between gap-3">
              <span className="text-link font-medium text-text dark:text-text">
                {act.label}
              </span>
              <button
                type="button"
                onClick={() => setRecordingAction(act.id)}
                className={`px-3 py-1.5 rounded-lg border text-link font-mono font-semibold transition-colors ${
                  isRec
                    ? 'border-danger bg-danger/15 text-danger animate-pulse'
                    : 'border-border dark:border-border bg-elevated dark:bg-elevated hover:border-accent'
                }`}
              >
                {isRec ? t(language, 'pressShortcutNow') : settings.shortcuts[act.id]}
              </button>
            </div>
          );
        })}

        <div className="p-4 flex items-center justify-between gap-3 text-link text-text-muted dark:text-text-muted">
          <span>{t(language, 'shortcutNewlineChat')}</span>
          <kbd className="px-2 py-1 rounded bg-main dark:bg-main font-mono">
            Shift + Enter
          </kbd>
        </div>
        <div className="p-4 flex items-center justify-between gap-3 text-link text-text-muted dark:text-text-muted">
          <span>{t(language, 'shortcutClosePanels')}</span>
          <kbd className="px-2 py-1 rounded bg-main dark:bg-main font-mono">Esc</kbd>
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
      a.download = `majlischat-data-${firebaseUser.uid.slice(0, 6)}.json`;
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
        <h2 className="text-link font-bold text-text dark:text-text flex items-center gap-2">
          <Database className="w-5 h-5 text-link" />
          <span>{t(language, 'myDataTitle')}</span>
        </h2>
        <p className="text-link text-text-muted dark:text-text-muted mt-1">
          {t(language, 'myDataSubtitle')}
        </p>
      </div>

      <div className="p-5 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-link font-bold text-text dark:text-text">
            {t(language, 'downloadMyData')}
          </div>
          <p className="text-link text-text-muted dark:text-text-muted mt-0.5">
            {t(language, 'downloadMyDataDesc')}
          </p>
        </div>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExport()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold shrink-0"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>{t(language, 'downloadDataButton')}</span>
        </button>
      </div>

      <div className="p-5 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-link font-bold text-text dark:text-text">
              {t(language, 'clearCacheTitle')}
            </div>
            <p className="text-link text-text-muted dark:text-text-muted mt-0.5">
              {t(language, 'clearCacheDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmClear((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-danger text-danger dark:text-danger hover:bg-danger hover:text-text text-link font-semibold transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t(language, 'clearCacheButton')}</span>
          </button>
        </div>

        {confirmClear && (
          <div className="p-3 rounded-xl bg-warning/10 border border-warning flex flex-wrap items-center justify-between gap-2 text-link">
            <span className="font-medium text-warning dark:text-warning">
              {t(language, 'clearCacheConfirmText')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => clearAppLocalCacheAndReload()}
                className="px-3 py-1.5 rounded-lg bg-danger text-text font-semibold"
              >
                {t(language, 'confirmClearAndReload')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1.5 rounded-lg text-text dark:text-text"
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
        <h2 className="text-link font-bold text-text dark:text-text flex items-center gap-2">
          <Info className="w-5 h-5 text-link" />
          <span>{t(language, 'aboutAppTitle')}</span>
        </h2>
        <p className="text-link text-text-muted dark:text-text-muted mt-1">
          {t(language, 'aboutAppSubtitle')}
        </p>
      </div>

      {/* Version Card */}
      <div className="p-5 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated flex items-center justify-between gap-4">
        <div>
          <div className="text-link font-bold text-text dark:text-text">
            {t(language, 'appName')}
          </div>
          <div className="text-link text-text-muted dark:text-text-muted mt-0.5">
            {t(language, 'buildVersionLabel')} v{APP_VERSION}
          </div>
        </div>
        <span className="px-3 py-1 rounded-full bg-accent/15 text-link text-link font-bold font-mono">
          v{APP_VERSION}
        </span>
      </div>

      {/* What's New Changelog */}
      <div className="p-5 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-3">
        <div className="flex items-center gap-2 text-link font-bold text-text dark:text-text">
          <Sparkles className="w-4 h-4 text-link" />
          <span>{t(language, 'whatsNewTitle')}</span>
        </div>
        <ul className="space-y-2 text-link text-text dark:text-text list-disc ps-5">
          <li>{t(language, 'changelogItem1')}</li>
          <li>{t(language, 'changelogItem2')}</li>
          <li>{t(language, 'changelogItem3')}</li>
          <li>{t(language, 'changelogItem4')}</li>
        </ul>
      </div>

      {/* Report a Problem */}
      <form
        onSubmit={handleSubmitReport}
        className="p-5 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-4"
      >
        <div className="flex items-center gap-2 text-link font-bold text-text dark:text-text">
          <Bug className="w-4 h-4 text-link" />
          <span>{t(language, 'reportProblemTitle')}</span>
        </div>

        {submitted && (
          <div className="p-3 rounded-xl bg-success/10 border border-success text-link text-success dark:text-success flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{t(language, 'reportSubmittedToast')}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-link font-semibold mb-1">{t(language, 'reportCategory')}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
            >
              <option value="bug">{t(language, 'reportCatBug')}</option>
              <option value="voice">{t(language, 'reportCatVoice')}</option>
              <option value="privacy">{t(language, 'reportCatPrivacy')}</option>
              <option value="feature">{t(language, 'reportCatFeature')}</option>
            </select>
          </div>
          <div>
            <label className="block text-link font-semibold mb-1">{t(language, 'reportSubject')}</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t(language, 'reportSubjectPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
            />
          </div>
        </div>

        <div>
          <label className="block text-link font-semibold mb-1">{t(language, 'reportDescription')}</label>
          <textarea
            rows={4}
            required
            minLength={5}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t(language, 'reportDescriptionPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold"
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{t(language, 'submitReport')}</span>
        </button>
      </form>
    </div>
  );
}
