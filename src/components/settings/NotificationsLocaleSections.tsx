import { useState } from 'react';
import { Bell, BellOff, Clock, Globe, Moon, Volume2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useUserSettings } from '../../hooks/useUserSettings';
import { t } from '../../i18n/translations';
import {
  getNotificationPermission,
  type NotificationPermissionState,
  requestNotificationPermission,
  showWebNotification,
} from '../../services/notificationService';
import type {
  CalendarSystem,
  JoinedServerRef,
  NotificationMode,
  NotificationSoundId,
  TimeFormatMode,
} from '../../types/nexus';
import { formatMessageTimestamp, getCommonTimezones } from '../../utils/dateFormat';
import { playChime } from '../../utils/sound';

const SOUND_PRESETS: ReadonlyArray<{ id: NotificationSoundId; labelKey: 'soundClassic' | 'soundChime' | 'soundPop' | 'soundBell' | 'soundNone' }> = [
  { id: 'classic', labelKey: 'soundClassic' },
  { id: 'chime', labelKey: 'soundChime' },
  { id: 'pop', labelKey: 'soundPop' },
  { id: 'bell', labelKey: 'soundBell' },
  { id: 'none', labelKey: 'soundNone' },
];

export function NotificationsSection({
  joinedServers,
}: {
  joinedServers: JoinedServerRef[];
}) {
  const { publicUser, userPrivate, language } = useAuth();
  const { pushToast } = useToast();
  const {
    settings,
    updateSetting,
    getServerNotificationMode,
    isServerMuted,
    muteServer,
    setServerNotificationMode,
    muteChannel,
  } = useUserSettings();

  const [notifPermission, setNotifPermission] =
    useState<NotificationPermissionState>(() => getNotificationPermission());

  const soundEnabled = settings.soundEnabled ?? userPrivate?.soundEnabled ?? true;
  const mutedChannelIds = Object.keys(settings.channelMutes || {}).filter(
    (id) => (settings.channelMutes[id] || 0) === -1 || (settings.channelMutes[id] || 0) > Date.now()
  );

  const handleModeChange = async (mode: NotificationMode) => {
    await updateSetting({ notificationMode: mode });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {t(language, 'notifications')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'notificationsSubtitle')}
        </p>
      </div>

      {/* Browser Permission Card */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(language, 'desktopNotifications')}
          </div>
          <p
            className={`text-xs ${
              notifPermission === 'granted'
                ? 'text-emerald-600 dark:text-emerald-400'
                : notifPermission === 'denied' || notifPermission === 'unsupported'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          >
            {notifPermission === 'granted'
              ? t(language, 'notificationsGranted')
              : notifPermission === 'denied'
              ? t(language, 'notificationsDenied')
              : notifPermission === 'unsupported'
              ? t(language, 'notificationsUnsupported')
              : t(language, 'notificationsDefault')}
          </p>
        </div>

        {notifPermission === 'default' && (
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await requestNotificationPermission();
                setNotifPermission(res);
                if (res === 'granted') {
                  if (settings.notificationMode === 'none') {
                    await updateSetting({ notificationMode: 'all' });
                  } else {
                    await updateSetting(
                      { notificationMode: settings.notificationMode },
                      { silent: true }
                    );
                  }
                  pushToast({ type: 'success', title: t(language, 'notificationsGranted') });
                } else if (res === 'denied') {
                  pushToast({ type: 'error', title: t(language, 'notificationsDenied') });
                }
              } catch (err) {
                pushToast({
                  type: 'error',
                  title: t(language, 'errorGeneric'),
                  description: err instanceof Error ? err.message : undefined,
                });
              }
            }}
            className="px-3.5 py-2 rounded-lg bg-nexus hover:bg-nexus-hover text-white text-xs font-semibold transition-colors shrink-0"
          >
            {t(language, 'enableBrowserNotifications')}
          </button>
        )}

        {notifPermission === 'granted' && (
          <button
            type="button"
            onClick={async () => {
              const shown = await showWebNotification({
                title: t(language, 'testNotificationTitle'),
                body: t(language, 'testNotificationBody'),
                icon: publicUser?.avatarUrl || undefined,
                tag: 'nexus-test-notif',
              });
              if (!shown) {
                pushToast({
                  type: 'info',
                  title:
                    language === 'ar'
                      ? 'تعذر عرض إشعار المتصفح، تحقق من أذونات النظام'
                      : 'Could not display browser notification; check system permissions.',
                });
              }
            }}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold transition-colors shrink-0"
          >
            {t(language, 'testNotification')}
          </button>
        )}
      </div>

      {/* Notification Mode */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-nexus" />
          <span>{t(language, 'notificationModeLabel')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {(
            [
              ['all', t(language, 'notifModeAll')],
              ['mentions', t(language, 'notifModeMentions')],
              ['none', t(language, 'notifModeNone')],
            ] as [NotificationMode, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => void handleModeChange(id)}
              className={`p-3 rounded-xl border text-xs font-semibold text-start transition-colors ${
                settings.notificationMode === id
                  ? 'border-nexus bg-nexus/10 text-slate-950 dark:text-white'
                  : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification Sound & Volume */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-4">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div className="flex items-center gap-2.5">
            <Volume2 className="w-4 h-4 text-nexus" />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {t(language, 'soundEffects')}
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">
                {t(language, 'soundEffectsDesc')}
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => {
              void updateSetting({ soundEnabled: e.target.checked });
            }}
            className="w-4 h-4 accent-nexus"
          />
        </label>

        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
          <div className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
            {t(language, 'notificationSoundPreset')}
          </div>
          <div className="flex flex-wrap gap-2">
            {SOUND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  void updateSetting({ notificationSound: preset.id });
                  if (preset.id !== 'none') {
                    playChime('message', {
                      preset: preset.id,
                      volume: settings.notificationVolume,
                    });
                  }
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  settings.notificationSound === preset.id
                    ? 'border-nexus bg-nexus text-white'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {t(language, preset.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-zinc-300">
              {t(language, 'notificationVolume')}
            </span>
            <span className="font-mono font-semibold text-nexus tabular-nums">
              {settings.notificationVolume}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.notificationVolume}
              onChange={(e) =>
                void updateSetting({ notificationVolume: Number(e.target.value) }, { silent: true })
              }
              className="flex-1 accent-nexus"
            />
            <button
              type="button"
              onClick={() =>
                playChime('message', {
                  preset: settings.notificationSound,
                  volume: settings.notificationVolume,
                })
              }
              className="px-3 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/10"
            >
              {t(language, 'previewSound')}
            </button>
          </div>
        </div>
      </div>

      {/* Scheduled Do Not Disturb */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-4">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div className="flex items-center gap-2.5">
            <Moon className="w-4 h-4 text-nexus" />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {t(language, 'scheduledDnd')}
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">
                {t(language, 'scheduledDndDesc')}
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.dndScheduleEnabled}
            onChange={(e) => void updateSetting({ dndScheduleEnabled: e.target.checked })}
            className="w-4 h-4 accent-nexus"
          />
        </label>

        {settings.dndScheduleEnabled && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
            <div>
              <label className="block text-xs font-semibold mb-1">{t(language, 'dndFrom')}</label>
              <select
                value={settings.dndStartHour}
                onChange={(e) => void updateSetting({ dndStartHour: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{t(language, 'dndTo')}</label>
              <select
                value={settings.dndEndHour}
                onChange={(e) => void updateSetting({ dndEndHour: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Per-Server Notification Overrides */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          {t(language, 'perServerNotifications')}
        </div>
        {joinedServers.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {t(language, 'noServersJoinedYet')}
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {joinedServers.map((srv) => {
              const mode = getServerNotificationMode(srv.serverId);
              const muted = isServerMuted(srv.serverId);
              return (
                <div
                  key={srv.serverId}
                  className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {srv.serverName}
                    </span>
                    {muted && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                        {t(language, 'mutedBadge')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={mode}
                      onChange={(e) =>
                        void setServerNotificationMode(
                          srv.serverId,
                          e.target.value as NotificationMode
                        )
                      }
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-xs"
                    >
                      <option value="all">{t(language, 'notifModeAllShort')}</option>
                      <option value="mentions">{t(language, 'notifModeMentionsShort')}</option>
                      <option value="none">{t(language, 'notifModeNoneShort')}</option>
                    </select>
                    {muted ? (
                      <button
                        type="button"
                        onClick={() => void muteServer(srv.serverId, 'unmute')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 text-xs font-semibold"
                      >
                        {t(language, 'unmuteServer')}
                      </button>
                    ) : (
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '1h') void muteServer(srv.serverId, 3_600_000);
                          if (v === '8h') void muteServer(srv.serverId, 28_800_000);
                          if (v === 'forever') void muteServer(srv.serverId, 'forever');
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-xs"
                      >
                        <option value="">{t(language, 'muteLabel')}</option>
                        <option value="1h">{t(language, 'mute1h')}</option>
                        <option value="8h">{t(language, 'mute8h')}</option>
                        <option value="forever">{t(language, 'muteUntilUnmuted')}</option>
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {mutedChannelIds.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
            <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
              <BellOff className="w-3.5 h-3.5 text-amber-500" />
              <span>{t(language, 'mutedChannelsList')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {mutedChannelIds.map((chId) => (
                <button
                  key={chId}
                  type="button"
                  onClick={() => void muteChannel(chId, 'unmute')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-medium hover:bg-amber-500/20"
                >
                  <span>#{chId.slice(0, 8)}</span>
                  <span className="underline">{t(language, 'unmuteChannel')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LanguageTimeSection() {
  const { language } = useAuth();
  const { settings, updateSetting } = useUserSettings();
  const timezones = getCommonTimezones();

  const liveSample = formatMessageTimestamp(Date.now(), {
    language: settings.language,
    timeFormat: settings.timeFormat,
    timezone: settings.timezone,
    calendar: settings.calendar,
    todayLabel: t(language, 'todayAt'),
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Globe className="w-5 h-5 text-nexus" />
          <span>{t(language, 'languageAndTime')}</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'languageAndTimeSubtitle')}
        </p>
      </div>

      {/* Live Preview */}
      <div className="p-4 rounded-2xl border border-nexus/30 bg-nexus/5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-nexus shrink-0" />
          <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
            {t(language, 'timestampPreview')}
          </span>
        </div>
        <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
          {liveSample}
        </span>
      </div>

      {/* Language Switch */}
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          {t(language, 'languageRtl')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void updateSetting({ language: 'ar' })}
            className={`p-4 rounded-xl border text-start transition-colors ${
              settings.language === 'ar'
                ? 'border-nexus bg-nexus/10 text-slate-950 dark:text-white'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <div className="text-sm font-semibold">{t(language, 'languageAr')}</div>
          </button>
          <button
            type="button"
            onClick={() => void updateSetting({ language: 'en' })}
            className={`p-4 rounded-xl border text-start transition-colors ${
              settings.language === 'en'
                ? 'border-nexus bg-nexus/10 text-slate-950 dark:text-white'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <div className="text-sm font-semibold">{t(language, 'languageEn')}</div>
          </button>
        </div>
      </div>

      {/* Time Format & Calendar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            {t(language, 'timeFormatLabel')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['12h', t(language, 'timeFormat12h')],
                ['24h', t(language, 'timeFormat24h')],
              ] as [TimeFormatMode, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void updateSetting({ timeFormat: id })}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                  settings.timeFormat === id
                    ? 'border-nexus bg-nexus text-white'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            {t(language, 'calendarSystemLabel')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['gregory', t(language, 'calendarGregorian')],
                ['islamic', t(language, 'calendarHijri')],
              ] as [CalendarSystem, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void updateSetting({ calendar: id })}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                  settings.calendar === id
                    ? 'border-nexus bg-nexus text-white'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timezone */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          {t(language, 'timezoneLabel')}
        </label>
        <select
          value={settings.timezone}
          onChange={(e) => void updateSetting({ timezone: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm"
        >
          {!timezones.includes(settings.timezone) && (
            <option value={settings.timezone}>{settings.timezone}</option>
          )}
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
