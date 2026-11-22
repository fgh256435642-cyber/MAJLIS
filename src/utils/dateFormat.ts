import type { CalendarSystem, Language, TimeFormatMode } from '../types/majlis';

export interface DateFormatOptions {
  language: Language;
  timeFormat: TimeFormatMode;
  timezone: string;
  calendar: CalendarSystem;
  todayLabel: string;
}

export function getCommonTimezones(): string[] {
  const browserTz =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  const base = [
    browserTz,
    'UTC',
    'Asia/Riyadh',
    'Asia/Dubai',
    'Asia/Kuwait',
    'Asia/Qatar',
    'Asia/Amman',
    'Asia/Baghdad',
    'Africa/Cairo',
    'Africa/Casablanca',
    'Europe/London',
    'Europe/Paris',
    'Europe/Istanbul',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Tokyo',
  ];
  return Array.from(new Set(base.filter(Boolean)));
}

function resolveLocale(language: Language, calendar: CalendarSystem): string {
  if (calendar === 'islamic') {
    return language === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : 'en-US-u-ca-islamic-umalqura';
  }
  return language === 'ar' ? 'ar-SA' : 'en-US';
}

export function formatMessageTimestamp(ms: number | undefined, opts: DateFormatOptions): string {
  if (!ms) return '';
  const date = new Date(ms);
  const now = new Date();
  const locale = resolveLocale(opts.language, opts.calendar);
  const hour12 = opts.timeFormat === '12h';
  const tz = opts.timezone || undefined;

  let isToday = false;
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    isToday = fmt.format(date) === fmt.format(now);
  } catch {
    isToday = date.toDateString() === now.toDateString();
  }

  let timeStr = '';
  try {
    timeStr = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12,
    }).format(date);
  } catch {
    timeStr = date.toLocaleTimeString(opts.language === 'ar' ? 'ar' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12,
    });
  }

  if (isToday) {
    return `${opts.todayLabel} ${timeStr}`;
  }

  let dateStr = '';
  try {
    dateStr = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }).format(date);
  } catch {
    dateStr = date.toLocaleDateString(opts.language === 'ar' ? 'ar' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  return `${dateStr} · ${timeStr}`;
}

export function formatTimeOnly(ms: number | undefined, opts: DateFormatOptions): string {
  if (!ms) return '';
  const date = new Date(ms);
  const locale = resolveLocale(opts.language, opts.calendar);
  const hour12 = opts.timeFormat === '12h';
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: opts.timezone || undefined,
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12,
    }).format(date);
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });
  }
}

export function formatShortDate(ms: number | undefined, opts: DateFormatOptions): string {
  if (!ms) return '';
  const date = new Date(ms);
  const locale = resolveLocale(opts.language, opts.calendar);
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: opts.timezone || undefined,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}
