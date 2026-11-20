import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Smile, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { t } from '../../i18n/translations';
import {
  ensureUserProfile,
  updateCustomStatus,
  updateUserProfile,
} from '../../services/nexusService';
import type { CustomStatusDuration, SelectableUserStatus } from '../../types/nexus';
import { getActiveCustomStatus, isValidHexColor } from '../../utils/validation';
import { StatusIndicator, UserAvatar } from '../NexusLogo';
import { ProfileBanner } from '../ProfileBanner';
import type { UnsavedBarState } from './AccountSection';

const QUICK_EMOJIS = ['😀', '🔥', '🎮', '🎧', '💻', '☕', '📚', '🚀', '😴', '✨'];

export function ProfileStatusSection({
  onDirtyStateChange,
}: {
  onDirtyStateChange: (state: UnsavedBarState | null) => void;
}) {
  const {
    firebaseUser,
    publicUser,
    language,
    preferredStatus,
    effectiveSelfStatus,
    presenceNowMs,
    changePresenceStatus,
  } = useAuth();
  const { pushToast } = useToast();

  const existingCustom = getActiveCustomStatus(publicUser, presenceNowMs);
  const baseEmoji = existingCustom?.emoji || '';
  const baseText = existingCustom?.text || '';
  const baseBio = publicUser?.bio || '';
  const baseColor = publicUser?.profileColor || '#5865F2';

  const [statusEmoji, setStatusEmoji] = useState(baseEmoji);
  const [statusText, setStatusText] = useState(baseText);
  const [duration, setDuration] = useState<CustomStatusDuration>('none');
  const [bio, setBio] = useState(baseBio);
  const [profileColor, setProfileColor] = useState(baseColor);
  const [saving, setSaving] = useState(false);

  const baselineRef = useRef({
    emoji: baseEmoji,
    text: baseText,
    bio: baseBio,
    profileColor: baseColor,
  });

  useEffect(() => {
    const prev = baselineRef.current;
    setStatusEmoji((curr) => (curr === prev.emoji ? baseEmoji : curr));
    setStatusText((curr) => (curr === prev.text ? baseText : curr));
    setBio((curr) => (curr === prev.bio ? baseBio : curr));
    setProfileColor((curr) => (curr === prev.profileColor ? baseColor : curr));
    baselineRef.current = {
      emoji: baseEmoji,
      text: baseText,
      bio: baseBio,
      profileColor: baseColor,
    };
  }, [baseEmoji, baseText, baseBio, baseColor]);

  const syncFromUser = useCallback(() => {
    const active = getActiveCustomStatus(publicUser, Date.now());
    setStatusEmoji(active?.emoji || '');
    setStatusText(active?.text || '');
    setDuration('none');
    setBio(publicUser?.bio || '');
    setProfileColor(publicUser?.profileColor || '#5865F2');
  }, [publicUser]);

  const isDirty =
    statusEmoji !== baseEmoji ||
    statusText !== baseText ||
    (Boolean(statusEmoji.trim() || statusText.trim()) && duration !== 'none') ||
    bio !== baseBio ||
    profileColor !== baseColor;

  const handleSave = useCallback(async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const targetProfile = publicUser || (await ensureUserProfile(firebaseUser));
      const nextColor = isValidHexColor(profileColor) ? profileColor : '#5865F2';
      await Promise.all([
        updateCustomStatus(firebaseUser.uid, statusEmoji, statusText, duration),
        updateUserProfile(firebaseUser.uid, targetProfile, {
          displayName: targetProfile.displayName,
          username: targetProfile.username,
          bio,
          avatarUrl: targetProfile.avatarUrl || '',
          profileColor: nextColor,
        }),
      ]);
      baselineRef.current = {
        emoji: statusEmoji.trim(),
        text: statusText.trim(),
        bio: bio.trim(),
        profileColor: nextColor,
      };
      setDuration('none');
      pushToast({ type: 'success', title: t(language, 'settingsSavedToast') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [
    firebaseUser,
    publicUser,
    statusText,
    statusEmoji,
    duration,
    bio,
    profileColor,
    pushToast,
    language,
  ]);

  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  const resetRef = useRef(syncFromUser);
  resetRef.current = syncFromUser;

  useEffect(() => {
    if (isDirty) {
      onDirtyStateChange({
        dirty: true,
        saving,
        onSave: () => void saveRef.current(),
        onReset: () => resetRef.current(),
      });
    } else {
      onDirtyStateChange(null);
    }
  }, [isDirty, saving, onDirtyStateChange]);

  useEffect(() => {
    return () => onDirtyStateChange(null);
  }, [onDirtyStateChange]);

  const handleClearCustomStatus = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      await updateCustomStatus(firebaseUser.uid, '', '', 'none');
      baselineRef.current = {
        ...baselineRef.current,
        emoji: '',
        text: '',
      };
      setStatusEmoji('');
      setStatusText('');
      setDuration('none');
      pushToast({ type: 'info', title: t(language, 'customStatusCleared') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const presenceChoices: ReadonlyArray<{
    id: SelectableUserStatus;
    label: string;
    desc: string;
  }> = [
    { id: 'online', label: t(language, 'online'), desc: t(language, 'onlineDesc') },
    { id: 'idle', label: t(language, 'idle'), desc: t(language, 'idleDesc') },
    { id: 'dnd', label: t(language, 'dnd'), desc: t(language, 'dndDesc') },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {t(language, 'profileAndStatus')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'profileAndStatusSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Editors */}
        <div className="lg:col-span-3 space-y-5">
          {/* Online Presence Selector */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {t(language, 'statusLabel')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {presenceChoices.map((opt) => {
                const selected = preferredStatus === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void changePresenceStatus(opt.id)}
                    className={`p-3 rounded-xl border text-start transition-colors ${
                      selected
                        ? 'border-nexus bg-nexus/10'
                        : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 dark:text-white">
                      <StatusIndicator status={opt.id} className="w-2.5 h-2.5 shrink-0" />
                      <span>{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Status */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Smile className="w-4 h-4 text-nexus" />
                <span>{t(language, 'customStatus')}</span>
              </div>
              {(statusEmoji || statusText || existingCustom) && (
                <button
                  type="button"
                  onClick={() => void handleClearCustomStatus()}
                  className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t(language, 'clearCustomStatus')}</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setStatusEmoji(em)}
                  className={`w-8 h-8 rounded-lg border text-base flex items-center justify-center transition-colors ${
                    statusEmoji === em
                      ? 'border-nexus bg-nexus/15'
                      : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                maxLength={8}
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value)}
                placeholder="😀"
                aria-label={t(language, 'statusEmoji')}
                className="w-16 text-center px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-slate-900 dark:text-white text-base"
              />
              <input
                type="text"
                maxLength={80}
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder={t(language, 'customStatusPlaceholder')}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1">
                  {t(language, 'clearAfter')}
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value as CustomStatusDuration)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-slate-900 dark:text-white text-sm"
                >
                  <option value="none">{t(language, 'durationDontClear')}</option>
                  <option value="30m">{t(language, 'duration30m')}</option>
                  <option value="1h">{t(language, 'duration1h')}</option>
                  <option value="4h">{t(language, 'duration4h')}</option>
                  <option value="today">{t(language, 'durationToday')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1">
                  {t(language, 'profileColor')}
                </label>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22]">
                  <input
                    type="color"
                    value={isValidHexColor(profileColor) ? profileColor : '#5865F2'}
                    onChange={(e) => setProfileColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                  <span className="text-xs font-mono uppercase">{profileColor}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1">
                {t(language, 'bio')}
              </label>
              <textarea
                rows={3}
                maxLength={240}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t(language, 'bioPlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-slate-900 dark:text-white text-sm"
              />
            </div>

            <button
              type="button"
              disabled={!isDirty || saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-40 text-white text-xs font-semibold transition-colors"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t(language, 'save')}</span>
            </button>
          </div>
        </div>

        {/* Live Profile Card Preview */}
        <div className="lg:col-span-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
            {t(language, 'livePreview')}
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] overflow-hidden shadow-lg">
            <ProfileBanner
              bannerUrl={publicUser?.bannerUrl}
              profileColor={profileColor}
              className="h-24"
            />
            <div className="px-4 pb-4">
              <div className="-mt-9 mb-3 flex items-end justify-between gap-2">
                <div className="rounded-full ring-4 ring-white dark:ring-[#111214]">
                  <UserAvatar
                    src={publicUser?.avatarUrl}
                    name={
                      publicUser?.displayName ||
                      firebaseUser?.displayName ||
                      firebaseUser?.email ||
                      'U'
                    }
                    status={effectiveSelfStatus}
                    size="xl"
                    showStatus
                  />
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-[#1E1F22] p-3.5 space-y-2 border border-slate-200/80 dark:border-white/5">
                <div>
                  <div className="text-base font-bold text-slate-900 dark:text-white truncate">
                    {publicUser?.displayName ||
                      firebaseUser?.displayName ||
                      firebaseUser?.email?.split('@')[0] ||
                      '—'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                    @{publicUser?.username || firebaseUser?.email?.split('@')[0] || 'username'}
                  </div>
                </div>

                {(statusEmoji || statusText) && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#2B2D31] border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                    {statusEmoji && <span>{statusEmoji}</span>}
                    <span className="truncate">{statusText}</span>
                  </div>
                )}

                {bio.trim() && (
                  <div className="pt-2 border-t border-slate-200 dark:border-white/10">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1">
                      {t(language, 'bio')}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                      {bio}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
