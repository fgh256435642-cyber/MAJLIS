import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Smile, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { t } from '../../i18n/translations';
import {
  ensureUserProfile,
  updateCustomStatus,
  updateUserProfile,
} from '../../services/majlisService';
import type { CustomStatusDuration, SelectableUserStatus } from '../../types/majlis';
import { getActiveCustomStatus, isValidHexColor } from '../../utils/validation';
import { StatusIndicator, UserAvatar } from '../MajlisLogo';
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
        <h2 className="text-link font-bold text-text dark:text-text">
          {t(language, 'profileAndStatus')}
        </h2>
        <p className="text-link text-text-muted dark:text-text-muted mt-1">
          {t(language, 'profileAndStatusSubtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Editors */}
        <div className="lg:col-span-3 space-y-5">
          {/* Online Presence Selector */}
          <div className="rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated p-4 space-y-3">
            <div className="text-link font-bold uppercase tracking-wider text-text-muted dark:text-text-muted">
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
                    className={`p-3 rounded-xl border text-link transition-colors ${
                      selected
                        ? 'border-accent bg-accent/10'
                        : 'border-border dark:border-border hover:bg-elevated dark:hover:bg-elevated'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-link text-text dark:text-text">
                      <StatusIndicator status={opt.id} className="w-2.5 h-2.5 shrink-0" />
                      <span>{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-text-muted dark:text-text-muted mt-1 line-clamp-2">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Status */}
          <div className="rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-link font-bold text-text dark:text-text">
                <Smile className="w-4 h-4 text-link" />
                <span>{t(language, 'customStatus')}</span>
              </div>
              {(statusEmoji || statusText || existingCustom) && (
                <button
                  type="button"
                  onClick={() => void handleClearCustomStatus()}
                  className="inline-flex items-center gap-1 text-link text-danger hover:text-danger font-medium"
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
                  className={`w-8 h-8 rounded-lg border text-link flex items-center justify-center transition-colors ${
                    statusEmoji === em
                      ? 'border-accent bg-accent/15'
                      : 'border-border dark:border-border hover:bg-main dark:hover:bg-main'
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
                className="w-16 text-link px-2 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link"
              />
              <input
                type="text"
                maxLength={80}
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder={t(language, 'customStatusPlaceholder')}
                className="flex-1 px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link focus:outline-accent focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-link font-semibold text-text dark:text-text mb-1">
                  {t(language, 'clearAfter')}
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value as CustomStatusDuration)}
                  className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link"
                >
                  <option value="none">{t(language, 'durationDontClear')}</option>
                  <option value="30m">{t(language, 'duration30m')}</option>
                  <option value="1h">{t(language, 'duration1h')}</option>
                  <option value="4h">{t(language, 'duration4h')}</option>
                  <option value="today">{t(language, 'durationToday')}</option>
                </select>
              </div>
              <div>
                <label className="block text-link font-semibold text-text dark:text-text mb-1">
                  {t(language, 'profileColor')}
                </label>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated">
                  <input
                    type="color"
                    value={isValidHexColor(profileColor) ? profileColor : '#5865F2'}
                    onChange={(e) => setProfileColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer bg-accent border-0 p-0"
                  />
                  <span className="text-link font-mono uppercase">{profileColor}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-link font-semibold text-text dark:text-text mb-1">
                {t(language, 'bio')}
              </label>
              <textarea
                rows={3}
                maxLength={240}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t(language, 'bioPlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link"
              />
            </div>

            <button
              type="button"
              disabled={!isDirty || saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-40 text-text text-link font-semibold transition-colors"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t(language, 'save')}</span>
            </button>
          </div>
        </div>

        {/* Live Profile Card Preview */}
        <div className="lg:col-span-2">
          <div className="text-link font-bold uppercase tracking-wider text-text-muted dark:text-text-muted mb-2">
            {t(language, 'livePreview')}
          </div>
          <div className="rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated overflow-hidden shadow-lg">
            <ProfileBanner
              bannerUrl={publicUser?.bannerUrl}
              profileColor={profileColor}
              className="h-24"
            />
            <div className="px-4 pb-4">
              <div className="-mt-9 mb-3 flex items-end justify-between gap-2">
                <div className="rounded-full">
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

              <div className="rounded-xl bg-elevated dark:bg-elevated p-3.5 space-y-2 border border-border dark:border-border">
                <div>
                  <div className="text-link font-bold text-text dark:text-text truncate">
                    {publicUser?.displayName ||
                      firebaseUser?.displayName ||
                      firebaseUser?.email?.split('@')[0] ||
                      '—'}
                  </div>
                  <div className="text-link text-text-muted dark:text-text-muted truncate">
                    @{publicUser?.username || firebaseUser?.email?.split('@')[0] || 'username'}
                  </div>
                </div>

                {(statusEmoji || statusText) && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-elevated dark:bg-elevated border border-border dark:border-border text-link text-text dark:text-text flex items-center gap-1.5">
                    {statusEmoji && <span>{statusEmoji}</span>}
                    <span className="truncate">{statusText}</span>
                  </div>
                )}

                {bio.trim() && (
                  <div className="pt-2 border-accent border-border dark:border-border">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted dark:text-text-muted mb-1">
                      {t(language, 'bio')}
                    </div>
                    <p className="text-link text-text dark:text-text whitespace-pre-wrap break-words">
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
