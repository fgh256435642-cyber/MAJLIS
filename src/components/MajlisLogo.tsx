import { useEffect, useState } from 'react';
import type { UserStatus } from '../types/majlis';
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
      <circle cx="32" cy="32" r="18" fill="#F8FAFC" stroke="var(--accent)" strokeWidth="1.8" />
      <path d="M14 30V26C14 16.1 22.1 8 32 8C41.9 8 50 16.1 50 26V30" stroke="var(--accent)" strokeWidth="4.5" strokeLinecap="round" />
      <rect x="8.5" y="24" width="11" height="16" rx="5.5" fill="var(--accent)" stroke="var(--accent-contrast)" strokeWidth="2" />
      <rect x="44.5" y="24" width="11" height="16" rx="5.5" fill="var(--accent)" stroke="var(--accent-contrast)" strokeWidth="2" />
      <circle cx="26" cy="31" r="1.6" fill="#1F2937" />
      <circle cx="38" cy="31" r="1.6" fill="#1F2937" />
      <path d="M27.5 38C29.5 40 34.5 40 36.5 38" stroke="#1F2937" strokeWidth="1.8" strokeLinecap="round" />
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
        <div className="flex flex-col items-start text-link leading-none justify-center">
          <span className="text-2xl sm:text-[26px] font-black tracking-tight text-text dark:text-text">
            مجلس
          </span>
          <span
            dir="ltr"
            className="text-[11px] sm:text-link font-bold tracking-[0.3em] text-link dark:text-link mt-1.5 uppercase"
          >
            MAJLIS
          </span>
        </div>
      ) : (
        <span className="text-link font-extrabold tracking-tight text-text dark:text-text leading-none">
          {language === 'ar' ? 'مجلس' : 'MAJLIS'}
        </span>
      )}
    </div>
  );
}

const AVATAR_PALETTES = [
  'bg-gradient-to-br from-accent to-accent',
  'bg-gradient-to-br from-success to-success',
  'bg-gradient-to-br from-warning to-warning',
  'bg-gradient-to-br from-danger to-accent',
  'bg-gradient-to-br from-accent to-accent',
  'bg-gradient-to-br from-accent to-accent',
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
            className="fill-main"
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
        <span className="w-[58%] h-[22%] rounded-full bg-elevated dark:bg-elevated" />
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
    sm: 'w-8 h-8 text-link',
    md: 'w-9 h-9 text-link',
    lg: 'w-12 h-12 text-link',
    xl: 'w-20 h-20 text-3xl',
  }[size];

  const firstChar = Array.from((name || 'N').trim())[0]?.toUpperCase() || 'N';

  return (
    <div
      className={`relative shrink-0 inline-flex items-center justify-center rounded-full majlis-avatar-shape select-none transition-all duration-150 ${
        speaking ? 'brightness-105' : ''
      }`}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${sizeClass} ${className} rounded-full majlis-avatar-shape object-cover bg-hover dark:bg-hover`}
        />
      ) : (
        <div
          className={`${sizeClass} ${className} rounded-full majlis-avatar-shape ${getPaletteForName(
            name || 'Majlis'
          )} text-text font-bold flex items-center justify-center shadow-inner`}
        >
          {firstChar}
        </div>
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
    sm: 'w-9 h-9 text-link',
    md: 'w-12 h-12 text-link',
    lg: 'w-16 h-16 text-link',
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
        className={`${sizeClass} ${rounded} object-cover bg-hover dark:bg-hover shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${rounded} bg-accent text-text font-semibold flex items-center justify-center shrink-0 select-none shadow-inner`}
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
    sm: 'w-8 h-8 text-link',
    md: 'w-9 h-9 text-link',
    lg: 'w-12 h-12 text-link',
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
        className={`${sizeClass} ${className} rounded-full majlis-avatar-shape object-cover bg-hover dark:bg-hover shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${className} rounded-full majlis-avatar-shape ${getPaletteForName(
        name || 'Group'
      )} text-text font-bold flex items-center justify-center shrink-0 shadow-inner select-none`}
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
