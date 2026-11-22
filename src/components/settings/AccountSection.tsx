import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Palette,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { t } from '../../i18n/translations';
import {
  changeUserEmail,
  changeUserPassword,
  deleteMyAccountAndData,
  ensureUserProfile,
  finalizeTotpMfaEnrollment,
  getEnrolledMfaFactors,
  startTotpMfaEnrollment,
  unenrollMfaFactor,
  updateUserProfile,
} from '../../services/majlisService';
import { uploadFileToStorage } from '../../services/storageService';
import { isValidHexColor, isValidUsername, LIMITS } from '../../utils/validation';
import { UserAvatar } from '../MajlisLogo';
import { ProfileBanner } from '../ProfileBanner';

export interface UnsavedBarState {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}

const PROFILE_COLOR_SWATCHES = [
  { hex: '#5865F2', cls: 'bg-[#5865F2]' },
  { hex: '#0EA5E9', cls: 'bg-[#0EA5E9]' },
  { hex: '#10B981', cls: 'bg-[#10B981]' },
  { hex: '#8B5CF6', cls: 'bg-[#8B5CF6]' },
  { hex: '#F43F5E', cls: 'bg-[#F43F5E]' },
  { hex: '#F59E0B', cls: 'bg-[#F59E0B]' },
  { hex: '#334155', cls: 'bg-[#334155]' },
] as const;

export function AccountSection({
  onDirtyStateChange,
  onCloseSettings,
}: {
  onDirtyStateChange: (state: UnsavedBarState | null) => void;
  onCloseSettings: () => void;
}) {
  const { firebaseUser, publicUser, language } = useAuth();
  const { pushToast } = useToast();

  const fallbackDisplayName =
    firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || '';
  const fallbackUsername =
    (firebaseUser?.email?.split('@')[0] || (firebaseUser ? `user_${firebaseUser.uid.slice(0, 6)}` : ''))
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .slice(0, LIMITS.USERNAME_MAX);
  const fallbackAvatarUrl =
    firebaseUser?.photoURL && firebaseUser.photoURL.startsWith('https://')
      ? firebaseUser.photoURL
      : '';

  const baseDisplayName = publicUser ? publicUser.displayName || '' : fallbackDisplayName;
  const baseUsername = publicUser ? publicUser.username || '' : fallbackUsername;
  const baseBio = publicUser?.bio || '';
  const baseAvatarUrl = publicUser ? publicUser.avatarUrl || '' : fallbackAvatarUrl;
  const baseBannerUrl = publicUser?.bannerUrl || '';
  const baseProfileColor = publicUser?.profileColor || '#5865F2';
  const baseDiscoverable = publicUser?.isDiscoverable ?? true;

  const [displayName, setDisplayName] = useState(baseDisplayName);
  const [username, setUsername] = useState(baseUsername);
  const [bio, setBio] = useState(baseBio);
  const [avatarUrl, setAvatarUrl] = useState(baseAvatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState(baseBannerUrl);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [profileColor, setProfileColor] = useState(baseProfileColor);
  const [isDiscoverable, setIsDiscoverable] = useState(baseDiscoverable);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarPreviewObjUrl, setAvatarPreviewObjUrl] = useState<string | null>(null);
  const [bannerPreviewObjUrl, setBannerPreviewObjUrl] = useState<string | null>(null);

  const baselineRef = useRef({
    displayName: baseDisplayName,
    username: baseUsername,
    bio: baseBio,
    avatarUrl: baseAvatarUrl,
    bannerUrl: baseBannerUrl,
    profileColor: baseProfileColor,
    isDiscoverable: baseDiscoverable,
  });

  // Email change state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState(firebaseUser?.email || '');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // 2FA / TOTP state
  const [mfaFactors, setMfaFactors] = useState(() => getEnrolledMfaFactors());
  const [mfaReauthPassword, setMfaReauthPassword] = useState('');
  const [mfaSetup, setMfaSetup] = useState<{
    secret: Awaited<ReturnType<typeof startTotpMfaEnrollment>>['secret'];
    qrUrl: string;
    secretKey: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaNotSupportedNotice, setMfaNotSupportedNotice] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteUsernameConfirm, setDeleteUsernameConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const hasPasswordProvider = !!firebaseUser?.providerData.some(
    (p) => p.providerId === 'password'
  );

  // Hydrate fields whenever publicUser or firebaseUser arrives/updates without clobbering active user edits
  useEffect(() => {
    const prev = baselineRef.current;
    setDisplayName((curr) => (curr === prev.displayName || curr === '' ? baseDisplayName : curr));
    setUsername((curr) => (curr === prev.username || curr === '' ? baseUsername : curr));
    setBio((curr) => (curr === prev.bio ? baseBio : curr));
    setAvatarUrl((curr) => (curr === prev.avatarUrl ? baseAvatarUrl : curr));
    setBannerUrl((curr) => (curr === prev.bannerUrl ? baseBannerUrl : curr));
    setProfileColor((curr) => (curr === prev.profileColor ? baseProfileColor : curr));
    setIsDiscoverable((curr) => (curr === prev.isDiscoverable ? baseDiscoverable : curr));

    baselineRef.current = {
      displayName: baseDisplayName,
      username: baseUsername,
      bio: baseBio,
      avatarUrl: baseAvatarUrl,
      bannerUrl: baseBannerUrl,
      profileColor: baseProfileColor,
      isDiscoverable: baseDiscoverable,
    };
  }, [
    baseDisplayName,
    baseUsername,
    baseBio,
    baseAvatarUrl,
    baseBannerUrl,
    baseProfileColor,
    baseDiscoverable,
  ]);

  useEffect(() => {
    if (!showEmailForm) {
      setNewEmail(firebaseUser?.email || '');
    }
    setMfaFactors(getEnrolledMfaFactors());
  }, [firebaseUser, showEmailForm]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewObjUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewObjUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreviewObjUrl(null);
      return;
    }
    const url = URL.createObjectURL(bannerFile);
    setBannerPreviewObjUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerFile]);

  // Reset form to authoritative baseline
  const syncFromPublicUser = useCallback(() => {
    setDisplayName(baseDisplayName);
    setUsername(baseUsername);
    setBio(baseBio);
    setAvatarUrl(baseAvatarUrl);
    setAvatarFile(null);
    setBannerUrl(baseBannerUrl);
    setBannerFile(null);
    setProfileColor(baseProfileColor);
    setIsDiscoverable(baseDiscoverable);
  }, [
    baseDisplayName,
    baseUsername,
    baseBio,
    baseAvatarUrl,
    baseBannerUrl,
    baseProfileColor,
    baseDiscoverable,
  ]);

  const isDirty = publicUser
    ? displayName !== (publicUser.displayName || '') ||
      username !== (publicUser.username || '') ||
      bio !== (publicUser.bio || '') ||
      avatarUrl !== (publicUser.avatarUrl || '') ||
      avatarFile !== null ||
      bannerUrl !== (publicUser.bannerUrl || '') ||
      bannerFile !== null ||
      profileColor !== (publicUser.profileColor || '#5865F2') ||
      isDiscoverable !== (publicUser.isDiscoverable ?? true)
    : Boolean(displayName.trim() && username.trim().length >= LIMITS.USERNAME_MIN);

  const handleSaveProfile = useCallback(async () => {
    if (!firebaseUser) return;
    const cleanDisplay = displayName.trim();
    const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!cleanDisplay) {
      pushToast({
        type: 'error',
        title: t(language, 'profileUpdateFailed'),
        description:
          language === 'ar' ? 'الاسم الظاهر مطلوب.' : 'Display name is required.',
      });
      return;
    }
    if (!isValidUsername(cleanUsername)) {
      pushToast({
        type: 'error',
        title: t(language, 'profileUpdateFailed'),
        description:
          language === 'ar'
            ? 'اسم المستخدم يجب أن يكون من ٢ إلى ٣٢ حرفاً (أحرف إنجليزية، أرقام، _ أو . أو -).'
            : 'Username must be 2–32 characters (letters, numbers, _, ., -).',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const targetProfile =
        publicUser || (await ensureUserProfile(firebaseUser, cleanUsername, cleanDisplay));

      let nextAvatar = avatarUrl;
      if (avatarFile) {
        nextAvatar = await uploadFileToStorage(
          `avatars/${firebaseUser.uid}`,
          avatarFile,
          undefined,
          { maxWidth: 320, maxHeight: 320, maxDataUrlLength: 75_000 }
        );
      }
      let nextBanner = bannerUrl;
      if (bannerFile) {
        nextBanner = await uploadFileToStorage(
          `avatars/${firebaseUser.uid}`,
          bannerFile,
          undefined,
          { maxWidth: 960, maxHeight: 360, maxDataUrlLength: 140_000 }
        );
      }
      const nextColor = isValidHexColor(profileColor) ? profileColor : '#5865F2';
      await updateUserProfile(firebaseUser.uid, targetProfile, {
        displayName: cleanDisplay,
        username: cleanUsername,
        bio,
        avatarUrl: nextAvatar,
        bannerUrl: nextBanner,
        profileColor: nextColor,
        isDiscoverable,
      });
      baselineRef.current = {
        displayName: cleanDisplay,
        username: cleanUsername,
        bio: bio.trim(),
        avatarUrl: nextAvatar,
        bannerUrl: nextBanner,
        profileColor: nextColor,
        isDiscoverable,
      };
      setDisplayName(cleanDisplay);
      setUsername(cleanUsername);
      setAvatarUrl(nextAvatar);
      setBannerUrl(nextBanner);
      setAvatarFile(null);
      setBannerFile(null);
      pushToast({ type: 'success', title: t(language, 'profileUpdated') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'profileUpdateFailed'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingProfile(false);
    }
  }, [
    firebaseUser,
    publicUser,
    avatarUrl,
    avatarFile,
    bannerUrl,
    bannerFile,
    displayName,
    username,
    bio,
    profileColor,
    isDiscoverable,
    pushToast,
    language,
  ]);

  const saveRef = useRef(handleSaveProfile);
  saveRef.current = handleSaveProfile;
  const resetRef = useRef(syncFromPublicUser);
  resetRef.current = syncFromPublicUser;

  useEffect(() => {
    if (isDirty) {
      onDirtyStateChange({
        dirty: true,
        saving: savingProfile,
        onSave: () => void saveRef.current(),
        onReset: () => resetRef.current(),
      });
    } else {
      onDirtyStateChange(null);
    }
  }, [isDirty, savingProfile, onDirtyStateChange]);

  useEffect(() => {
    return () => onDirtyStateChange(null);
  }, [onDirtyStateChange]);

  const previewAvatar = avatarPreviewObjUrl || avatarUrl;
  const previewBanner = bannerPreviewObjUrl || bannerUrl;

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSavingEmail(true);
    try {
      await changeUserEmail(emailPassword, newEmail.trim());
      pushToast({
        type: 'success',
        title: t(language, 'emailVerificationSent'),
        description: newEmail.trim(),
      });
      setShowEmailForm(false);
      setEmailPassword('');
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      pushToast({ type: 'error', title: t(language, 'passwordTooShort') });
      return;
    }
    if (newPassword !== confirmPassword) {
      pushToast({ type: 'error', title: t(language, 'passwordsDoNotMatch') });
      return;
    }
    setSavingPassword(true);
    try {
      await changeUserPassword(currentPassword, newPassword);
      pushToast({ type: 'success', title: t(language, 'passwordUpdated') });
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleStartMfa = async () => {
    setMfaBusy(true);
    setMfaNotSupportedNotice(false);
    try {
      const res = await startTotpMfaEnrollment(mfaReauthPassword || undefined);
      setMfaSetup(res);
      setMfaReauthPassword('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'MFA_NOT_ENABLED_ON_PROJECT') {
        setMfaNotSupportedNotice(true);
      } else {
        pushToast({
          type: 'error',
          title: t(language, 'errorGeneric'),
          description: msg === 'REAUTH_REQUIRED' || msg === 'PASSWORD_REQUIRED'
            ? t(language, 'reauthPasswordRequired')
            : msg || undefined,
        });
      }
    } finally {
      setMfaBusy(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaSetup || mfaCode.trim().length < 6) return;
    setMfaBusy(true);
    try {
      await finalizeTotpMfaEnrollment(mfaSetup.secret, mfaCode.trim());
      setMfaFactors(getEnrolledMfaFactors());
      setMfaSetup(null);
      setMfaCode('');
      pushToast({ type: 'success', title: t(language, 'twoFactorEnabledToast') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleUnenrollMfa = async (factorUid: string) => {
    setMfaBusy(true);
    try {
      await unenrollMfaFactor(factorUid, mfaReauthPassword || undefined);
      setMfaFactors(getEnrolledMfaFactors());
      setMfaReauthPassword('');
      pushToast({ type: 'info', title: t(language, 'twoFactorDisabledToast') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const expectedUsername = publicUser?.username || fallbackUsername;
    if (
      expectedUsername &&
      deleteUsernameConfirm.trim().toLowerCase() !== expectedUsername.toLowerCase()
    ) {
      pushToast({ type: 'error', title: t(language, 'usernameMismatch') });
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteMyAccountAndData(
        firebaseUser.uid,
        publicUser ?? null,
        hasPasswordProvider ? deletePassword : undefined
      );
      onCloseSettings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description:
          msg === 'PASSWORD_REQUIRED' || msg === 'REAUTH_REQUIRED'
            ? t(language, 'reauthPasswordRequired')
            : msg || undefined,
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-link font-bold text-text dark:text-text">
          {t(language, 'myAccount')}
        </h2>
        <p className="text-link text-text-muted dark:text-text-muted mt-1">
          {t(language, 'myAccountSubtitle')}
        </p>
      </div>

      {/* Account Profile Card & Identity Fields */}
      <div className="rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated overflow-hidden shadow-sm">
        <div className="relative">
          <ProfileBanner bannerUrl={previewBanner} profileColor={profileColor} className="h-28" />
          <div className="absolute top-3 end-3 flex items-center gap-2">
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-rail/60 hover:bg-rail/80 text-text text-link font-medium inline-flex items-center gap-1.5 backdrop-blur-sm transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>{t(language, 'changeBanner')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setBannerFile(f);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
            {(bannerUrl || bannerFile) && (
              <button
                type="button"
                onClick={() => {
                  setBannerFile(null);
                  setBannerUrl('');
                }}
                className="p-1.5 rounded-lg bg-rail/60 hover:bg-danger text-text transition-colors"
                title={t(language, 'removeBanner')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="-mt-10 mb-5 flex flex-wrap items-end justify-between gap-4">
            <label className="relative cursor-pointer group rounded-full">
              <UserAvatar
                src={previewAvatar}
                name={
                  displayName ||
                  publicUser?.displayName ||
                  firebaseUser?.displayName ||
                  firebaseUser?.email ||
                  'U'
                }
                size="xl"
                className="w-20 h-20 transition-transform duration-200 group-hover:scale-105"
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAvatarFile(f);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>

            <div className="flex items-center gap-2">
              {(avatarUrl || avatarFile) && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarUrl('');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border dark:border-border text-link font-medium text-text dark:text-text hover:bg-main dark:hover:bg-main"
                >
                  {t(language, 'removeAvatar')}
                </button>
              )}
              <button
                type="button"
                disabled={!isDirty || savingProfile}
                onClick={() => void handleSaveProfile()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-40 text-text text-link font-semibold transition-colors"
              >
                {savingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t(language, 'save')}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-link font-semibold text-text dark:text-text mb-1.5">
                {t(language, 'displayName')}
              </label>
              <input
                type="text"
                maxLength={64}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link focus:outline-accent focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-link font-semibold text-text dark:text-text mb-1.5">
                {t(language, 'username')}
              </label>
              <input
                type="text"
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link focus:outline-accent focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-link font-semibold text-text dark:text-text mb-1.5">
              {t(language, 'bio')}
            </label>
            <textarea
              rows={3}
              maxLength={240}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t(language, 'bioPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link focus:outline-accent focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Profile Color Picker */}
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-1.5 text-link font-semibold text-text dark:text-text">
              <Palette className="w-3.5 h-3.5 text-link" />
              <span>{t(language, 'profileColor')}</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PROFILE_COLOR_SWATCHES.map((sw) => {
                const selected = profileColor.toLowerCase() === sw.hex.toLowerCase();
                return (
                  <button
                    key={sw.hex}
                    type="button"
                    aria-label={sw.hex}
                    onClick={() => setProfileColor(sw.hex)}
                    className={`w-7 h-7 rounded-full ${sw.cls} flex items-center justify-center text-text ring-offset-2 ring-offset-elevated transition-transform ${
                      selected ? 'ring-2 ring-accent scale-110' : 'hover:scale-105'
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                );
              })}
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link cursor-pointer">
                <input
                  type="color"
                  value={isValidHexColor(profileColor) ? profileColor : '#5865F2'}
                  onChange={(e) => setProfileColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer bg-accent border-0 p-0"
                />
                <span className="font-mono uppercase">{profileColor}</span>
              </label>
            </div>
          </div>

          {/* Discoverable toggle */}
          <label className="mt-4 flex items-center justify-between p-3 rounded-xl border border-border dark:border-border bg-elevated dark:bg-elevated cursor-pointer">
            <div>
              <div className="text-link font-medium text-text dark:text-text">
                {t(language, 'discoverableAccount')}
              </div>
              <div className="text-link text-text-muted dark:text-text-muted">
                {t(language, 'discoverableAccountDesc')}
              </div>
            </div>
            <input
              type="checkbox"
              checked={isDiscoverable}
              onChange={(e) => setIsDiscoverable(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
          </label>
        </div>
      </div>

      {/* Email & Password Security */}
      <div className="rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-accent/15 text-link flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-link font-semibold text-text-muted dark:text-text-muted">
                {t(language, 'email')}
              </div>
              <div className="text-link font-medium text-text dark:text-text truncate">
                {firebaseUser?.email}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowEmailForm((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-border dark:border-border hover:bg-main dark:hover:bg-main text-link font-semibold transition-colors"
          >
            {showEmailForm ? t(language, 'cancel') : t(language, 'changeEmail')}
          </button>
        </div>

        {showEmailForm && (
          <form
            onSubmit={handleUpdateEmail}
            className="p-4 rounded-xl bg-elevated dark:bg-elevated border border-border dark:border-border space-y-3"
          >
            <div>
              <label className="block text-link font-semibold mb-1">{t(language, 'newEmail')}</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
              />
            </div>
            {hasPasswordProvider && (
              <div>
                <label className="block text-link font-semibold mb-1">
                  {t(language, 'currentPassword')}
                </label>
                <input
                  type="password"
                  required
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={savingEmail}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold"
            >
              {savingEmail && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t(language, 'sendEmailVerification')}</span>
            </button>
          </form>
        )}

        <div className="border-accent border-border dark:border-border pt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 text-link flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <div className="text-link font-semibold text-text dark:text-text">
                {t(language, 'password')}
              </div>
              <div className="text-link text-text-muted dark:text-text-muted">
                {hasPasswordProvider
                  ? t(language, 'changePasswordDesc')
                  : t(language, 'oauthPasswordHint')}
              </div>
            </div>
          </div>
          {hasPasswordProvider && (
            <button
              type="button"
              onClick={() => setShowPasswordForm((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-border dark:border-border hover:bg-main dark:hover:bg-main text-link font-semibold transition-colors"
            >
              {showPasswordForm ? t(language, 'cancel') : t(language, 'changePassword')}
            </button>
          )}
        </div>

        {showPasswordForm && hasPasswordProvider && (
          <form
            onSubmit={handleChangePassword}
            className="p-4 rounded-xl bg-elevated dark:bg-elevated border border-border dark:border-border space-y-3"
          >
            <div>
              <label className="block text-link font-semibold mb-1">
                {t(language, 'currentPassword')}
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-link font-semibold mb-1">
                  {t(language, 'newPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
                />
              </div>
              <div>
                <label className="block text-link font-semibold mb-1">
                  {t(language, 'confirmPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold"
            >
              {savingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t(language, 'updatePasswordAction')}</span>
            </button>
          </form>
        )}
      </div>

      {/* Two-Factor Authentication (TOTP MFA via Firebase) */}
      <div className="rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-success/15 text-success dark:text-success flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-link font-bold text-text dark:text-text">
                  {t(language, 'twoFactorAuth')}
                </h3>
                {mfaFactors.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-success/15 text-success dark:text-success text-[10px] font-bold">
                    {t(language, 'enabledLabel')}
                  </span>
                )}
              </div>
              <p className="text-link text-text-muted dark:text-text-muted mt-0.5">
                {t(language, 'twoFactorDesc')}
              </p>
            </div>
          </div>
        </div>

        {mfaNotSupportedNotice && (
          <div className="p-3 rounded-xl bg-warning/10 border border-warning text-link text-warning dark:text-warning">
            {t(language, 'mfaNotEnabledProject')}
          </div>
        )}

        {mfaFactors.length > 0 ? (
          <div className="space-y-2.5">
            {mfaFactors.map((f) => (
              <div
                key={f.uid}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-elevated dark:bg-elevated border border-border dark:border-border"
              >
                <div>
                  <div className="text-link font-semibold text-text dark:text-text">
                    {f.displayName || 'Authenticator App'}
                  </div>
                  <div className="text-[11px] text-text-muted dark:text-text-muted">
                    TOTP · {f.uid.slice(0, 8)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={mfaBusy}
                  onClick={() => void handleUnenrollMfa(f.uid)}
                  className="px-3 py-1.5 rounded-lg bg-danger/10 text-danger dark:text-danger hover:bg-danger hover:text-text text-link font-semibold transition-colors"
                >
                  {t(language, 'disableTwoFactor')}
                </button>
              </div>
            ))}
          </div>
        ) : !mfaSetup ? (
          <div className="flex flex-wrap items-center gap-2">
            {hasPasswordProvider && (
              <input
                type="password"
                value={mfaReauthPassword}
                onChange={(e) => setMfaReauthPassword(e.target.value)}
                placeholder={t(language, 'currentPassword')}
                className="px-3 py-1.5 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
              />
            )}
            <button
              type="button"
              disabled={mfaBusy}
              onClick={() => void handleStartMfa()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold transition-colors"
            >
              {mfaBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t(language, 'enableTwoFactor')}</span>
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleVerifyMfa}
            className="p-4 rounded-xl bg-elevated dark:bg-elevated border border-border dark:border-border space-y-3"
          >
            <div className="text-link text-text dark:text-text">
              {t(language, 'mfaSetupInstructions')}
            </div>
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-elevated dark:bg-elevated border border-border dark:border-border">
              <code className="text-link font-mono text-link flex-1 break-all">
                {mfaSetup.secretKey}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(mfaSetup.secretKey);
                  pushToast({ type: 'info', title: t(language, 'copied') });
                }}
                className="px-2.5 py-1 rounded-md bg-main dark:bg-main text-link font-medium inline-flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t(language, 'copy')}</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={mfaSetup.qrUrl}
                className="text-link text-link hover:underline font-medium"
              >
                {t(language, 'openInAuthenticator')}
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="123456"
                className="w-36 px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link font-mono tracking-widest"
              />
              <button
                type="submit"
                disabled={mfaBusy}
                className="px-4 py-2 rounded-lg bg-success hover:bg-success text-text text-link font-semibold"
              >
                {t(language, 'verifyAndEnable')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaSetup(null);
                  setMfaCode('');
                }}
                className="px-3 py-2 rounded-lg text-link text-text-muted hover:text-text dark:hover:text-text"
              >
                {t(language, 'cancel')}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Danger Zone: Delete Account */}
      <div className="rounded-2xl border border-danger bg-danger/5 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <h3 className="text-link font-bold text-danger dark:text-danger">
                {t(language, 'deleteAccount')}
              </h3>
              <p className="text-link text-text dark:text-text mt-0.5">
                {t(language, 'deleteAccountDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-danger hover:bg-danger text-text text-link font-semibold transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t(language, 'deleteAccount')}</span>
          </button>
        </div>

        {showDeleteConfirm && (
          <form
            onSubmit={handleDeleteAccount}
            className="mt-3 p-4 rounded-xl bg-elevated dark:bg-elevated border border-danger space-y-3"
          >
            <p className="text-link font-medium text-text dark:text-text">
              {t(language, 'deleteAccountTypeUsername')}:{' '}
              <span className="font-mono font-bold text-danger">
                {publicUser?.username || fallbackUsername}
              </span>
            </p>
            <input
              type="text"
              required
              value={deleteUsernameConfirm}
              onChange={(e) => setDeleteUsernameConfirm(e.target.value)}
              placeholder={publicUser?.username || fallbackUsername}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link"
            />
            {hasPasswordProvider && (
              <input
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={t(language, 'currentPassword')}
                className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text text-link"
              />
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={deletingAccount}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger hover:bg-danger disabled:opacity-50 text-text text-link font-semibold"
              >
                {deletingAccount && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t(language, 'confirmPermanentDelete')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-2 rounded-lg text-link text-text-muted hover:text-text dark:hover:text-text"
              >
                {t(language, 'cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
