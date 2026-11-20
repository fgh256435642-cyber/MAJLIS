import React, { useState, useEffect } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
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
  Moon,
  RefreshCw,
  Sun,
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
  Sparkles,
  ArrowRight,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n/translations';
import { auth, googleProvider } from '../services/firebase';
import { checkUsernameAvailability } from '../services/nexusService';
import { isValidUsername, LIMITS, sanitizeText } from '../utils/validation';
import { MajlisLogo } from './NexusLogo';
import { NexusTooltip } from './ui/NexusUI';

export function AuthScreen() {
  const {
    firebaseUser,
    needsVerification,
    theme,
    language,
    setLocalTheme,
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
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('nexus_remember_me') !== 'false';
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shaking, setShaking] = useState(false);

  // Username availability state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  // Terms & Privacy modal state
  const [activeLegalModal, setActiveLegalModal] = useState<'terms' | 'privacy' | null>(null);

  const isDarkActive =
    theme === 'dark' ||
    theme === 'amoled' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

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
    if (!pass) return { score: 0, labelKey: 'strengthWeak', colorClass: 'bg-slate-300 dark:bg-zinc-700' };
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass) && /[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 1) return { score: 1, labelKey: 'strengthWeak', colorClass: 'bg-rose-500' };
    if (score === 2 || score === 3) return { score: 2, labelKey: 'strengthMedium', colorClass: 'bg-amber-500' };
    return { score: 3, labelKey: 'strengthStrong', colorClass: 'bg-emerald-500' };
  };

  const pwdStrength = getPasswordStrength(password);

  const applySessionPersistence = async () => {
    localStorage.setItem('nexus_remember_me', String(rememberMe));
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
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
        sessionStorage.setItem('nexus_pending_username', cleanUser);
        sessionStorage.setItem('nexus_pending_display', cleanDisplay);
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
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col justify-between items-center relative nexus-auth-bg text-slate-900 dark:text-[#F2F3F5] px-0 py-0 overflow-hidden selection:bg-nexus/30">
      {/* Background Container (absolute inset-0 overflow-hidden pointer-events-none) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 nexus-auth-noise" />
        <div className="nexus-auth-orb nexus-auth-orb-1" />
        <div className="nexus-auth-orb nexus-auth-orb-2" />
        <div className="nexus-auth-orb nexus-auth-orb-3" />
        <span className="nexus-auth-particle nexus-auth-particle-1 bg-violet-400/50" />
        <span className="nexus-auth-particle nexus-auth-particle-2 bg-sky-400/50" />
        <span className="nexus-auth-particle nexus-auth-particle-3 bg-indigo-300/40" />
        <span className="nexus-auth-particle nexus-auth-particle-4 bg-cyan-300/50" />
        <span className="nexus-auth-particle nexus-auth-particle-5 bg-purple-400/40" />
        <span className="nexus-auth-particle nexus-auth-particle-6 bg-blue-400/40" />
      </div>

      {/* Top Utility Bar (Full width, 16px/24px padding) */}
      <header className="w-full px-4 sm:px-6 shrink-0 flex items-center justify-between h-[52px] z-10">
        <div className="flex items-center gap-2">
          <MajlisLogo language={language} size="md" showSubtitle />
        </div>
        <div className="flex items-center gap-2">
          <NexusTooltip content={t(language, 'switchLanguage')} side="bottom">
            <button
              type="button"
              onClick={() => setLocalLanguage(language === 'en' ? 'ar' : 'en')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl nexus-glass-control text-xs font-semibold hover:bg-white/15 dark:hover:bg-white/12 transition-all shadow-sm text-slate-800 dark:text-white cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-500 dark:text-sky-300" />
              <span>{language === 'en' ? 'العربية' : 'English'}</span>
            </button>
          </NexusTooltip>
          <NexusTooltip
            content={isDarkActive ? t(language, 'switchToLight') : t(language, 'switchToDark')}
            side="bottom"
          >
            <button
              type="button"
              onClick={() => setLocalTheme(isDarkActive ? 'light' : 'dark')}
              className="p-2 rounded-xl nexus-glass-control hover:bg-white/15 dark:hover:bg-white/12 transition-all shadow-sm text-slate-800 dark:text-white cursor-pointer"
              aria-label={isDarkActive ? t(language, 'switchToLight') : t(language, 'switchToDark')}
            >
              {isDarkActive ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
            </button>
          </NexusTooltip>
        </div>
      </header>

      {/* Centered Auth Card Container (max-width: 380px, padding: 20px, space-y-[10px]) */}
      <main className="flex-1 flex items-center justify-center w-full max-w-[380px] mx-auto z-10 my-auto py-1">
        <div
          className={`nexus-glass-card w-full p-[20px] space-y-[10px] [@media(max-height:740px)]:scale-[0.9] origin-center transition-transform ${shaking ? 'nexus-shake' : ''}`}
        >
            {needsVerification && firebaseUser ? (
              <div className="relative z-10 space-y-5 text-center py-2">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center ring-1 ring-indigo-200 dark:ring-white/20 shadow-sm">
                  <MailCheck className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t(language, 'verifyEmailTitle')}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {t(language, 'verifyEmailBody')}
                  </p>
                  <p className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-black/20 text-indigo-700 dark:text-indigo-200 inline-block border border-slate-200 dark:border-white/10">
                    {firebaseUser.email || (language === 'ar' ? 'لا يوجد بريد مرتبط بهذا الحساب' : 'No email linked to this account')}
                  </p>
                </div>
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCheckVerification}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold shadow-md shadow-indigo-500/25 transition-all disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
                    <span>{t(language, 'checkVerification')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleResendVerification}
                    className="w-full py-3 px-4 rounded-xl border border-slate-300 dark:border-white/10 bg-white/90 dark:bg-white/10 hover:bg-slate-50 dark:hover:bg-white/15 text-sm font-semibold transition-all text-slate-800 dark:text-slate-200 shadow-xs"
                  >
                    {t(language, 'resendVerification')}
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t(language, 'signOut')}</span>
                  </button>
                </div>
              </div>
            ) : mode === 'forgot' ? (
              <form onSubmit={handleForgotPassword} className="relative z-10 space-y-5">
                <div className="text-center space-y-1.5">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-sky-300 flex items-center justify-center ring-1 ring-indigo-200 dark:ring-white/20 mb-2 shadow-xs">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t(language, 'forgotPassword')}</h2>
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-200/85">
                    {t(language, 'forgotPasswordDesc')}
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 p-3 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2.5 backdrop-blur-md">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-100">
                    {t(language, 'email')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-slate-500 dark:text-slate-300">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full ps-10 pe-3 py-2.5 rounded-xl border border-slate-300/90 dark:border-white/20 bg-slate-900/[0.045] focus:bg-white dark:bg-slate-950/50 dark:focus:bg-slate-950/70 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-300/80 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-sky-400 transition-all shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold shadow-md shadow-indigo-500/25 transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
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
                    className="w-full py-2.5 text-sm font-semibold text-indigo-700 dark:text-sky-300 hover:text-indigo-800 dark:hover:text-sky-200 transition-colors text-center underline-offset-4 hover:underline cursor-pointer"
                  >
                    {t(language, 'backToSignIn')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="relative z-10 space-y-5">
                {/* Card Header (single brand logo lives in top bar only) */}
                <div className="text-center space-y-1.5">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {mode === 'login' ? t(language, 'signIn') : t(language, 'signUp')}
                  </h2>
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-200/85">
                    {mode === 'login' ? t(language, 'welcomeBackSubtitle') : t(language, 'createAccountSubtitle')}
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 p-3 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2.5 backdrop-blur-md">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Google OAuth Button */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-4 rounded-xl border border-slate-300/90 dark:border-white/20 bg-white/85 dark:bg-white/10 hover:bg-white dark:hover:bg-white/18 hover:-translate-y-0.5 transition-all shadow-xs text-slate-800 dark:text-white flex items-center justify-center gap-2.5 text-sm font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <svg className="w-5 h-5 shrink-0" viewBox="-0.5 -0.5 25 25" aria-hidden="true">
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
                <div className="flex items-center gap-3" role="separator">
                  <div className="h-px flex-1 bg-slate-300/80 dark:bg-white/20" />
                  <span className="text-xs sm:text-[13px] font-semibold text-slate-600 dark:text-slate-200 select-none">
                    {t(language, 'orDivider')}
                  </span>
                  <div className="h-px flex-1 bg-slate-300/80 dark:bg-white/20" />
                </div>

                {/* Email / Password Form */}
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {mode === 'signup' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-100 mb-1.5">
                          {t(language, 'username')}
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-slate-500 dark:text-slate-300">
                            <UserIcon className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="alex_dev"
                            maxLength={32}
                            required
                            aria-invalid={Boolean(fieldErrors.username)}
                            className="w-full ps-10 pe-9 py-2.5 rounded-xl border border-slate-300/90 dark:border-white/20 bg-slate-900/[0.045] focus:bg-white dark:bg-slate-950/50 dark:focus:bg-slate-950/70 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-300/80 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-sky-400 transition-all shadow-xs"
                          />
                          <div className="absolute inset-y-0 end-0 pe-3 flex items-center pointer-events-none">
                            {usernameStatus === 'checking' && (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-sky-300" />
                            )}
                            {usernameStatus === 'available' && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            )}
                            {usernameStatus === 'taken' && (
                              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                            )}
                          </div>
                        </div>
                        {fieldErrors.username && (
                          <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{fieldErrors.username}</span>
                          </p>
                        )}
                        {usernameStatus === 'available' && !fieldErrors.username && (
                          <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t(language, 'usernameAvailable')}</span>
                          </p>
                        )}
                        {usernameStatus === 'taken' && (
                          <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            <span>{t(language, 'usernameTaken')}</span>
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-100 mb-1.5">
                          {t(language, 'displayName')}
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Alex"
                          maxLength={64}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300/90 dark:border-white/20 bg-slate-900/[0.045] focus:bg-white dark:bg-slate-950/50 dark:focus:bg-slate-950/70 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-300/80 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-sky-400 transition-all shadow-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-100 mb-1.5">
                      {t(language, 'email')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-slate-500 dark:text-slate-300">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        aria-invalid={Boolean(fieldErrors.email)}
                        className="w-full ps-10 pe-3 py-2.5 rounded-xl border border-slate-300/90 dark:border-white/20 bg-slate-900/[0.045] focus:bg-white dark:bg-slate-950/50 dark:focus:bg-slate-950/70 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-300/80 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-sky-400 transition-all shadow-xs"
                      />
                    </div>
                    {fieldErrors.email && (
                      <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>{fieldErrors.email}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-100">
                        {t(language, 'password')}
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot');
                            setErrorMsg(null);
                          }}
                          className="text-[13px] sm:text-sm text-indigo-700 dark:text-sky-300 hover:text-indigo-800 dark:hover:text-sky-200 font-semibold underline-offset-4 hover:underline transition-colors cursor-pointer"
                        >
                          {t(language, 'forgotPassword')}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-slate-500 dark:text-slate-300">
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
                        className="w-full ps-10 pe-10 py-2.5 rounded-xl border border-slate-300/90 dark:border-white/20 bg-slate-900/[0.045] focus:bg-white dark:bg-slate-950/50 dark:focus:bg-slate-950/70 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-300/80 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-sky-400 transition-all shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                        aria-label={showPassword ? t(language, 'hidePasswordLabel') : t(language, 'showPasswordLabel')}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {mode === 'signup' && password.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="flex gap-1.5 h-1.5 w-full">
                          <div className={`flex-1 rounded-full transition-all ${pwdStrength.score >= 1 ? pwdStrength.colorClass : 'bg-slate-200 dark:bg-white/10'}`} />
                          <div className={`flex-1 rounded-full transition-all ${pwdStrength.score >= 2 ? pwdStrength.colorClass : 'bg-slate-200 dark:bg-white/10'}`} />
                          <div className={`flex-1 rounded-full transition-all ${pwdStrength.score >= 3 ? pwdStrength.colorClass : 'bg-slate-200 dark:bg-white/10'}`} />
                        </div>
                        <div className="flex justify-between items-center text-[11px] text-slate-600 dark:text-slate-300">
                          <span>{t(language, 'passwordStrength')}:</span>
                          <span className="font-semibold">{t(language, pwdStrength.labelKey)}</span>
                        </div>
                      </div>
                    )}

                    {fieldErrors.password && (
                      <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>{fieldErrors.password}</span>
                      </p>
                    )}

                    {/* Remember Me Checkbox (controls Firebase auth persistence) */}
                    <div className="pt-2.5">
                      <label className="inline-flex items-center gap-2.5 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setRememberMe(next);
                            localStorage.setItem('nexus_remember_me', String(next));
                          }}
                          className="w-4 h-4 rounded border-slate-400 dark:border-white/30 bg-white/80 dark:bg-slate-950/60 text-indigo-600 dark:text-sky-400 accent-indigo-600 dark:accent-sky-400 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-sky-400 cursor-pointer"
                        />
                        <span className="text-[13px] sm:text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {t(language, 'rememberMe')}
                        </span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold shadow-md shadow-indigo-500/25 transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{mode === 'login' ? t(language, 'signIn') : t(language, 'signUp')}</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                  </button>
                </form>

                {/* Mode Switch */}
                <div className="text-center text-sm text-slate-700 dark:text-slate-200 pt-1 bg-transparent border-0 shadow-none">
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === 'login' ? 'signup' : 'login');
                      setErrorMsg(null);
                      setFieldErrors({});
                    }}
                    className="inline-flex flex-wrap items-center justify-center gap-1.5 bg-transparent border-0 p-0 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition-colors font-medium focus:outline-none cursor-pointer"
                  >
                    <span>{mode === 'login' ? t(language, 'needAccount') : t(language, 'forgotHint')}</span>
                    <span className="text-indigo-700 dark:text-sky-300 hover:text-indigo-800 dark:hover:text-sky-200 font-bold underline underline-offset-4 transition-colors">
                      {mode === 'login' ? t(language, 'signUp') : t(language, 'signIn')}
                    </span>
                  </button>
                </div>
              </div>
            )}
        </div>
      </main>

      {/* Footer (Static flow, 11px text size, no absolute) */}
      <footer className="w-full px-4 sm:px-6 shrink-0 flex flex-col items-center justify-center text-center gap-1 py-2 text-[11px] text-slate-600 dark:text-slate-300/90 z-10">
        <p className="font-medium text-slate-700 dark:text-slate-200/90">
          {t(language, 'allRightsReserved')}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveLegalModal('terms')}
            className="text-slate-700 dark:text-sky-200/90 hover:text-slate-900 dark:hover:text-white transition-colors underline underline-offset-4 cursor-pointer"
          >
            {t(language, 'termsOfService')}
          </button>
          <span aria-hidden="true">•</span>
          <button
            type="button"
            onClick={() => setActiveLegalModal('privacy')}
            className="text-slate-700 dark:text-sky-200/90 hover:text-slate-900 dark:hover:text-white transition-colors underline underline-offset-4 cursor-pointer"
          >
            {t(language, 'privacyPolicy')}
          </button>
        </div>
      </footer>

      {/* Terms & Privacy Modal */}
      {activeLegalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="max-w-lg w-full p-6 sm:p-7 space-y-5 rounded-2xl bg-white dark:bg-[#1e1f24] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setActiveLegalModal(null)}
              className="absolute top-5 end-5 p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/10 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {activeLegalModal === 'terms' ? t(language, 'termsOfService') : t(language, 'privacyPolicy')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">MAJLIS Security & Compliance</p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-h-72 overflow-y-auto pe-2 leading-relaxed">
              {activeLegalModal === 'terms' ? (
                <>
                  <p>
                    {language === 'ar'
                      ? 'مرحباً بك في منصة مجلس (MAJLIS). باستخدامك لهذا التطبيق، فإنك توافق على الالتزام بشروط الاستخدام وسياسات الحفاظ على الأمان.'
                      : 'Welcome to MAJLIS. By using this application, you agree to abide by our terms of service and security policies.'}
                  </p>
                  <p>
                    {language === 'ar'
                      ? 'يحظر نشر محتوى ضار، مسيء، أو مخالف للأنظمة والقوانين المعمول بها. يحق لإدارة المنصة تعليق الحسابات المخالفة.'
                      : 'Publishing harmful, abusive, or unlawful content is strictly prohibited. Management reserves the right to suspend violating accounts.'}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {language === 'ar'
                      ? 'نحن نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية ومحادثاتك المشفرة.'
                      : 'We respect your privacy and are committed to protecting your personal data and encrypted conversations.'}
                  </p>
                  <p>
                    {language === 'ar'
                      ? 'يتم تخزين بيانات الملف الشخصي والمراسلات بأمان عبر قواعد بيانات Firebase المشفرة، ولا يتم مشاركة أي بيانات مع أطراف ثالثة.'
                      : 'Profile data and messages are stored securely via encrypted Firebase databases and never shared with third parties.'}
                  </p>
                </>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveLegalModal(null)}
                className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-md transition-all"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
