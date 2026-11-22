import { useEffect, useState } from 'react';
import { Check, Eye, MessageSquare, Moon, Palette, RotateCcw, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useUserSettings } from '../../hooks/useUserSettings';
import { t } from '../../i18n/translations';
import type {
  AvatarShape,
  DisplayDensity,
  FontSizeLevel,
  MessageStyle,
  ThemeMode,
} from '../../types/majlis';
import { ACCENT_PRESETS, isValidHexColor } from '../../utils/validation';

export function AppearanceSection() {
  const { language } = useAuth();
  const { settings, updateSetting } = useUserSettings();
  const activeAccent =
    typeof document === 'undefined'
      ? settings.customAccentHex
      : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const colorPickerValue =
    settings.accentPreset === 'custom' && isValidHexColor(settings.customAccentHex)
      ? settings.customAccentHex
      : isValidHexColor(activeAccent)
        ? activeAccent
        : settings.customAccentHex;
  const [customHexDraft, setCustomHexDraft] = useState(colorPickerValue);
  const isThemePaletteEnabled = false;

  useEffect(() => {
    if (settings.accentPreset === 'custom') {
      setCustomHexDraft(settings.customAccentHex);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const currentAccent =
        typeof document === 'undefined'
          ? colorPickerValue
          : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      setCustomHexDraft(isValidHexColor(currentAccent) ? currentAccent : colorPickerValue);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [settings.accentPreset, settings.customAccentHex, settings.themeMode, colorPickerValue]);
  const themeOptions: ReadonlyArray<{
    id: ThemeMode;
    labelKey:
      | 'themeClassic'
      | 'themeEmerald'
      | 'themeSapphire'
      | 'themeAmethyst';
  }> = [
    { id: 'classic', labelKey: 'themeClassic' },
    { id: 'emerald', labelKey: 'themeEmerald' },
    { id: 'sapphire', labelKey: 'themeSapphire' },
    { id: 'amethyst', labelKey: 'themeAmethyst' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-bold text-text">
          {t(language, 'appearance')}
        </h2>
        <p className="mt-1 text-text-muted">
          {t(language, 'appearanceSubtitle')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t(language, 'themeLabel')}>
        <button
          type="button"
          aria-label={t(language, 'nightMode')}
          aria-pressed={settings.appearanceMode === 'dark'}
          onClick={() => void updateSetting({ appearanceMode: 'dark' })}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
            settings.appearanceMode === 'dark'
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-border bg-elevated text-text-muted hover:bg-hover'
          }`}
        >
          <Moon className="h-4 w-4" aria-hidden="true" />
          <span>{t(language, 'nightMode')}</span>
        </button>
        <button
          type="button"
          aria-label={t(language, 'dayMode')}
          aria-pressed={settings.appearanceMode === 'light'}
          onClick={() => void updateSetting({ appearanceMode: 'light' })}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
            settings.appearanceMode === 'light'
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-border bg-elevated text-text-muted hover:bg-hover'
          }`}
        >
          <Sun className="h-4 w-4" aria-hidden="true" />
          <span>{t(language, 'dayMode')}</span>
        </button>
        <button
          type="button"
          onClick={() =>
            void updateSetting({
              themeMode: 'classic',
              appearanceMode: 'light',
              accentPreset: 'theme',
              customAccentHex: '#7482FF',
            })
          }
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-text-muted transition-colors hover:bg-hover"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>{t(language, 'restoreAppearanceDefault')}</span>
        </button>
      </div>

      {isThemePaletteEnabled && (
        <div className="space-y-3">
            <h3 className="font-bold uppercase tracking-wider text-text-muted">
              {t(language, 'themeLabel')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {themeOptions.map((opt) => {
                const selected = settings.themeMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void updateSetting({ themeMode: opt.id })}
                    className={`relative p-3 rounded-xl border space-y-2 transition-colors ${
                      selected
                        ? 'border-accent bg-accent-soft text-text'
                        : 'border-border bg-elevated text-text hover:bg-hover'
                    }`}
                  >
                    <div className="font-semibold text-text">{t(language, opt.labelKey)}</div>
                    <div
                      className="theme-preview h-7 rounded-md overflow-hidden flex"
                      data-theme={opt.id}
                      data-theme-mode={settings.appearanceMode}
                      aria-hidden="true"
                    >
                      <span className="flex-1 bg-rail" />
                      <span className="flex-1 bg-sidebar" />
                      <span className="flex-1 bg-main" />
                      <span className="flex-1 bg-accent" />
                    </div>
                    {selected && (
                      <span className="absolute top-2 end-2 w-5 h-5 rounded-full bg-accent text-accent-contrast flex items-center justify-center shadow-sm">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
        </div>
      )}

      {/* Accent Color Presets + Custom Picker */}
      <div className="space-y-3">
            <h3 className="font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-link" />
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
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border font-semibold transition-colors ${
                      isSelected
                        ? 'border-accent bg-accent-soft text-text'
                        : 'border-border bg-elevated text-text-muted hover:bg-hover'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full ${preset.swatchClass} flex items-center justify-center text-accent-contrast shrink-0`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="truncate">{t(language, preset.labelKey)}</span>
                  </button>
                );
              })}

              {/* Custom Hex Picker */}
              <label
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-semibold text-text cursor-pointer transition-colors ${
                  settings.accentPreset === 'custom'
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-elevated text-text-muted hover:bg-hover'
                }`}
              >
                <input
                  type="color"
                  value={colorPickerValue}
                  onChange={(e) =>
                    void updateSetting(
                      {
                        accentPreset: 'custom',
                        customAccentHex: e.target.value,
                      },
                      { silent: true }
                    )
                  }
                  className="w-5 h-5 rounded cursor-pointer bg-input border-0 p-0 shrink-0"
                />
                <span className="truncate">{t(language, 'customColor')}</span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label={language === 'ar' ? 'لون التمييز بصيغة hex' : 'Accent color hex'}
                value={customHexDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  setCustomHexDraft(value);
                  if (isValidHexColor(value)) {
                    void updateSetting({ accentPreset: 'custom', customAccentHex: value });
                  }
                }}
                onBlur={() => {
                  if (!isValidHexColor(customHexDraft)) {
                    setCustomHexDraft(colorPickerValue);
                  }
                }}
                placeholder={colorPickerValue}
                className="w-32 px-3 py-2 rounded-lg border border-border bg-input text-text font-mono uppercase"
              />
              <button
                type="button"
                onClick={() => void updateSetting({ accentPreset: 'theme' })}
                className={`px-3 py-2 rounded-lg border font-semibold text-text transition-colors ${
                  settings.accentPreset === 'theme'
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-elevated text-text-muted hover:bg-hover'
                }`}
              >
                {t(language, 'accentThemeDefault')}
              </button>
            </div>
      </div>

      {/* Font Size & Display Density */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl border border-border bg-elevated space-y-3">
          <div className="font-bold uppercase tracking-wider text-text-muted">
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
                className={`py-2 px-2 rounded-lg font-semibold border transition-colors ${
                  settings.fontSize === id
                    ? 'border-accent bg-accent text-accent-contrast'
                    : 'border-border text-text hover:bg-hover'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-elevated space-y-3">
          <div className="font-bold uppercase tracking-wider text-text-muted">
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
                className={`py-2 px-2 rounded-lg font-semibold border transition-colors ${
                  settings.density === id
                    ? 'border-accent bg-accent text-accent-contrast'
                    : 'border-border text-text hover:bg-hover'
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
        <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-3">
          <div className="text-link font-bold uppercase tracking-wider text-text-muted dark:text-text-muted">
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
                className={`py-2 px-2 rounded-lg text-link font-semibold border transition-colors ${
                  settings.messageStyle === id
                    ? 'border-accent bg-accent text-text'
                    : 'border-border dark:border-border hover:bg-elevated dark:hover:bg-elevated'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-3">
          <div className="text-link font-bold uppercase tracking-wider text-text-muted dark:text-text-muted">
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
                className={`py-2 px-2 rounded-lg text-link font-semibold border transition-colors ${
                  settings.avatarShape === id
                    ? 'border-accent bg-accent text-text'
                    : 'border-border dark:border-border hover:bg-elevated dark:hover:bg-elevated'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reduced Motion */}
      <label className="flex items-center justify-between p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated cursor-pointer">
        <div>
          <div className="text-link font-semibold text-text dark:text-text">
            {t(language, 'reducedMotion')}
          </div>
          <div className="text-link text-text-muted dark:text-text-muted">
            {t(language, 'reducedMotionDesc')}
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(e) => void updateSetting({ reducedMotion: e.target.checked })}
          className="w-4 h-4 accent-accent"
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
        <h2 className="text-link font-bold text-text dark:text-text flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-link" />
          <span>{t(language, 'chatSettings')}</span>
        </h2>
        <p className="text-link text-text-muted dark:text-text-muted mt-1">
          {t(language, 'chatSettingsSubtitle')}
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated cursor-pointer"
          >
            <div>
              <div className="text-link font-semibold text-text dark:text-text">
                {item.title}
              </div>
              <div className="text-link text-text-muted dark:text-text-muted mt-0.5">
                {item.desc}
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings[item.key]}
              onChange={(e) => void updateSetting({ [item.key]: e.target.checked })}
              className="w-4 h-4 accent-accent shrink-0"
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
        <h2 className="text-link font-bold text-text dark:text-text flex items-center gap-2">
          <Eye className="w-5 h-5 text-link" />
          <span>{t(language, 'accessibilitySettings')}</span>
        </h2>
        <p className="text-link text-text-muted dark:text-text-muted mt-1">
          {t(language, 'accessibilitySubtitle')}
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated cursor-pointer"
          >
            <div>
              <div className="text-link font-semibold text-text dark:text-text">
                {item.title}
              </div>
              <div className="text-link text-text-muted dark:text-text-muted mt-0.5">
                {item.desc}
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings[item.key]}
              onChange={(e) => void updateSetting({ [item.key]: e.target.checked })}
              className="w-4 h-4 accent-accent shrink-0"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
