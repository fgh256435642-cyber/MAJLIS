import type { AccentColor, GroupDm, Language, PublicUser, Role, UserStatus } from '../types/nexus';

export const LIMITS = {
  ID_MAX: 128,
  COMPOSITE_ID_MAX: 260,
  USERNAME_MIN: 2,
  USERNAME_MAX: 32,
  DISPLAY_NAME_MIN: 1,
  DISPLAY_NAME_MAX: 64,
  BIO_MAX: 240,
  SERVER_NAME_MIN: 2,
  SERVER_NAME_MAX: 80,
  SERVER_DESC_MAX: 400,
  GROUP_NAME_MAX: 80,
  GROUP_MEMBERS_MAX: 10,
  CHANNEL_NAME_MIN: 1,
  CHANNEL_NAME_MAX: 64,
  CHANNEL_TOPIC_MAX: 256,
  CATEGORY_MAX: 48,
  MESSAGE_MAX: 4000,
  URL_MAX: 2048,
  DATA_IMAGE_URL_MAX: 200000,
  MENTIONS_MAX: 10,
} as const;

export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
export const DATA_IMAGE_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function sanitizeText(input: string, maxLength: number): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function sanitizeMessageBody(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, LIMITS.MESSAGE_MAX);
}

export function normalizeChannelSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, LIMITS.CHANNEL_NAME_MAX);
  return slug || 'channel';
}

export function isValidUsername(username: string): boolean {
  return (
    username.length >= LIMITS.USERNAME_MIN &&
    username.length <= LIMITS.USERNAME_MAX &&
    USERNAME_PATTERN.test(username)
  );
}

export function isValidSafeHttpsUrl(url?: string): boolean {
  if (!url) return true;
  return url.length <= LIMITS.URL_MAX && url.startsWith('https://');
}

export function sanitizeImageOrHttpsUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('https://')) {
    return url.slice(0, LIMITS.URL_MAX);
  }
  if (url.length <= LIMITS.DATA_IMAGE_URL_MAX && DATA_IMAGE_URL_PATTERN.test(url)) {
    return url;
  }
  return '';
}

export function getPairId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

export function getReactionDocId(userId: string, messageId: string, emoji: string): string {
  const hex = Array.from(emoji)
    .map((ch) => ch.codePointAt(0)?.toString(16) || '0')
    .join('-');
  return `${userId}_${messageId}_${hex}`.slice(0, LIMITS.ID_MAX);
}

export function generateInviteCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function extractInviteCode(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/invite=([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];
  const parts = trimmed.split('/').filter(Boolean);
  return (parts[parts.length - 1] || trimmed).replace(/[^a-zA-Z0-9_-]/g, '');
}

export function extractMentions(content: string): string[] {
  const matches = content.match(/@([a-zA-Z0-9_.-]{2,32})/g) || [];
  const unique = Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
  return unique.slice(0, LIMITS.MENTIONS_MAX);
}

export function extractFirstUrl(content: string): string | null {
  const match = content.match(/https:\/\/[^\s<>()]+/i);
  return match ? match[0] : null;
}

export type Permission =
  | 'manage_server'
  | 'delete_server'
  | 'manage_channels'
  | 'manage_roles'
  | 'kick_members'
  | 'ban_members'
  | 'delete_any_message'
  | 'create_invite';

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  owner: new Set([
    'manage_server',
    'delete_server',
    'manage_channels',
    'manage_roles',
    'kick_members',
    'ban_members',
    'delete_any_message',
    'create_invite',
  ]),
  admin: new Set([
    'manage_server',
    'manage_channels',
    'manage_roles',
    'kick_members',
    'ban_members',
    'delete_any_message',
    'create_invite',
  ]),
  moderator: new Set([
    'kick_members',
    'delete_any_message',
    'create_invite',
  ]),
  member: new Set(['create_invite']),
};

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function getRoleColorClass(role?: Role): string {
  switch (role) {
    case 'owner':
      return 'text-amber-600 dark:text-amber-400';
    case 'admin':
      return 'text-rose-600 dark:text-rose-400';
    case 'moderator':
      return 'text-emerald-600 dark:text-emerald-400';
    default:
      return 'text-slate-900 dark:text-[#F2F3F5]';
  }
}

export function getRoleBadgeText(role?: Role): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'moderator':
      return 'Mod';
    default:
      return 'Member';
  }
}

export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_TIMEOUT_MS = 60_000;
export const IDLE_TIMEOUT_MS = 180_000;

export function getStatusDotClass(status?: UserStatus): string {
  switch (status) {
    case 'online':
      return 'bg-emerald-500';
    case 'idle':
      return 'bg-amber-400 dark:bg-amber-500';
    case 'dnd':
      return 'bg-rose-500';
    default:
      return 'bg-zinc-400 dark:bg-zinc-500';
  }
}

export function getEffectiveUserStatus(
  status?: UserStatus,
  lastSeenMs?: number,
  nowMs: number = Date.now()
): UserStatus {
  if (!status || status === 'offline') return 'offline';
  if (lastSeenMs && nowMs - lastSeenMs > PRESENCE_TIMEOUT_MS) return 'offline';
  return status;
}

export function getSelfEffectiveStatus(
  status: UserStatus | undefined,
  isNavigatorOnline: boolean
): UserStatus {
  if (!isNavigatorOnline) return 'offline';
  if (!status || status === 'offline') return 'online';
  return status;
}

export function isUserEffectivelyOnline(
  status?: UserStatus,
  lastSeenMs?: number,
  nowMs: number = Date.now()
): boolean {
  return getEffectiveUserStatus(status, lastSeenMs, nowMs) !== 'offline';
}

export const ACCENT_PRESETS: ReadonlyArray<{
  id: AccentColor;
  labelKey:
    | 'accentIndigo'
    | 'accentBlue'
    | 'accentGreen'
    | 'accentViolet'
    | 'accentRose'
    | 'accentAmber'
    | 'accentCyan'
    | 'accentPink';
  swatchClass: string;
}> = [
  { id: 'indigo', labelKey: 'accentIndigo', swatchClass: 'bg-[#5865F2]' },
  { id: 'blue', labelKey: 'accentBlue', swatchClass: 'bg-[#2563EB]' },
  { id: 'green', labelKey: 'accentGreen', swatchClass: 'bg-[#10B981]' },
  { id: 'violet', labelKey: 'accentViolet', swatchClass: 'bg-[#8B5CF6]' },
  { id: 'rose', labelKey: 'accentRose', swatchClass: 'bg-[#E11D48]' },
  { id: 'amber', labelKey: 'accentAmber', swatchClass: 'bg-[#D97706]' },
  { id: 'cyan', labelKey: 'accentCyan', swatchClass: 'bg-[#0891B2]' },
  { id: 'pink', labelKey: 'accentPink', swatchClass: 'bg-[#DB2777]' },
];

export function isValidAccentColor(value: string | null): value is AccentColor {
  return ACCENT_PRESETS.some((p) => p.id === value);
}

export function getGroupDisplayName(
  group: Pick<GroupDm, 'name' | 'memberIds'>,
  usersById: Record<string, PublicUser>,
  myUid: string,
  language: Language
): string {
  const custom = group.name?.trim();
  if (custom) return custom;

  const otherNames = group.memberIds
    .filter((id) => id !== myUid)
    .map((id) => usersById[id]?.displayName)
    .filter((n): n is string => Boolean(n));

  if (otherNames.length > 0) {
    const sep = language === 'ar' ? '، ' : ', ';
    return otherNames.join(sep);
  }

  const allNames = group.memberIds
    .map((id) => usersById[id]?.displayName)
    .filter((n): n is string => Boolean(n));
  if (allNames.length > 0) {
    const sep = language === 'ar' ? '، ' : ', ';
    return allNames.join(sep);
  }

  return language === 'ar' ? 'مجموعة' : 'Group Chat';
}

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(val?: string): boolean {
  return Boolean(val && HEX_COLOR_PATTERN.test(val));
}

export function darkenHexColor(hex: string, amount = 0.14): string {
  if (!isValidHexColor(hex)) return '#4752C4';
  const clean = hex.slice(1);
  const num = parseInt(clean, 16);
  const r = Math.max(0, Math.round(((num >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 255) * (1 - amount)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function getAccentContrast(hex: string): '#FFFFFF' | '#000000' {
  if (!isValidHexColor(hex)) return '#FFFFFF';
  const clean = hex.slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.72 ? '#000000' : '#FFFFFF';
}

export function getActiveCustomStatus(
  user?: Pick<PublicUser, 'customStatusText' | 'customStatusEmoji' | 'customStatusExpiresAtMs'> | null,
  nowMs: number = Date.now()
): { emoji: string; text: string } | null {
  if (!user) return null;
  const text = (user.customStatusText || '').trim();
  const emoji = (user.customStatusEmoji || '').trim();
  if (!text && !emoji) return null;
  if (user.customStatusExpiresAtMs && user.customStatusExpiresAtMs > 0 && nowMs > user.customStatusExpiresAtMs) {
    return null;
  }
  return { emoji, text };
}

export function computeCustomStatusExpiryMs(duration: '30m' | '1h' | '4h' | 'today' | 'none'): number {
  const now = Date.now();
  switch (duration) {
    case '30m':
      return now + 30 * 60 * 1000;
    case '1h':
      return now + 60 * 60 * 1000;
    case '4h':
      return now + 4 * 60 * 60 * 1000;
    case 'today': {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      return endOfDay.getTime();
    }
    default:
      return 0;
  }
}

const EMOTICON_MAP: Array<[RegExp, string]> = [
  [/(^|\s):-\)(?=\s|$)/g, '$1😊'],
  [/(^|\s):\)(?=\s|$)/g, '$1😊'],
  [/(^|\s):-\((?=\s|$)/g, '$1😢'],
  [/(^|\s):\((?=\s|$)/g, '$1😢'],
  [/(^|\s):-D(?=\s|$)/g, '$1😄'],
  [/(^|\s):D(?=\s|$)/g, '$1😄'],
  [/(^|\s);-\)(?=\s|$)/g, '$1😉'],
  [/(^|\s);\)(?=\s|$)/g, '$1😉'],
  [/(^|\s):-P(?=\s|$)/gi, '$1😛'],
  [/(^|\s):P(?=\s|$)/gi, '$1😛'],
  [/(^|\s):-O(?=\s|$)/gi, '$1😮'],
  [/(^|\s)<3(?=\s|$)/g, '$1❤️'],
  [/:heart:/g, '❤️'],
  [/:fire:/g, '🔥'],
  [/:thumbsup:/g, '👍'],
  [/:rocket:/g, '🚀'],
  [/:check:/g, '✅'],
  [/:joy:/g, '😂'],
  [/:sparkles:/g, '✨'],
];

export function convertEmoticonsToEmoji(input: string): string {
  let result = input;
  for (const [pattern, replacement] of EMOTICON_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function isDndScheduleActive(
  enabled: boolean,
  startHour: number,
  endHour: number,
  nowDate: Date = new Date()
): boolean {
  if (!enabled) return false;
  const hour = nowDate.getHours();
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Overnight window e.g. 23 -> 7
  return hour >= startHour || hour < endHour;
}

export function isTargetMuted(mutedUntilMs?: number, nowMs: number = Date.now()): boolean {
  if (!mutedUntilMs) return false;
  if (mutedUntilMs === -1) return true;
  return mutedUntilMs > nowMs;
}

const CODE_LABEL_MAP: Record<string, string> = {
  Space: 'Space',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
  Backslash: 'Backslash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Minus: 'Minus',
  Equal: 'Equal',
  Backquote: 'Backquote',
};

function getNormalizedKeyFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  if (/^Key([A-Z])$/.test(e.code)) {
    return e.code.slice(3);
  }
  if (/^Digit([0-9])$/.test(e.code)) {
    return e.code.slice(5);
  }
  if (CODE_LABEL_MAP[e.code]) {
    return CODE_LABEL_MAP[e.code];
  }
  if (e.key === ' ') return 'Space';
  if (e.key === ',') return 'Comma';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

export function matchesShortcutEvent(e: KeyboardEvent, shortcutStr: string): boolean {
  if (!shortcutStr) return false;
  const parts = shortcutStr.split('+').map((p) => p.trim().toLowerCase());
  const needsCtrl = parts.includes('ctrl') || parts.includes('control') || parts.includes('mod');
  const needsShift = parts.includes('shift');
  const needsAlt = parts.includes('alt');
  const mainKey = parts.find((p) => !['ctrl', 'control', 'mod', 'shift', 'alt'].includes(p));
  if (!mainKey) return false;

  const hasCtrl = e.ctrlKey || e.metaKey;
  if (needsCtrl !== hasCtrl) return false;
  if (needsShift !== e.shiftKey) return false;
  if (needsAlt !== e.altKey) return false;

  const evKey = e.key.toLowerCase();
  const evCode = e.code.toLowerCase();
  const normalized = getNormalizedKeyFromEvent(e)?.toLowerCase();
  return (
    evKey === mainKey ||
    evCode === mainKey ||
    evCode === `key${mainKey}` ||
    evCode === `digit${mainKey}` ||
    normalized === mainKey
  );
}

export function formatKeyboardShortcutFromEvent(e: KeyboardEvent): string | null {
  const keyLabel = getNormalizedKeyFromEvent(e);
  if (!keyLabel) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(keyLabel);
  return parts.join('+');
}

