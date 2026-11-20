import { Check, Eye, Laptop, MessageSquare, Moon, Palette, Sparkles, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useUserSettings } from '../../hooks/useUserSettings';
import { t } from '../../i18n/translations';
import type {
  AvatarShape,
  DisplayDensity,
  FontSizeLevel,
  MessageStyle,
  ThemeMode,
} from '../../types/nexus';
import { ACCENT_PRESETS, isValidHexColor } from '../../utils/validation';

export function AppearanceSection() {
  const { language } = useAuth();
  const { settings, updateSetting } = useUserSettings();

  const themeOptions: ReadonlyArray<{
    id: ThemeMode;
    label: string;
    icon: typeof Moon;
  }> = [
    { id: 'dark', label: t(language, 'darkTheme'), icon: Moon },
    { id: 'light', label: t(language, 'lightTheme'), icon: Sun },
    { id: 'system', label: t(language, 'systemTheme'), icon: Laptop },
    { id: 'amoled', label: t(language, 'amoledTheme'), icon: Sparkles },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {t(language, 'appearance')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'appearanceSubtitle')}
        </p>
      </div>

      {/* Theme Mode */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          {t(language, 'themeLabel')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const selected = settings.themeMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => void updateSetting({ themeMode: opt.id })}
                className={`p-4 rounded-xl border text-start space-y-2 transition-colors ${
                  selected
                    ? 'border-nexus bg-nexus/10 text-slate-950 dark:text-white'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5 text-nexus" />
                <div className="text-xs font-semibold">{opt.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent Color Presets + Custom Picker */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-nexus" />
          <span>{t(language, 'accentColor')}</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {ACCENT_PRESETS.map((preset) => {
            const isSelected = settings.accentPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => void updateSetting({ accentPreset: preset.id })}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'border-nexus bg-nexus/10 text-slate-950 dark:text-white'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full ${preset.swatchClass} flex items-center justify-center text-white shrink-0`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
                <span className="truncate">{t(language, preset.labelKey)}</span>
              </button>
            );
          })}

          {/* Custom Hex Picker */}
          <label
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
              settings.accentPreset === 'custom'
                ? 'border-nexus bg-nexus/10 text-slate-950 dark:text-white'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <input
              type="color"
              value={isValidHexColor(settings.customAccentHex) ? settings.customAccentHex : '#5865F2'}
              onChange={(e) =>
                void updateSetting(
                  {
                    accentPreset: 'custom',
                    customAccentHex: e.target.value,
                  },
                  { silent: true }
                )
              }
              className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"
            />
            <span className="truncate">{t(language, 'customColor')}</span>
          </label>
        </div>
      </div>

      {/* Font Size & Display Density */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            {t(language, 'fontSizeLabel')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['small', t(language, 'fontSizeSmall')],
                ['normal', t(language, 'fontSizeNormal')],
                ['large', t(language, 'fontSizeLarge')],
              ] as [FontSizeLevel, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void updateSetting({ fontSize: id })}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                  settings.fontSize === id
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
            {t(language, 'displayDensityLabel')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['comfortable', t(language, 'densityComfortable')],
                ['compact', t(language, 'densityCompact')],
              ] as [DisplayDensity, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void updateSetting({ density: id })}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                  settings.density === id
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

      {/* Message Style & Avatar Shape */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            {t(language, 'messageStyleLabel')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['normal', t(language, 'messageStyleNormal')],
                ['compact', t(language, 'messageStyleCompact')],
              ] as [MessageStyle, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void updateSetting({ messageStyle: id })}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                  settings.messageStyle === id
                    ? 'border-nexus bg-nexus text-white'
                    : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Live message preview */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1E1F22] border border-slate-200 dark:border-white/10 text-xs space-y-1.5">
            {settings.messageStyle === 'compact' ? (
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] text-slate-400 tabular-nums">12:30</span>
                <span className="font-semibold text-nexus">Majlis</span>
                <span className="text-slate-700 dark:text-zinc-200">
                  {t(language, 'messageStylePreviewText')}
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 nexus-avatar-shape bg-nexus text-white font-bold flex items-center justify-center shrink-0">
                  M
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">Majlis</span>
                    <span className="text-[10px] text-slate-400">12:30</span>
                  </div>
                  <div className="text-slate-700 dark:text-zinc-200 mt-0.5">
                    {t(language, 'messageStylePreviewText')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            {t(language, 'avatarShapeLabel')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['circle', t(language, 'avatarCircle')],
                ['rounded', t(language, 'avatarRounded')],
              ] as [AvatarShape, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void updateSetting({ avatarShape: id })}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                  settings.avatarShape === id
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

      {/* Reduced Motion */}
      <label className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] cursor-pointer">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(language, 'reducedMotion')}
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400">
            {t(language, 'reducedMotionDesc')}
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(e) => void updateSetting({ reducedMotion: e.target.checked })}
          className="w-4 h-4 accent-nexus"
        />
      </label>
    </div>
  );
}

export function ChatSection() {
  const { language } = useAuth();
  const { settings, updateSetting } = useUserSettings();

  const items: ReadonlyArray<{
    key:
      | 'autoPreviewLinks'
      | 'autoEmoji'
      | 'showQuickReply'
      | 'showTypingIndicators'
      | 'confirmExternalLinks';
    title: string;
    desc: string;
  }> = [
    {
      key: 'autoPreviewLinks',
      title: t(language, 'autoPreviewLinks'),
      desc: t(language, 'autoPreviewLinksDesc'),
    },
    {
      key: 'autoEmoji',
      title: t(language, 'autoEmoji'),
      desc: t(language, 'autoEmojiDesc'),
    },
    {
      key: 'showQuickReply',
      title: t(language, 'showQuickReply'),
      desc: t(language, 'showQuickReplyDesc'),
    },
    {
      key: 'showTypingIndicators',
      title: t(language, 'showTypingIndicators'),
      desc: t(language, 'showTypingIndicatorsDesc'),
    },
    {
      key: 'confirmExternalLinks',
      title: t(language, 'confirmExternalLinks'),
      desc: t(language, 'confirmExternalLinksDesc'),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-nexus" />
          <span>{t(language, 'chatSettings')}</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'chatSettingsSubtitle')}
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] cursor-pointer"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {item.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {item.desc}
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings[item.key]}
              onChange={(e) => void updateSetting({ [item.key]: e.target.checked })}
              className="w-4 h-4 accent-nexus shrink-0"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function AccessibilitySection() {
  const { language } = useAuth();
  const { settings, updateSetting } = useUserSettings();

  const items: ReadonlyArray<{
    key: 'highContrast' | 'reduceTransparency' | 'largeControls';
    title: string;
    desc: string;
  }> = [
    {
      key: 'highContrast',
      title: t(language, 'highContrast'),
      desc: t(language, 'highContrastDesc'),
    },
    {
      key: 'reduceTransparency',
      title: t(language, 'reduceTransparency'),
      desc: t(language, 'reduceTransparencyDesc'),
    },
    {
      key: 'largeControls',
      title: t(language, 'largeControls'),
      desc: t(language, 'largeControlsDesc'),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Eye className="w-5 h-5 text-nexus" />
          <span>{t(language, 'accessibilitySettings')}</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          {t(language, 'accessibilitySubtitle')}
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] cursor-pointer"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {item.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {item.desc}
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings[item.key]}
              onChange={(e) => void updateSetting({ [item.key]: e.target.checked })}
              className="w-4 h-4 accent-nexus shrink-0"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
