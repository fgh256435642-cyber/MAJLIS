import { useEffect, useState } from 'react';
import type { UserStatus } from '../types/nexus';
import { getStatusDotClass } from '../utils/validation';

export function MajlisBrandIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="majlis-head-grad" x1="13" y1="8" x2="54" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="0.45" stopColor="#7456E8" />
          <stop offset="1" stopColor="#30266B" />
        </linearGradient>
        <linearGradient id="majlis-headband-grad" x1="8" y1="22" x2="56" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C4B5FD" />
          <stop offset="0.5" stopColor="#7C6BE7" />
          <stop offset="1" stopColor="#4C3AA7" />
        </linearGradient>
      </defs>
      <path
        d="M17 34C17 19.7 23.7 10 32 10C40.3 10 47 19.7 47 34C47 44.5 40.7 51 32 51C23.3 51 17 44.5 17 34Z"
        fill="url(#majlis-head-grad)"
        stroke="#261E61"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M17 31C17 18.9 23.2 8 32 8C40.8 8 47 18.9 47 31" stroke="url(#majlis-headband-grad)" strokeWidth="5" strokeLinecap="round" />
      <rect x="9" y="27" width="11" height="17" rx="5.5" fill="#5141A8" stroke="#2D246B" strokeWidth="2" />
      <rect x="44" y="27" width="11" height="17" rx="5.5" fill="#5141A8" stroke="#2D246B" strokeWidth="2" />
      <path d="M49.5 43C45.5 48 41.5 50.5 37 51.5" stroke="#5141A8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function MajlisLogo({
  language = 'ar',
  className = '',
  size = 'md',
  showSubtitle = false,
}: {
  language?: 'ar' | 'en';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}) {
  const iconClass =
    size === 'lg'
      ? 'w-11 h-11 sm:w-12 sm:h-12'
      : size === 'sm'
      ? 'w-6 h-6'
      : 'w-8 h-8';

  return (
    <div className={`inline-flex items-center gap-3.5 select-none ${className}`}>
      <MajlisBrandIcon className={`${iconClass} shrink-0`} />
      {showSubtitle ? (
        <div className="flex flex-col items-start text-start leading-none justify-center">
          <span className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900 dark:text-white">
            مجلس
          </span>
          <span
            dir="ltr"
            className="text-[11px] sm:text-xs font-bold tracking-[0.3em] text-indigo-600 dark:text-sky-300 mt-1.5 uppercase"
          >
            MAJLIS
          </span>
        </div>
      ) : (
        <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
          {language === 'ar' ? 'مجلس' : 'MAJLIS'}
        </span>
      )}
    </div>
  );
}

// Keep backward-compatible alias for NexusBrandIcon so any leftover imports don't break
export function NexusBrandIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return <MajlisBrandIcon className={className} />;
}

const AVATAR_PALETTES = [
  'bg-gradient-to-br from-indigo-500 to-violet-600',
  'bg-gradient-to-br from-emerald-500 to-teal-600',
  'bg-gradient-to-br from-amber-500 to-orange-600',
  'bg-gradient-to-br from-rose-500 to-pink-600',
  'bg-gradient-to-br from-sky-500 to-blue-600',
  'bg-gradient-to-br from-violet-500 to-purple-600',
];

function getPaletteForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

export function StatusIndicator({
  status,
  className = 'w-2.5 h-2.5',
}: {
  status: UserStatus;
  className?: string;
}) {
  if (status === 'idle') {
    return (
      <span
        aria-hidden="true"
        className={`relative inline-flex items-center justify-center rounded-full ${getStatusDotClass(
          'idle'
        )} ${className}`}
      >
        <svg viewBox="0 0 12 12" className="w-[70%] h-[70%]" fill="none">
          <path
            d="M7.5 1.5A4.8 4.8 0 0 0 10.5 8.5A4.8 4.8 0 1 1 7.5 1.5Z"
            className="fill-white dark:fill-[#232428]"
          />
        </svg>
      </span>
    );
  }

  if (status === 'dnd') {
    return (
      <span
        aria-hidden="true"
        className={`relative inline-flex items-center justify-center rounded-full ${getStatusDotClass(
          'dnd'
        )} ${className}`}
      >
        <span className="w-[58%] h-[22%] rounded-full bg-white dark:bg-[#232428]" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full ${getStatusDotClass(status)} ${className}`}
    />
  );
}

export function UserAvatar({
  src,
  name,
  status,
  size = 'md',
  showStatus = false,
  speaking = false,
  className = '',
}: {
  src?: string;
  name: string;
  status?: UserStatus;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  speaking?: boolean;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const sizeClass = {
    xs: 'w-6 h-6 text-[11px]',
    sm: 'w-8 h-8 text-sm',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-20 h-20 text-3xl',
  }[size];

  const dotClass = {
    xs: 'w-2.5 h-2.5 border-[1.5px]',
    sm: 'w-3 h-3 border-2',
    md: 'w-3.5 h-3.5 border-2',
    lg: 'w-4 h-4 border-2',
    xl: 'w-5 h-5 border-[3px]',
  }[size];

  const firstChar = Array.from((name || 'N').trim())[0]?.toUpperCase() || 'N';

  return (
    <div
      className={`relative shrink-0 inline-flex items-center justify-center rounded-full nexus-avatar-shape select-none transition-all duration-150 ${
        speaking ? 'brightness-105' : ''
      }`}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${sizeClass} ${className} rounded-full nexus-avatar-shape object-cover bg-slate-200 dark:bg-[#1E1F22]`}
        />
      ) : (
        <div
          className={`${sizeClass} ${className} rounded-full nexus-avatar-shape ${getPaletteForName(
            name || 'Majlis'
          )} text-white font-bold flex items-center justify-center shadow-inner`}
        >
          {firstChar}
        </div>
      )}
      {showStatus && status && (
        <span
          className={`absolute -bottom-0.5 -end-0.5 ${dotClass} rounded-full border-white dark:border-[#232428] inline-flex items-center justify-center overflow-hidden ${getStatusDotClass(
            status
          )}`}
        >
          {status === 'idle' && (
            <span className="w-[46%] h-[46%] rounded-full bg-white dark:bg-[#232428] -translate-x-[18%] -translate-y-[18%]" />
          )}
          {status === 'dnd' && (
            <span className="w-[62%] h-[22%] rounded-full bg-white" />
          )}
        </span>
      )}
    </div>
  );
}

export function ServerIcon({
  src,
  name,
  size = 'md',
  rounded = 'rounded-2xl',
}: {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  rounded?: string;
}) {
  const [imgError, setImgError] = useState(false);

  const sizeClass = {
    sm: 'w-9 h-9 text-xs',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-xl',
  }[size];

  const initials = (name || 'S')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeClass} ${rounded} object-cover bg-slate-200 dark:bg-[#1E1F22] shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${rounded} bg-nexus text-white font-semibold flex items-center justify-center shrink-0 select-none shadow-inner`}
    >
      {initials}
    </div>
  );
}

export function GroupAvatar({
  src,
  name,
  size = 'sm',
  className = '',
}: {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const sizeClass = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-20 h-20 text-2xl',
  }[size];

  const iconSizeClass = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
    xl: 'w-9 h-9',
  }[size];

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeClass} ${className} rounded-full nexus-avatar-shape object-cover bg-slate-200 dark:bg-[#1E1F22] shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${className} rounded-full nexus-avatar-shape ${getPaletteForName(
        name || 'Group'
      )} text-white font-bold flex items-center justify-center shrink-0 shadow-inner select-none`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconSizeClass}
        aria-hidden="true"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </div>
  );
}
