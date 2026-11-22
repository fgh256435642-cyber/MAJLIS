import React, { useState, useEffect } from 'react';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  Globe,
  LogOut,
  MailCheck,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  MessageSquare,
  Headphones,
  Users,
  Lock,
  Mail,
  User as UserIcon,
  ContactRound,
  Sparkles,
  ArrowRight,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n/translations';
import { auth, googleProvider } from '../services/firebase';
import { checkUsernameAvailability } from '../services/majlisService';
import { isValidUsername, LIMITS, sanitizeText } from '../utils/validation';
import { MajlisLogo } from './MajlisLogo';
import { MajlisTooltip } from './ui/MajlisUI';

function getUsernameSuggestions(displayName: string, email: string): string[] {
  const normalize = (value: string) => value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, LIMITS.USERNAME_MAX);
  const base = normalize(displayName) || normalize(email.trim().split('@')[0] || '');
  if (!base) return [];

  const suggestions: string[] = [];
  if (isValidUsername(base)) suggestions.push(base);
  for (let suffix = 1; suggestions.length < 4; suffix += 1) {
    const suffixText = String(suffix);
    const candidate = `${base.slice(0, LIMITS.USERNAME_MAX - suffixText.length)}${suffixText}`;
    if (isValidUsername(candidate) && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
    }
  }
  return suggestions;
}

export function AuthScreen() {
  const {
    firebaseUser,
    needsVerification,
    language,
    appearanceMode,
    setLocalAppearanceMode,
    setLocalLanguage,
    refreshVerification,
    logout,
  } = useAuth();
  const { pushToast } = useToast();

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('majlis_remember_me', 'true');
    }
    return true;
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shaking, setShaking] = useState(false);

  // Username availability state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [usernameSuggestionStatus, setUsernameSuggestionStatus] = useState<'idle' | 'checking' | 'available' | 'none' | 'error'>('idle');


  // Trigger card shake on error
  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 450);
  };

  // Debounced username availability check
  useEffect(() => {
    if (mode !== 'signup' || !username.trim()) {
      setUsernameStatus('idle');
      return;
    }
    const clean = username.trim().toLowerCase();
    if (!isValidUsername(clean)) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const result = await checkUsernameAvailability(clean);
        setUsernameStatus(result === 'available' ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [username, mode]);

  useEffect(() => {
    if (mode !== 'signup') {
      setUsernameSuggestions([]);
      setUsernameSuggestionStatus('idle');
      return;
    }

    const candidates = getUsernameSuggestions(displayName, email);
    if (!candidates.length) {
      setUsernameSuggestions([]);
      setUsernameSuggestionStatus('idle');
      return;
    }

    let cancelled = false;
    setUsernameSuggestions([]);
    setUsernameSuggestionStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const results = await Promise.all(
          candidates.map(async (candidate) => ({
            candidate,
            availability: await checkUsernameAvailability(candidate),
          }))
        );
        if (cancelled) return;

        const available = results
          .filter((result) => result.availability === 'available')
          .map((result) => result.candidate)
          .slice(0, 3);
        setUsernameSuggestions(available);
        if (available.length) {
          setUsernameSuggestionStatus('available');
        } else if (results.some((result) => result.availability === 'unknown')) {
          setUsernameSuggestionStatus('error');
        } else {
          setUsernameSuggestionStatus('none');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Unable to check username suggestions.', error);
        setUsernameSuggestionStatus('error');
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [displayName, email, mode]);

  // Real-time form validation for email and password as user types
  useEffect(() => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      
      // Email validation
      if (!email.trim()) {
        delete next.email;
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          next.email = language === 'ar' ? 'صيغة البريد الإلكتروني غير صحيحة.' : 'Please enter a valid email address.';
        } else {
          delete next.email;
        }
      }

      // Password validation
      if (!password) {
        delete next.password;
      } else if (mode === 'signup' && password.length < 6) {
        next.password = language === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' : 'Password must be at least 6 characters.';
      } else {
        delete next.password;
      }

      return next;
    });
  }, [email, password, mode, language]);

  // Password strength calculation
  const getPasswordStrength = (pass: string): { score: number; labelKey: 'strengthWeak' | 'strengthMedium' | 'strengthStrong'; colorClass: string } => {
    if (!pass) return { score: 0, labelKey: 'strengthWeak', colorClass: 'bg-hover dark:bg-hover' };
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass) && /[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 1) return { score: 1, labelKey: 'strengthWeak', colorClass: 'bg-danger' };
    if (score === 2 || score === 3) return { score: 2, labelKey: 'strengthMedium', colorClass: 'bg-warning' };
    return { score: 3, labelKey: 'strengthStrong', colorClass: 'bg-success' };
  };

  const pwdStrength = getPasswordStrength(password);

  const applySessionPersistence = async () => {
    localStorage.setItem('majlis_remember_me', 'true');
    await setPersistence(auth, browserLocalPersistence);
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await applySessionPersistence();
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(t(language, 'authProviderDisabled'));
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorMsg(t(language, 'authPopupClosed'));
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(t(language, 'authPopupBlocked'));
      } else {
        const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
        setErrorMsg(msg);
      }
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg(language === 'ar' ? 'يرجى إدخال بريد إلكتروني صحيح.' : 'Please enter a valid email address.');
      triggerShake();
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      pushToast({
        type: 'success',
        title: t(language, 'passwordResetSent'),
        description: email.trim(),
      });
      setMode('login');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send reset email.');
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!email.trim() || !email.includes('@')) {
      errors.email = language === 'ar' ? 'بريد إلكتروني غير صالح.' : 'Invalid email address.';
    }
    if (!password) {
      errors.password = language === 'ar' ? 'كلمة المرور مطلوبة.' : 'Password is required.';
    }

    if (mode === 'signup') {
      const cleanUser = username.trim();
      if (!isValidUsername(cleanUser)) {
        errors.username = language === 'ar'
          ? 'اسم المستخدم يجب أن يكون 2-32 حرفاً (أحرف، أرقام، _، .، -).'
          : 'Username must be 2–32 chars using letters, numbers, _, ., or -.';
      }
      if (password.length < 6) {
        errors.password = language === 'ar' ? 'كلمة المرور قصيرة جداً (6 أحرف على الأقل).' : 'Password must be at least 6 characters.';
      }
      if (usernameStatus === 'taken') {
        errors.username = t(language, 'usernameTaken');
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErrorMsg(language === 'ar' ? 'يرجى تصحيح الأخطاء في النموذج.' : 'Please fix the errors in the form.');
      triggerShake();
      return;
    }

    if (mode === 'signup') {
      const cleanUser = username.trim();
      const cleanDisplay = sanitizeText(displayName || cleanUser, LIMITS.DISPLAY_NAME_MAX);
      setSubmitting(true);
      try {
        await applySessionPersistence();
        sessionStorage.setItem('majlis_pending_username', cleanUser);
        sessionStorage.setItem('majlis_pending_display', cleanDisplay);
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: cleanDisplay });
        await sendEmailVerification(cred.user);
        pushToast({
          type: 'info',
          title: t(language, 'verifyEmailTitle'),
          description: t(language, 'verifyEmailBody'),
        });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed') {
          setErrorMsg(
            language === 'ar'
              ? 'تسجيل البريد غير مفعل في Firebase Console. يرجى تفعيله أو استخدام Google.'
              : 'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password provider or use Google.'
          );
        } else if (code === 'auth/email-already-in-use') {
          setErrorMsg(language === 'ar' ? 'البريد الإلكتروني مستخدم بالفعل.' : 'Email is already in use.');
        } else {
          setErrorMsg(err instanceof Error ? err.message : 'Sign-up failed.');
        }
        triggerShake();
      } finally {
        setSubmitting(false);
      }
    } else {
      setSubmitting(true);
      try {
        await applySessionPersistence();
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed') {
          setErrorMsg(
            language === 'ar'
              ? 'تسجيل البريد غير مفعل في Firebase. تفقّد إعدادات المشروع.'
              : 'Email/Password sign-in is disabled in Firebase Console.'
          );
        } else {
          setErrorMsg(language === 'ar' ? 'البريد أو كلمة المرور غير صحيحة.' : 'Invalid email or password.');
        }
        triggerShake();
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleResendVerification = async () => {
    if (!firebaseUser) return;
    if (!firebaseUser.email) {
      pushToast({
        type: 'info',
        title: language === 'ar' ? 'لا يوجد بريد إلكتروني مرتبط' : 'No email address associated',
        description:
          language === 'ar'
            ? 'يرجى التأكد من مشاركة بريدك الإلكتروني في إعدادات حسابك أو تسجيل الدخول بالبريد.'
            : 'Please ensure an email address is shared on your account or sign in with email.',
      });
      return;
    }
    setSubmitting(true);
    try {
      await sendEmailVerification(firebaseUser);
      pushToast({ type: 'success', title: language === 'ar' ? 'تم إرسال رابط التحقق!' : 'Verification email sent!' });
    } catch (err) {
      pushToast({
        type: 'error',
        title: language === 'ar' ? 'تعذر إعادة الإرسال' : 'Could not resend email',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerification = async () => {
    setSubmitting(true);
    try {
      const ok = await refreshVerification();
      if (!ok) {
        pushToast({
          type: 'info',
          title: language === 'ar' ? 'لم يتم التأكيد بعد' : 'Not verified yet',
          description: language === 'ar' ? 'يرجى النقر على الرابط في بريدك، ثم المحاولة مجدداً.' : 'Please click the link in your email inbox, then try again.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col justify-between items-center relative majlis-auth-bg text-text dark:text-text px-0 py-0 overflow-hidden selection:bg-accent/30">
      {/* Background Container (absolute inset-0 overflow-hidden pointer-events-none) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 majlis-auth-noise" />
        <div className="majlis-auth-orb majlis-auth-orb-1" />
        <div className="majlis-auth-orb majlis-auth-orb-2" />
        <div className="majlis-auth-orb majlis-auth-orb-3" />
        <span className="majlis-auth-particle majlis-auth-particle-1 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-2 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-3 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-4 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-5 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-6 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-7 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-8 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-9 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-10 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-11 bg-accent/60" />
        <span className="majlis-auth-particle majlis-auth-particle-12 bg-accent/60" />
      </div>

      {/* Top Utility Bar (Full width, 16px/24px padding) */}
      <header className="w-full px-4 sm:px-6 shrink-0 flex items-center justify-between h-[52px] z-10">
        <div className="flex items-center gap-2">
          <MajlisLogo language={language} size="lg" showSubtitle />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1" role="group" aria-label={t(language, 'themeLabel')}>
            <button
              type="button"
              aria-label={t(language, 'dayMode')}
              aria-pressed={appearanceMode === 'light'}
              onClick={() => setLocalAppearanceMode('light')}
              className={`w-9 h-9 inline-flex items-center justify-center rounded-xl border transition-colors focus-visible:outline-accent focus-visible:ring-2 focus-visible:ring-accent ${
                appearanceMode === 'light'
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-border bg-elevated text-text-muted hover:bg-hover'
              }`}
            >
              <Sun className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t(language, 'nightMode')}
              aria-pressed={appearanceMode === 'dark'}
              onClick={() => setLocalAppearanceMode('dark')}
              className={`w-9 h-9 inline-flex items-center justify-center rounded-xl border transition-colors focus-visible:outline-accent focus-visible:ring-2 focus-visible:ring-accent ${
                appearanceMode === 'dark'
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-border bg-elevated text-text-muted hover:bg-hover'
              }`}
            >
              <Moon className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <MajlisTooltip content={t(language, 'switchLanguage')} side="bottom">
            <button
              type="button"
              onClick={() => setLocalLanguage(language === 'en' ? 'ar' : 'en')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl majlis-glass-control text-link font-semibold hover:bg-text/15 dark:hover:bg-text/15 transition-all shadow-sm text-text dark:text-text cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-link dark:text-link" />
              <span>{language === 'en' ? 'العربية' : 'English'}</span>
            </button>
          </MajlisTooltip>
        </div>
      </header>

      {/* Centered Auth Card Container */}
      <main className="flex-1 min-h-0 flex flex-col items-center w-full max-w-[352px] mx-auto px-4 z-10 py-2 overflow-y-auto overflow-x-hidden">
        <div
          className={`majlis-glass-card my-auto w-full shrink-0 p-3 space-y-2 transition-transform ${shaking ? 'majlis-shake' : ''}`}
        >
            {needsVerification && firebaseUser ? (
              <div className="relative z-10 mx-auto w-full space-y-4 py-1 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-accent-soft dark:bg-accent-soft text-link dark:text-link flex items-center justify-center ring-1 ring-accent dark:ring-accent shadow-sm">
                  <MailCheck className="w-7 h-7" />
                </div>
                <div className="space-y-2 px-1">
                  <h2 className="text-lg font-bold text-text dark:text-text">
                    {t(language, 'verifyEmailTitle')}
                  </h2>
                  <p className="mx-auto max-w-[32ch] text-sm text-text dark:text-text leading-relaxed break-words">
                    {t(language, 'verifyEmailBody')}
                  </p>
                  <p
                    dir={firebaseUser.email ? 'ltr' : language === 'ar' ? 'rtl' : 'ltr'}
                    className="mx-auto block max-w-full break-all rounded-lg border border-border bg-main px-3 py-2 font-mono text-xs text-link dark:border-border dark:bg-main dark:text-link"
                  >
                    {firebaseUser.email || (language === 'ar' ? 'لا يوجد بريد مرتبط بهذا الحساب' : 'No email linked to this account')}
                  </p>
                </div>
                <div className="space-y-2 pt-1.5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCheckVerification}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-sm text-accent-contrast font-semibold shadow-md transition-all disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
                    <span>{t(language, 'checkVerification')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleResendVerification}
                    className="w-full py-2.5 px-3 rounded-xl border border-border bg-elevated hover:bg-hover text-sm text-text font-semibold transition-all shadow-xs"
                  >
                    {t(language, 'resendVerification')}
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs text-text-muted dark:text-text-muted hover:text-text dark:hover:text-text transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t(language, 'signOut')}</span>
                  </button>
                </div>
              </div>
            ) : mode === 'forgot' ? (
              <form onSubmit={handleForgotPassword} className="relative z-10 space-y-5">
                <div className="text-link space-y-1.5 text-center">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-accent-soft dark:bg-accent-soft text-link dark:text-link flex items-center justify-center ring-1 ring-accent dark:ring-accent mb-2 shadow-xs">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h2 className="text-link font-bold text-text dark:text-text">{t(language, 'forgotPassword')}</h2>
                  <p className="text-link sm:text-[13px] text-text dark:text-text">
                    {t(language, 'forgotPasswordDesc')}
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-xl border border-danger bg-danger/10 p-3 text-danger flex items-start gap-2.5 backdrop-blur-md">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-danger dark:text-danger" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-link font-semibold text-text dark:text-text">
                    {t(language, 'email')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-text-muted dark:text-text-muted">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full ps-10 pe-3 py-2.5 rounded-xl border border-border dark:border-border bg-rail/[0.045] focus:bg-elevated dark:bg-rail dark:focus:bg-rail/70 text-link text-text dark:text-text placeholder:text-text-muted dark:placeholder:text-text-muted focus:outline-accent focus:ring-2 focus:ring-accent dark:focus:ring-accent transition-all shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-accent-contrast font-semibold shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{t(language, 'sendResetLink')}</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMsg(null);
                    }}
                    className="w-full py-2.5 text-link font-semibold text-link dark:text-link hover:text-link dark:hover:text-link transition-colors text-link underline-offset-4 hover:underline cursor-pointer"
                  >
                    {t(language, 'backToSignIn')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="relative z-10 space-y-3">
                {/* Card Header (single brand logo lives in top bar only) */}
                <div className="text-link space-y-0.5 text-center">
                  <h2 className="text-lg font-bold tracking-tight text-text dark:text-text">
                    {mode === 'login' ? t(language, 'signIn') : t(language, 'signUp')}
                  </h2>
                  <p className="text-xs text-text dark:text-text">
                    {mode === 'login' ? t(language, 'welcomeBackSubtitle') : t(language, 'createAccountSubtitle')}
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-xl border border-danger bg-danger/10 p-3 text-danger flex items-start gap-2.5 backdrop-blur-md">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-danger dark:text-danger" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Google OAuth Button */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogleSignIn}
                  className="w-full py-2 px-2.5 rounded-xl border border-border bg-elevated hover:bg-hover hover:-translate-y-0.5 transition-all shadow-xs text-xs text-text flex items-center justify-center gap-2 font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" viewBox="-0.5 -0.5 25 25" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                  )}
                  <span>{t(language, 'continueWithGoogle')}</span>
                </button>

                {/* OR Divider */}
                <div className="flex items-center gap-2" role="separator">
                  <div className="h-px flex-1 bg-hover/80 dark:bg-hover/80" />
                  <span className="text-xs font-semibold text-text dark:text-text select-none">
                    {t(language, 'orDivider')}
                  </span>
                  <div className="h-px flex-1 bg-hover/80 dark:bg-hover/80" />
                </div>

                {/* Email / Password Form */}
                <form onSubmit={handleEmailAuth} className="space-y-2">
                  {mode === 'signup' && (
                    <div className="space-y-1.5">
                      <div>
                        <label className="block text-xs font-semibold text-text dark:text-text mb-0.5">
                          {t(language, 'username')}
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-text-muted dark:text-text-muted">
                            <UserIcon className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            maxLength={32}
                            required
                            aria-invalid={Boolean(fieldErrors.username)}
                            className="w-full ps-10 pe-9 py-1.5 rounded-xl border border-border dark:border-border bg-rail/[0.045] focus:bg-elevated dark:bg-rail dark:focus:bg-rail/70 text-xs text-text dark:text-text placeholder:text-text-muted dark:placeholder:text-text-muted focus:outline-accent focus:ring-2 focus:ring-accent dark:focus:ring-accent transition-all shadow-xs"
                          />
                          <div className="absolute inset-y-0 end-0 pe-3 flex items-center pointer-events-none">
                            {usernameStatus === 'checking' && (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-link dark:text-link" />
                            )}
                            {usernameStatus === 'available' && (
                              <CheckCircle2 className="w-4 h-4 text-success dark:text-success" />
                            )}
                            {usernameStatus === 'taken' && (
                              <XCircle className="w-4 h-4 text-danger dark:text-danger" />
                            )}
                          </div>
                        </div>
                        {fieldErrors.username && (
                          <p className="mt-1 text-[11px] text-danger dark:text-danger flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{fieldErrors.username}</span>
                          </p>
                        )}
                        {usernameStatus === 'available' && !fieldErrors.username && (
                          <p className="mt-1 text-[11px] text-success dark:text-success flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t(language, 'usernameAvailable')}</span>
                          </p>
                        )}
                        {usernameStatus === 'taken' && (
                          <p className="mt-1 text-[11px] text-danger dark:text-danger flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            <span>{t(language, 'usernameTaken')}</span>
                          </p>
                        )}
                        {usernameSuggestionStatus !== 'idle' && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {usernameSuggestionStatus === 'checking' && (
                              <span className="text-[10px] text-text-muted dark:text-text-muted">
                                {t(language, 'checkingUsernameSuggestions')}
                              </span>
                            )}
                            {usernameSuggestionStatus === 'available' && (
                              <>
                                <span className="text-[10px] text-text-muted dark:text-text-muted">
                                  {t(language, 'usernameSuggestions')}
                                </span>
                                {usernameSuggestions
                                  .filter((suggestion) => suggestion !== username.trim().toLowerCase())
                                  .map((suggestion) => (
                                    <button
                                      key={suggestion}
                                      type="button"
                                      dir="ltr"
                                      onClick={() => {
                                        setUsername(suggestion);
                                        setErrorMsg(null);
                                        setFieldErrors((previous) => {
                                          const next = { ...previous };
                                          delete next.username;
                                          return next;
                                        });
                                      }}
                                      className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-link hover:bg-accent/20 focus-visible:outline-accent cursor-pointer"
                                    >
                                      @{suggestion}
                                    </button>
                                  ))}
                              </>
                            )}
                            {usernameSuggestionStatus === 'none' && (
                              <span className="text-[10px] text-text-muted dark:text-text-muted">
                                {t(language, 'usernameSuggestionsNone')}
                              </span>
                            )}
                            {usernameSuggestionStatus === 'error' && (
                              <span className="text-[10px] text-danger dark:text-danger">
                                {t(language, 'usernameSuggestionsError')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-text dark:text-text mb-0.5">
                          {t(language, 'displayName')}
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-text-muted dark:text-text-muted">
                            <ContactRound className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder=""
                            maxLength={64}
                            className="w-full ps-10 pe-3 py-1.5 rounded-xl border border-border dark:border-border bg-rail/[0.045] focus:bg-elevated dark:bg-rail dark:focus:bg-rail/70 text-xs text-text dark:text-text placeholder:text-text-muted dark:placeholder:text-text-muted focus:outline-accent focus:ring-2 focus:ring-accent dark:focus:ring-accent transition-all shadow-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-text dark:text-text mb-0.5">
                      {t(language, 'email')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-text-muted dark:text-text-muted">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        aria-invalid={Boolean(fieldErrors.email)}
                        className="w-full ps-10 pe-3 py-1.5 rounded-xl border border-border dark:border-border bg-rail/[0.045] focus:bg-elevated dark:bg-rail dark:focus:bg-rail/70 text-xs text-text dark:text-text placeholder:text-text-muted dark:placeholder:text-text-muted focus:outline-accent focus:ring-2 focus:ring-accent dark:focus:ring-accent transition-all shadow-xs"
                      />
                    </div>
                    {fieldErrors.email && (
                      <p className="mt-1 text-[11px] text-danger dark:text-danger flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>{fieldErrors.email}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-xs font-semibold text-text dark:text-text">
                        {t(language, 'password')}
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot');
                            setErrorMsg(null);
                          }}
                          className="text-xs text-link dark:text-link hover:text-link dark:hover:text-link font-semibold underline-offset-4 hover:underline transition-colors cursor-pointer"
                        >
                          {t(language, 'forgotPassword')}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-text-muted dark:text-text-muted">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={6}
                        required
                        aria-invalid={Boolean(fieldErrors.password)}
                        className="w-full ps-10 pe-10 py-1.5 rounded-xl border border-border dark:border-border bg-rail/[0.045] focus:bg-elevated dark:bg-rail dark:focus:bg-rail/70 text-xs text-text dark:text-text placeholder:text-text-muted dark:placeholder:text-text-muted focus:outline-accent focus:ring-2 focus:ring-accent dark:focus:ring-accent transition-all shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 end-0 pe-3 flex items-center text-text-muted dark:text-text-muted hover:text-text dark:hover:text-text transition-colors cursor-pointer"
                        aria-label={showPassword ? t(language, 'hidePasswordLabel') : t(language, 'showPasswordLabel')}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {mode === 'signup' && password.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="flex gap-1.5 h-1.5 w-full">
                          <div className={`flex-1 rounded-full transition-all ${pwdStrength.score >= 1 ? pwdStrength.colorClass : 'bg-hover dark:bg-hover'}`} />
                          <div className={`flex-1 rounded-full transition-all ${pwdStrength.score >= 2 ? pwdStrength.colorClass : 'bg-hover dark:bg-hover'}`} />
                          <div className={`flex-1 rounded-full transition-all ${pwdStrength.score >= 3 ? pwdStrength.colorClass : 'bg-hover dark:bg-hover'}`} />
                        </div>
                        <div className="flex justify-between items-center text-[11px] text-text dark:text-text">
                          <span>{t(language, 'passwordStrength')}:</span>
                          <span className="font-semibold">{t(language, pwdStrength.labelKey)}</span>
                        </div>
                      </div>
                    )}

                    {fieldErrors.password && (
                      <p className="mt-1 text-[11px] text-danger dark:text-danger flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>{fieldErrors.password}</span>
                      </p>
                    )}

                    {/* Keep the account signed in on this device. */}
                    <div className="pt-1">
                      <label className="inline-flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          readOnly
                          onChange={() => undefined}
                          className="w-4 h-4 rounded border-border bg-input text-text accent-accent"
                        />
                        <span className="text-[13px] sm:text-link font-medium text-text dark:text-text group-hover:text-text dark:group-hover:text-text transition-colors">
                          {t(language, 'rememberMe')}
                        </span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-xs text-accent-contrast font-semibold shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{mode === 'login' ? t(language, 'signIn') : t(language, 'signUp')}</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                  </button>
                </form>

                {/* Mode Switch */}
                <div className="text-text pt-1 text-center text-xs">
                  <div className="inline-flex flex-wrap items-center justify-center gap-1">
                    <span>{mode === 'login' ? t(language, 'needAccount') : t(language, 'forgotHint')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setMode(mode === 'login' ? 'signup' : 'login');
                        setErrorMsg(null);
                        setFieldErrors({});
                      }}
                      className="text-link dark:text-link hover:text-link dark:hover:text-link font-bold underline underline-offset-4 transition-colors focus:outline-accent cursor-pointer"
                    >
                      {mode === 'login' ? t(language, 'signUp') : t(language, 'signIn')}
                    </button>
                  </div>
                </div>
              </div>
            )}
        </div>
      </main>

    </div>
  );
}
