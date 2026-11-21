import type { Timestamp } from 'firebase/firestore';

export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';
export type SelectableUserStatus = 'online' | 'idle' | 'dnd';
export type Role = 'owner' | 'admin' | 'moderator' | 'member';
export type ThemeMode = 'dark' | 'light' | 'system' | 'amoled';
export type AccentColor = 'indigo' | 'blue' | 'green' | 'violet' | 'rose' | 'amber';
export type Language = 'en' | 'ar';
export type ChannelType = 'text' | 'voice';

export type SettingsCategoryId =
  | 'account'
  | 'profileStatus'
  | 'appearance'
  | 'notifications'
  | 'voiceVideo'
  | 'privacySafety'
  | 'languageTime'
  | 'chat'
  | 'accessibility'
  | 'keybinds'
  | 'myData'
  | 'about';

export type FontSizeLevel = 'small' | 'normal' | 'large';
export type DisplayDensity = 'comfortable' | 'compact';
export type MessageStyle = 'normal' | 'compact';
export type AvatarShape = 'circle' | 'rounded';
export type NotificationMode = 'all' | 'mentions' | 'none';
export type NotificationSoundId = 'classic' | 'chime' | 'pop' | 'bell' | 'none';
export type CameraQuality = '480p' | '720p' | '1080p';
export type FriendRequestPermission = 'everyone' | 'friends_of_friends' | 'nobody';
export type DmPermission = 'server_members' | 'friends_only';
export type CalendarSystem = 'gregory' | 'islamic';
export type TimeFormatMode = '12h' | '24h';
export type CustomStatusDuration = '30m' | '1h' | '4h' | 'today' | 'none';
export type ShortcutActionId =
  | 'quickSwitcher'
  | 'toggleSidebar'
  | 'toggleMute'
  | 'toggleDeafen'
  | 'openSettings';

export interface ServerNotificationPref {
  mode?: NotificationMode;
  mutedUntilMs?: number;
}

export interface UserSettings {
  uid: string;
  themeMode: ThemeMode;
  accentPreset: AccentColor | 'custom';
  customAccentHex: string;
  fontSize: FontSizeLevel;
  density: DisplayDensity;
  messageStyle: MessageStyle;
  avatarShape: AvatarShape;
  reducedMotion: boolean;
  notificationMode: NotificationMode;
  soundEnabled: boolean;
  notificationSound: NotificationSoundId;
  notificationVolume: number;
  dndScheduleEnabled: boolean;
  dndStartHour: number;
  dndEndHour: number;
  serverNotifications: Record<string, ServerNotificationPref>;
  channelMutes: Record<string, number>;
  audioInputId: string;
  audioOutputId: string;
  videoInputId: string;
  voiceSensitivityAuto: boolean;
  voiceSensitivityThreshold: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  outputVolume: number;
  cameraQuality: CameraQuality;
  pushToTalkEnabled: boolean;
  pushToTalkKey: string;
  friendRequestPermission: FriendRequestPermission;
  dmPermission: DmPermission;
  hideOnlineStatus: boolean;
  profileVisible: boolean;
  language: Language;
  timeFormat: TimeFormatMode;
  timezone: string;
  calendar: CalendarSystem;
  autoPreviewLinks: boolean;
  autoEmoji: boolean;
  showQuickReply: boolean;
  showTypingIndicators: boolean;
  confirmExternalLinks: boolean;
  highContrast: boolean;
  reduceTransparency: boolean;
  largeControls: boolean;
  shortcuts: Record<ShortcutActionId, string>;
  vpnCompatibilityMode: boolean;
  sessionRevokedBeforeMs: number;
  updatedAt?: Timestamp;
}

export interface UserSession {
  id: string;
  userId: string;
  deviceName: string;
  browser: string;
  platform: string;
  createdAtMs: number;
  lastActiveAt: Timestamp;
  createdAt: Timestamp;
}

export interface BlockedUser {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Timestamp;
}

export interface ProblemReport {
  id: string;
  userId: string;
  category: string;
  subject: string;
  description: string;
  appVersion: string;
  createdAt: Timestamp;
}

export interface UserPrivate {
  uid: string;
  email: string;
  theme: 'dark' | 'light';
  language: Language;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  mentionsOnly: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PublicUser {
  uid: string;
  username: string;
  usernameLower: string;
  displayName: string;
  avatarUrl?: string;
  bannerUrl?: string;
  profileColor?: string;
  bio?: string;
  customStatusText?: string;
  customStatusEmoji?: string;
  customStatusExpiresAtMs?: number;
  hideOnlineStatus?: boolean;
  profileVisible?: boolean;
  friendRequestPermission?: FriendRequestPermission;
  dmPermission?: DmPermission;
  status: UserStatus;
  isDiscoverable: boolean;
  lastSeen: Timestamp;
  updatedAt: Timestamp;
}

export interface JoinedServerRef {
  serverId: string;
  userId: string;
  serverName: string;
  serverIconUrl?: string;
  role: Role;
  joinedAt: Timestamp;
}

export interface ReadState {
  channelId: string;
  userId: string;
  serverId: string;
  lastReadAt: Timestamp;
}

export interface ConversationReadReceipt {
  userId: string;
  lastReadMessageId: string;
  lastReadAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Server {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  ownerId: string;
  isPublic: boolean;
  defaultChannelId?: string;
  memberCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ServerMember {
  uid: string;
  serverId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: Role;
  joinedViaInvite?: string;
  joinedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ServerBan {
  uid: string;
  serverId: string;
  bannedBy: string;
  reason?: string;
  createdAt: Timestamp;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  topic?: string;
  type: ChannelType;
  category: string;
  position: number;
  createdBy: string;
  lastMessageAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SystemMessageAction =
  | 'created'
  | 'added_member'
  | 'removed_member'
  | 'left_group'
  | 'renamed_group'
  | 'changed_icon'
  | 'transferred_owner'
  | 'call';

export interface ChatMessage {
  id: string;
  channelId?: string;
  serverId?: string;
  dmId?: string;
  groupId?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorRole?: Role;
  content: string;
  isSystem?: boolean;
  systemAction?: SystemMessageAction;
  systemTargetName?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  replyToId?: string;
  replyToAuthor?: string;
  replyToContent?: string;
  mentions?: string[];
  edited: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Timestamp;
}

export interface TypingUser {
  userId: string;
  displayName: string;
  updatedAt: Timestamp;
}

export interface VoiceParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  hasCamera: boolean;
  hasScreenShare: boolean;
  joinedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuditLog {
  id: string;
  serverId: string;
  actorId: string;
  actorName: string;
  action: 'delete_message' | 'kick_member' | 'ban_member' | 'update_role' | 'update_channel';
  targetName?: string;
  details?: string;
  createdAt: Timestamp;
}

export interface VoiceSignal {
  id: string;
  fromUid: string;
  toUid: string;
  type: 'offer' | 'answer' | 'candidate';
  payload: string;
  createdAt: Timestamp;
}

export interface Invite {
  code: string;
  serverId: string;
  serverName: string;
  serverIconUrl?: string;
  createdBy: string;
  uses: number;
  maxUses: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Friendship {
  id: string;
  participants: string[];
  requesterId: string;
  recipientId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DirectMessageThread {
  id: string;
  participants: string[];
  lastMessageAt?: Timestamp;
  lastMessagePreview?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupDm {
  id: string;
  name: string;
  iconUrl?: string;
  ownerId: string;
  memberIds: string[];
  lastMessageAt?: Timestamp;
  lastMessagePreview?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MutedGroupPref {
  groupId: string;
  muted: boolean;
  updatedAt: Timestamp;
}

export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed' | 'busy';
export type CallType = 'audio' | 'video';

export interface DirectCall {
  id: string;
  dmId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  participants: string[];
  activeParticipants: string[];
  type: CallType;
  status: CallStatus;
  isGroup?: boolean;
  groupName?: string;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  durationSeconds?: number;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
