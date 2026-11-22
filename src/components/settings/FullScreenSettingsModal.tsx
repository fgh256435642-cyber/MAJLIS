import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Database,
  Eye,
  Globe,
  Info,
  Keyboard,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  Palette,
  Search,
  Shield,
  Smile,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { VoiceDiagnosticPeer } from '../../hooks/useVoiceRTC';
import { t, type TranslationKey } from '../../i18n/translations';
import type { JoinedServerRef, SettingsCategoryId } from '../../types/majlis';
import { AccountSection, type UnsavedBarState } from './AccountSection';
import {
  AccessibilitySection,
  AppearanceSection,
  ChatSection,
} from './AppearanceChatAccessibilitySections';
import {
  LanguageTimeSection,
  NotificationsSection,
} from './NotificationsLocaleSections';
import {
  AboutSection,
  KeybindsSection,
  MyDataSection,
  PrivacySafetySection,
} from './PrivacyKeybindsDataAboutSections';
import { ProfileStatusSection } from './ProfileStatusSection';
import { VoiceVideoSection } from './VoiceVideoSection';

interface FullScreenSettingsModalProps {
  initialCategory?: SettingsCategoryId;
  joinedServers: JoinedServerRef[];
  voiceActive: boolean;
  getVoiceDiagnostics: () => Promise<VoiceDiagnosticPeer[]>;
  onClose: () => void;
}

interface CategoryItem {
  id: SettingsCategoryId;
  labelKey: TranslationKey;
  icon: typeof User;
  group: 'user' | 'app' | 'info';
  keywords: string;
}

const CATEGORIES: ReadonlyArray<CategoryItem> = [
  {
    id: 'account',
    labelKey: 'myAccount',
    icon: User,
    group: 'user',
    keywords: 'account email password 2fa mfa banner avatar username color delete حسابي كلمة المرور البريد المصادقة حذف',
  },
  {
    id: 'profileStatus',
    labelKey: 'profileAndStatus',
    icon: Smile,
    group: 'user',
    keywords: 'profile status custom bio presence emoji card preview الملف الشخصي الحالة مخصصة نبذة',
  },
  {
    id: 'privacySafety',
    labelKey: 'privacyAndSafety',
    icon: Shield,
    group: 'user',
    keywords: 'privacy block friends dm offline devices sessions security الخصوصية حظر أجهزة جلسات الأمان',
  },
  {
    id: 'appearance',
    labelKey: 'appearance',
    icon: Palette,
    group: 'app',
    keywords: 'theme dark light system amoled color font density compact avatar motion المظهر داكن فاتح خط كثافة لون',
  },
  {
    id: 'notifications',
    labelKey: 'notifications',
    icon: Bell,
    group: 'app',
    keywords: 'notifications sound volume mute dnd schedule server channel الإشعارات صوت كتم عدم الإزعاج',
  },
  {
    id: 'voiceVideo',
    labelKey: 'voiceAndVideo',
    icon: Mic,
    group: 'app',
    keywords: 'voice audio mic speaker camera video quality push to talk stun webrtc الصوت الكاميرا ميكروفون',
  },
  {
    id: 'languageTime',
    labelKey: 'languageAndTime',
    icon: Globe,
    group: 'app',
    keywords: 'language arabic english rtl ltr timezone 12h 24h hijri gregorian اللغة الوقت التقويم الهجري',
  },
  {
    id: 'chat',
    labelKey: 'chatSettings',
    icon: MessageSquare,
    group: 'app',
    keywords: 'chat links preview emoji reply typing external الدردشة روابط إيموجي الرد السريع',
  },
  {
    id: 'accessibility',
    labelKey: 'accessibilitySettings',
    icon: Eye,
    group: 'app',
    keywords: 'accessibility contrast transparency large buttons إمكانية الوصول التباين الشفافية',
  },
  {
    id: 'keybinds',
    labelKey: 'keybindsTitle',
    icon: Keyboard,
    group: 'app',
    keywords: 'keyboard shortcuts keybinds ctrl k b mute deafen اختصارات لوحة المفاتيح',
  },
  {
    id: 'myData',
    labelKey: 'myDataTitle',
    icon: Database,
    group: 'info',
    keywords: 'data export json download cache clear بياناتي تصدير تحميل مسح الذاكرة',
  },
  {
    id: 'about',
    labelKey: 'aboutAppTitle',
    icon: Info,
    group: 'info',
    keywords: 'about version changelog report problem bug feedback حول التطبيق الإصدار إبلاغ مشكلة',
  },
];

export function FullScreenSettingsModal({
  initialCategory = 'account',
  joinedServers,
  voiceActive,
  getVoiceDiagnostics,
  onClose,
}: FullScreenSettingsModalProps) {
  const { language, logout } = useAuth();
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>(initialCategory);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dirtyState, setDirtyState] = useState<UnsavedBarState | null>(null);

  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory]);

  // Esc closes settings modal cleanly
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDirtyChange = useCallback((state: UnsavedBarState | null) => {
    setDirtyState(state);
  }, []);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((cat) => {
      const label = t(language, cat.labelKey).toLowerCase();
      return label.includes(q) || cat.keywords.toLowerCase().includes(q);
    });
  }, [searchQuery, language]);

  const selectCategory = (id: SettingsCategoryId) => {
    setActiveCategory(id);
    setMobileShowDetail(true);
  };

  const renderNavGroup = (group: 'user' | 'app' | 'info', titleKey: TranslationKey) => {
    const items = filteredCategories.filter((c) => c.group === group);
    if (items.length === 0) return null;
    return (
      <div key={group} className="space-y-0.5">
        <div className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-text-muted dark:text-text-muted">
          {t(language, titleKey)}
        </div>
        {items.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectCategory(cat.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-link font-medium text-link transition-colors ${
                isActive
                  ? 'bg-hover dark:bg-hover text-text dark:text-text font-semibold'
                  : 'text-text dark:text-text hover:bg-hover/60 dark:hover:bg-hover/60 hover:text-text dark:hover:text-text'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0 opacity-80" />
              <span className="truncate">{t(language, cat.labelKey)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const activeCategoryMeta =
    CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(language, 'userSettings')}
      className="fixed inset-0 z-50 bg-main dark:bg-main text-text dark:text-text flex flex-col md:flex-row overflow-hidden"
    >
      {/* Navigation Sidebar (Desktop: fixed start column; Mobile: full-width list screen) */}
      <aside
        className={`${
          mobileShowDetail ? 'hidden md:flex' : 'flex'
        } w-full md:w-72 lg:w-80 shrink-0 h-full bg-hover/75 dark:bg-hover/75 border-accent border-border dark:border-border flex-col md:items-end`}
      >
        <div className="w-full md:w-64 h-full flex flex-col p-4 overflow-y-auto">
          {/* Mobile Top Header */}
          <div className="flex md:hidden items-center justify-between mb-3">
            <h1 className="text-link font-bold">{t(language, 'settings')}</h1>
            <button
              type="button"
              onClick={onClose}
              aria-label={t(language, 'closeSettings')}
              className="p-2 rounded-full bg-hover/60 dark:bg-hover/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mb-2 shrink-0">
            <Search className="w-4 h-4 text-text-muted absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(language, 'searchSettingsPlaceholder')}
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Grouped Categories */}
          <nav className="flex-1 space-y-2">
            {renderNavGroup('user', 'settingsGroupUser')}
            {renderNavGroup('app', 'settingsGroupApp')}
            {renderNavGroup('info', 'settingsGroupInfo')}
            {filteredCategories.length === 0 && (
              <p className="px-3 py-6 text-link text-text-muted dark:text-text-muted text-link">
                {t(language, 'noSettingsMatch')}
              </p>
            )}
          </nav>

          {/* Sign Out */}
          <div className="pt-3 mt-3 border-accent border-border dark:border-border">
            <button
              type="button"
              onClick={() => {
                onClose();
                void logout();
              }}
              className="w-full px-3 py-2 rounded-lg text-link font-semibold text-danger dark:text-danger hover:bg-danger/10 flex items-center justify-between transition-colors"
            >
              <span>{t(language, 'signOut')}</span>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Content Pane (Desktop: always visible; Mobile: shown when a category is picked) */}
      <section
        className={`${
          mobileShowDetail ? 'flex' : 'hidden md:flex'
        } flex-1 min-w-0 h-full flex-col relative overflow-hidden`}
      >
        {/* Mobile Detail Header with Back Button */}
        <div className="md:hidden h-12 px-3 border-accent border-border dark:border-border bg-elevated dark:bg-elevated flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileShowDetail(false)}
            className="inline-flex items-center gap-1.5 text-link font-semibold text-text dark:text-text"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            <span>{t(language, 'backLabel')}</span>
          </button>
          <span className="text-link font-bold truncate">
            {t(language, activeCategoryMeta.labelKey)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(language, 'closeSettings')}
            className="p-1.5 rounded-lg text-text-muted hover:text-text dark:hover:text-text"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Inner Container */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-10 py-8 pb-28">
          <div className="max-w-3xl mx-auto md:mx-0 flex items-start gap-6">
            <div className="flex-1 min-w-0">
              {activeCategory === 'account' && (
                <AccountSection
                  onDirtyStateChange={handleDirtyChange}
                  onCloseSettings={onClose}
                />
              )}
              {activeCategory === 'profileStatus' && (
                <ProfileStatusSection onDirtyStateChange={handleDirtyChange} />
              )}
              {activeCategory === 'appearance' && <AppearanceSection />}
              {activeCategory === 'notifications' && (
                <NotificationsSection joinedServers={joinedServers} />
              )}
              {activeCategory === 'voiceVideo' && (
                <VoiceVideoSection
                  voiceActive={voiceActive}
                  getVoiceDiagnostics={getVoiceDiagnostics}
                />
              )}
              {activeCategory === 'privacySafety' && <PrivacySafetySection />}
              {activeCategory === 'languageTime' && <LanguageTimeSection />}
              {activeCategory === 'chat' && <ChatSection />}
              {activeCategory === 'accessibility' && <AccessibilitySection />}
              {activeCategory === 'keybinds' && <KeybindsSection />}
              {activeCategory === 'myData' && <MyDataSection />}
              {activeCategory === 'about' && <AboutSection />}
            </div>

            {/* Desktop Floating Esc + Close (X) Column */}
            <div className="hidden md:flex flex-col items-center gap-1 sticky top-0 shrink-0 pt-1">
              <button
                type="button"
                onClick={onClose}
                aria-label={t(language, 'closeSettings')}
                className="w-9 h-9 rounded-full border-2 border-border dark:border-border text-text dark:text-text hover:border-border dark:hover:border-border hover:text-text dark:hover:text-text flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted dark:text-text-muted">
                ESC
              </span>
            </div>
          </div>
        </div>

        {/* Sticky Unsaved Changes Bar */}
        {dirtyState?.dirty && (
          <div className="absolute bottom-4 inset-x-4 sm:inset-x-8 z-30 flex justify-center pointer-events-none">
            <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-border dark:border-border bg-rail text-text px-4 py-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-3">
              <span className="text-link sm:text-link font-medium">
                {t(language, 'unsavedChangesNotice')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={dirtyState.saving}
                  onClick={dirtyState.onReset}
                  className="px-3 py-1.5 rounded-lg text-link font-semibold text-text-muted hover:text-text hover:bg-text/10 transition-colors"
                >
                  {t(language, 'resetChanges')}
                </button>
                <button
                  type="button"
                  disabled={dirtyState.saving}
                  onClick={dirtyState.onSave}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-success hover:bg-success disabled:opacity-50 text-text text-link font-semibold transition-colors"
                >
                  {dirtyState.saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t(language, 'save')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
