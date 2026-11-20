import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CornerUpLeft,
  Crown,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Hash,
  Info,
  Loader2,
  Menu,
  Mic,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Phone,
  Search,
  SendHorizontal,
  Settings,
  ShieldAlert,
  Smile,
  SmilePlus,
  Square,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useUserSettings } from '../hooks/useUserSettings';
import { t } from '../i18n/translations';
import { uploadFileToStorage } from '../services/storageService';
import type {
  ChatMessage,
  ConversationReadReceipt,
  GroupDm,
  MessageReaction,
  PublicUser,
  Role,
  ServerMember,
  TypingUser,
} from '../types/nexus';
import { formatMessageTimestamp, formatShortDate, formatTimeOnly } from '../utils/dateFormat';
import { LinkEmbedCard, RichMessageContent } from '../utils/markdown';
import {
  convertEmoticonsToEmoji,
  extractFirstUrl,
  getActiveCustomStatus,
  getEffectiveUserStatus,
  getRoleColorClass,
  hasPermission,
  LIMITS,
} from '../utils/validation';
import { GroupAvatar, StatusIndicator, UserAvatar } from './NexusLogo';
import { VoiceNotePlayer } from './VoiceNotePlayer';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '🎉', '✅', '🚀'];
const COMPOSER_EMOJIS = [
  '😀', '😂', '🥹', '😍', '🤩', '😎', '🤔', '🙌',
  '👍', '👏', '🔥', '✨', '🎉', '❤️', '💯', '🚀',
  '👀', '✅', '⚡', '💡', '🎮', '🎧', '💻', '📌',
];

interface ChatAreaProps {
  mode: 'channel' | 'dm' | 'group';
  title: string;
  subtitle?: string;
  dmRecipient?: PublicUser;
  group?: GroupDm;
  groupMembers?: PublicUser[];
  isGroupMuted?: boolean;
  onToggleMuteGroup?: () => void;
  onOpenGroupSettings?: () => void;
  categoryName?: string;
  memberCount?: number;
  storageScopeId: string;
  channelOrDmId: string;
  messages: ChatMessage[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  reactions: MessageReaction[];
  typingUsers: TypingUser[];
  readReceipts?: ConversationReadReceipt[];
  members?: ServerMember[];
  usersById: Record<string, PublicUser>;
  myUid: string;
  myUsername: string;
  myRole?: Role;
  showMembersPanel?: boolean;
  onToggleMembersPanel?: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  onOpenMobileSidebar: () => void;
  onLoadOlder: () => void;
  onSendMessage: (payload: {
    content: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    replyTo?: { id: string; author: string; content: string } | null;
  }) => Promise<void>;
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string, alreadyReacted: boolean) => Promise<void>;
  onTypingChange: (isTyping: boolean) => void;
  onStartDmCall?: (type: 'audio' | 'video') => void;
}

export function ChatArea({
  mode,
  title,
  subtitle,
  dmRecipient,
  group,
  groupMembers = [],
  isGroupMuted = false,
  onToggleMuteGroup,
  onOpenGroupSettings,
  categoryName,
  memberCount,
  storageScopeId,
  channelOrDmId,
  messages,
  loading,
  hasMore,
  loadingMore,
  reactions,
  typingUsers,
  readReceipts = [],
  members = [],
  usersById,
  myUid,
  myUsername,
  myRole = 'member',
  showMembersPanel,
  onToggleMembersPanel,
  sidebarCollapsed = false,
  onExpandSidebar,
  onOpenMobileSidebar,
  onLoadOlder,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onTypingChange,
  onStartDmCall,
}: ChatAreaProps) {
  const { language, presenceNowMs } = useAuth();
  const { settings, blockedUserIds } = useUserSettings();
  const { pushToast } = useToast();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [emojiPickerForId, setEmojiPickerForId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingExternalUrl, setPendingExternalUrl] = useState<string | null>(null);
  const [revealedBlockedIds, setRevealedBlockedIds] = useState<Record<string, boolean>>({});
  const [revealedImageIds, setRevealedImageIds] = useState<Record<string, boolean>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(true);
  const prevChannelRef = useRef<string>(channelOrDmId);

  // Reset state when switching channels/DMs
  useEffect(() => {
    if (prevChannelRef.current !== channelOrDmId) {
      prevChannelRef.current = channelOrDmId;
      setReplyTo(null);
      setEditingMsgId(null);
      setEmojiPickerForId(null);
      setSearchOpen(false);
      setSearchQuery('');
      setMentionQuery(null);
      setComposerEmojiOpen(false);
      isAtBottomRef.current = true;
    }
  }, [channelOrDmId]);

  // Auto-scroll to bottom when new messages arrive and user is near bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages.length, channelOrDmId]);

  // Cleanup preview object URL and recording timer
  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    };
  }, [pendingPreviewUrl]);

  const reactionsByMessage = useMemo(() => {
    const map: Record<string, { emoji: string; count: number; reactedByMe: boolean }[]> = {};
    const grouped: Record<string, Record<string, { count: number; reactedByMe: boolean }>> = {};

    for (const r of reactions) {
      if (!grouped[r.messageId]) grouped[r.messageId] = {};
      if (!grouped[r.messageId][r.emoji]) {
        grouped[r.messageId][r.emoji] = { count: 0, reactedByMe: false };
      }
      grouped[r.messageId][r.emoji].count += 1;
      if (r.userId === myUid) grouped[r.messageId][r.emoji].reactedByMe = true;
    }

    for (const [msgId, emojiMap] of Object.entries(grouped)) {
      map[msgId] = Object.entries(emojiMap).map(([emoji, info]) => ({
        emoji,
        ...info,
      }));
    }
    return map;
  }, [reactions, myUid]);

  const { readerLastIndexByUid, readersByMessageId } = useMemo(() => {
    const idxMap: Record<string, number> = {};
    const byMsg: Record<
      string,
      { uid: string; displayName: string; avatarUrl?: string }[]
    > = {};

    if (
      (mode !== 'dm' && mode !== 'group') ||
      messages.length === 0 ||
      readReceipts.length === 0
    ) {
      return { readerLastIndexByUid: idxMap, readersByMessageId: byMsg };
    }

    const msgIdxById: Record<string, number> = {};
    messages.forEach((m, i) => {
      msgIdxById[m.id] = i;
    });

    for (const r of readReceipts) {
      if (!r.userId || r.userId === myUid) continue;
      let idx = msgIdxById[r.lastReadMessageId];
      if (idx === undefined) {
        const readMs = r.lastReadAt?.toMillis?.() || 0;
        if (readMs > 0) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const msgMs = messages[i].createdAt?.toMillis?.() || 0;
            if (msgMs > 0 && msgMs <= readMs) {
              idx = i;
              break;
            }
          }
        }
      }
      if (idx === undefined || idx < 0) continue;
      idxMap[r.userId] = idx;

      const targetMsg = messages[idx];
      if (targetMsg.authorId === r.userId && idx === messages.length - 1) {
        continue;
      }

      const pub = usersById[r.userId];
      const displayName =
        pub?.displayName ||
        (mode === 'dm' ? dmRecipient?.displayName : undefined) ||
        r.userId.slice(0, 6);
      const avatarUrl =
        pub?.avatarUrl ?? (mode === 'dm' ? dmRecipient?.avatarUrl : undefined);
      if (!byMsg[targetMsg.id]) byMsg[targetMsg.id] = [];
      byMsg[targetMsg.id].push({ uid: r.userId, displayName, avatarUrl });
    }

    return { readerLastIndexByUid: idxMap, readersByMessageId: byMsg };
  }, [mode, messages, readReceipts, myUid, usersById, dmRecipient]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    if (mode === 'channel') {
      return members
        .filter(
          (m) =>
            m.username.toLowerCase().includes(q) ||
            m.displayName.toLowerCase().includes(q)
        )
        .slice(0, 6);
    }
    if (mode === 'group') {
      return groupMembers
        .filter(
          (m) =>
            m.uid !== myUid &&
            (m.username.toLowerCase().includes(q) ||
              m.displayName.toLowerCase().includes(q))
        )
        .slice(0, 6);
    }
    return [];
  }, [mentionQuery, members, groupMembers, mode, myUid]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.authorName.toLowerCase().includes(q) ||
          (m.attachmentName || '').toLowerCase().includes(q)
      )
      .slice()
      .reverse();
  }, [messages, searchQuery]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 80;

    if (el.scrollTop < 60 && hasMore && !loadingMore && !loading) {
      onLoadOlder();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      pushToast({
        type: 'error',
        title: t(language, 'fileTooLarge'),
        description: t(language, 'fileTooLargeDesc'),
      });
      return;
    }
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(file);
    if (file.type.startsWith('image/')) {
      setPendingPreviewUrl(URL.createObjectURL(file));
    } else {
      setPendingPreviewUrl(null);
    }
    e.target.value = '';
  };

  const clearPendingFile = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingPreviewUrl(null);
    setUploadProgress(null);
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, {
          type: 'audio/webm',
        });
        setPendingFile(audioFile);
        setPendingPreviewUrl(null);
      };

      mediaRecorder.start();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Microphone access denied',
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      audioChunksRef.current = [];
    }
  };

  const handleDraftChange = (value: string) => {
    setDraft(value.slice(0, LIMITS.MESSAGE_MAX));

    // Detect @mention token near end
    const cursorPos = composerRef.current?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursorPos);
    const mentionMatch = beforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]{0,32})$/);
    setMentionQuery(mentionMatch ? mentionMatch[1] : null);

    // Emit typing indicator only if enabled
    if (settings.showTypingIndicators && value.trim().length > 0) {
      onTypingChange(true);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        onTypingChange(false);
      }, 3000);
    } else {
      onTypingChange(false);
    }
  };

  const insertMention = (username: string) => {
    const cursorPos = composerRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursorPos);
    const after = draft.slice(cursorPos);
    const replaced = before.replace(/@([a-zA-Z0-9_.-]{0,32})$/, `@${username} `);
    setDraft(replaced + after);
    setMentionQuery(null);
    composerRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (sending) return;
    let text = draft.trim();
    if (!text && !pendingFile) return;
    if (text && settings.autoEmoji) {
      text = convertEmoticonsToEmoji(text);
    }

    setSending(true);
    try {
      let attachmentUrl: string | undefined;
      let attachmentName: string | undefined;
      let attachmentType: string | undefined;

      if (pendingFile) {
        setUploadProgress(0);
        attachmentUrl = await uploadFileToStorage(
          `attachments/${storageScopeId}/${channelOrDmId}`,
          pendingFile,
          (pct) => setUploadProgress(pct)
        );
        attachmentName = pendingFile.name;
        attachmentType = pendingFile.type || 'application/octet-stream';
      }

      isAtBottomRef.current = true;
      await onSendMessage({
        content: text,
        attachmentUrl,
        attachmentName,
        attachmentType,
        replyTo: replyTo
          ? {
              id: replyTo.id,
              author: replyTo.authorName,
              content: replyTo.content || replyTo.attachmentName || '[Attachment]',
            }
          : null,
      });

      setDraft('');
      setReplyTo(null);
      setMentionQuery(null);
      clearPendingFile();
      onTypingChange(false);
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'sendMessageFailed'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (mentionQuery !== null) {
        setMentionQuery(null);
      } else if (replyTo) {
        setReplyTo(null);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSaveEdit = async (msgId: string) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    try {
      await onEditMessage(msgId, trimmed);
      setEditingMsgId(null);
      setEditingText('');
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'editMessageFailed'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(messageId);
      setTimeout(() => setHighlightedMsgId(null), 1800);
    }
  };

  const dateOpts = {
    language,
    timeFormat: settings.timeFormat,
    timezone: settings.timezone,
    calendar: settings.calendar,
    todayLabel: t(language, 'todayAt'),
  };

  const formatTimestamp = (ms?: number) => formatMessageTimestamp(ms, dateOpts);

  const canDeleteAny =
    (mode === 'channel' && hasPermission(myRole, 'delete_any_message')) ||
    (mode === 'group' && group?.ownerId === myUid);

  // Filter active typing users (< 5s old, not self, not blocked)
  const activeTypers = settings.showTypingIndicators
    ? typingUsers.filter(
        (tu) =>
          tu.userId !== myUid &&
          !blockedUserIds.has(tu.userId) &&
          Date.now() - (tu.updatedAt?.toMillis?.() || 0) < 6000
      )
    : [];

  const renderSystemText = (msg: ChatMessage, actorName: string) => {
    switch (msg.systemAction) {
      case 'created':
        return `${actorName} ${t(language, 'sysGroupCreated')}`;
      case 'added_member':
        return `${actorName} ${t(language, 'sysAddedMember')} ${msg.systemTargetName || ''}`.trim();
      case 'removed_member':
        return `${actorName} ${t(language, 'sysRemovedMember')} ${msg.systemTargetName || ''}`.trim();
      case 'left_group':
        return `${actorName} ${t(language, 'sysLeftGroup')}`;
      case 'renamed_group':
        return `${t(language, 'sysRenamedGroup')} ${msg.systemTargetName || ''}`.trim();
      case 'changed_icon':
        return t(language, 'sysChangedIcon');
      case 'transferred_owner':
        return `${actorName} ${t(language, 'sysTransferredOwner')} ${msg.systemTargetName || ''}`.trim();
      default:
        return msg.content;
    }
  };

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-white dark:bg-[#313338] relative">
      {/* Top Bar */}
      <header className="h-12 px-3 sm:px-4 border-b border-slate-200 dark:border-black/25 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 rounded-md text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          {sidebarCollapsed && onExpandSidebar && (
            <button
              type="button"
              onClick={onExpandSidebar}
              title={`${t(language, 'expandSidebar')} (Ctrl+B)`}
              aria-label={t(language, 'expandSidebar')}
              aria-keyshortcuts="Control+b"
              className="hidden md:inline-flex p-1.5 rounded-md border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-[#2B2D31] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
            >
              <PanelLeftOpen className="w-4 h-4 rtl:rotate-180" />
            </button>
          )}

          {mode === 'channel' ? (
            <Hash className="w-5 h-5 text-slate-400 dark:text-zinc-400 shrink-0" />
          ) : mode === 'group' ? (
            <GroupAvatar src={group?.iconUrl} name={title} size="xs" />
          ) : dmRecipient ? (
            <UserAvatar
              src={dmRecipient.avatarUrl}
              name={dmRecipient.displayName || title}
              status={getEffectiveUserStatus(
                dmRecipient.status,
                dmRecipient.lastSeen?.toMillis?.(),
                presenceNowMs
              )}
              size="xs"
              showStatus
            />
          ) : (
            <AtSign className="w-5 h-5 text-slate-400 dark:text-zinc-400 shrink-0" />
          )}

          <h2 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white truncate">
            {title}
          </h2>

          {mode === 'group' && group && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400 shrink-0 tabular-nums">
              <span>·</span>
              <span>
                {group.memberIds.length} {t(language, 'members')}
              </span>
            </span>
          )}

          {mode === 'dm' && dmRecipient && (() => {
            const recipientStatus = getEffectiveUserStatus(
              dmRecipient.status,
              dmRecipient.lastSeen?.toMillis?.(),
              presenceNowMs
            );
            const custom = getActiveCustomStatus(dmRecipient, presenceNowMs);
            const recipientStatusText =
              recipientStatus === 'online'
                ? t(language, 'online')
                : recipientStatus === 'idle'
                ? t(language, 'idle')
                : recipientStatus === 'dnd'
                ? t(language, 'dnd')
                : t(language, 'offline');
            return (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 shrink-0 max-w-[220px] truncate">
                <StatusIndicator status={recipientStatus} className="w-2 h-2 shrink-0" />
                <span>{recipientStatusText}</span>
                {custom && (
                  <span className="text-slate-600 dark:text-zinc-300 truncate">
                    · {custom.emoji} {custom.text}
                  </span>
                )}
              </span>
            );
          })()}

          {mode === 'channel' && (categoryName || typeof memberCount === 'number') && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 shrink-0 tabular-nums">
              {categoryName && <span>{categoryName}</span>}
              {categoryName && typeof memberCount === 'number' && <span aria-hidden="true">·</span>}
              {typeof memberCount === 'number' && (
                <span>
                  {memberCount} {t(language, 'members')}
                </span>
              )}
            </span>
          )}

          {subtitle && (
            <span className="hidden xl:inline text-xs text-slate-500 dark:text-zinc-400 truncate border-s border-slate-200 dark:border-white/10 ps-3">
              {subtitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 absolute start-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              placeholder={t(language, 'searchMessages')}
              className="w-32 sm:w-48 focus:sm:w-60 transition-all ps-8 pe-7 py-1 rounded-md bg-slate-100 dark:bg-[#1E1F22] text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-nexus"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                }}
                className="absolute end-2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {(mode === 'dm' || mode === 'group') && onStartDmCall && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onStartDmCall('audio')}
                title={t(language, 'startAudioCall')}
                aria-label={t(language, 'startAudioCall')}
                className="p-1.5 rounded-md text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onStartDmCall('video')}
                title={t(language, 'startVideoCall')}
                aria-label={t(language, 'startVideoCall')}
                className="p-1.5 rounded-md text-slate-500 dark:text-zinc-400 hover:text-nexus dark:hover:text-nexus hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Video className="w-4 h-4" />
              </button>
            </div>
          )}

          {mode === 'group' && onToggleMuteGroup && (
            <button
              type="button"
              onClick={onToggleMuteGroup}
              title={isGroupMuted ? t(language, 'unmuteGroup') : t(language, 'muteGroup')}
              aria-label={isGroupMuted ? t(language, 'unmuteGroup') : t(language, 'muteGroup')}
              className={`p-1.5 rounded-md transition-colors ${
                isGroupMuted
                  ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              {isGroupMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </button>
          )}

          {mode === 'group' && onOpenGroupSettings && (
            <button
              type="button"
              onClick={onOpenGroupSettings}
              title={t(language, 'groupSettings')}
              aria-label={t(language, 'groupSettings')}
              className="p-1.5 rounded-md text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {(mode === 'channel' || mode === 'group') && onToggleMembersPanel && (
            <button
              type="button"
              onClick={onToggleMembersPanel}
              aria-expanded={Boolean(showMembersPanel)}
              title={
                showMembersPanel
                  ? t(language, 'hideMembers')
                  : t(language, 'showMembers')
              }
              aria-label={
                showMembersPanel
                  ? t(language, 'hideMembers')
                  : t(language, 'showMembers')
              }
              className={`p-1.5 rounded-md transition-colors ${
                showMembersPanel
                  ? 'text-slate-900 dark:text-white bg-slate-200/70 dark:bg-white/10'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Chat + Optional Search Results Split */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Messages Scroll Viewport */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-0.5"
          >
            {hasMore && (
              <div className="flex justify-center pb-4">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={onLoadOlder}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-[#2B2D31] hover:bg-slate-200 dark:hover:bg-[#35373C] text-slate-600 dark:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? t(language, 'loadingMessages') : t(language, 'loadOlder')}
                </button>
              </div>
            )}

            {loading ? (
              <div className="space-y-4 py-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-[#2B2D31] shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-32 rounded bg-slate-200 dark:bg-[#2B2D31]" />
                      <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-[#2B2D31]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="py-12 px-2 space-y-2 border-b border-slate-200 dark:border-white/5 mb-4">
                {mode === 'group' ? (
                  <div className="mb-3">
                    <GroupAvatar src={group?.iconUrl} name={title} size="lg" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-nexus/15 text-nexus flex items-center justify-center mb-3">
                    {mode === 'channel' ? (
                      <Hash className="w-7 h-7" />
                    ) : (
                      <AtSign className="w-7 h-7" />
                    )}
                  </div>
                )}
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t(language, 'welcomeChannelTitle')} {mode === 'channel' ? `#${title}` : title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-lg">
                  {mode === 'group' ? t(language, 'welcomeGroupDesc') : t(language, 'welcomeChannelDesc')}
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const prev = idx > 0 ? messages[idx - 1] : null;
                const prevMs = prev?.createdAt?.toMillis?.() || 0;
                const currMs = msg.createdAt?.toMillis?.() || 0;
                const pubAuthor = usersById[msg.authorId];
                const authorName = pubAuthor?.displayName || msg.authorName;
                const readersHere =
                  mode === 'dm' || mode === 'group' ? readersByMessageId[msg.id] || [] : [];

                const renderReadersRow = () => {
                  if (readersHere.length === 0) return null;
                  const seenTooltip = `${t(language, 'seenBy')} ${readersHere
                    .map((r) => r.displayName)
                    .join(', ')}`;
                  const visibleReaders = readersHere.slice(0, 5);
                  const extraCount = readersHere.length - visibleReaders.length;
                  return (
                    <div
                      title={seenTooltip}
                      aria-label={seenTooltip}
                      className="flex items-center justify-end gap-1 mt-1 select-none"
                    >
                      <div className="flex items-center -space-x-1 rtl:space-x-reverse">
                        {visibleReaders.map((reader) =>
                          reader.avatarUrl ? (
                            <img
                              key={reader.uid}
                              src={reader.avatarUrl}
                              alt={reader.displayName}
                              referrerPolicy="no-referrer"
                              className="w-4 h-4 rounded-full object-cover shadow-xs"
                            />
                          ) : (
                            <span
                              key={reader.uid}
                              className="w-4 h-4 rounded-full bg-nexus text-[9px] font-bold text-white flex items-center justify-center shadow-xs uppercase"
                            >
                              {reader.displayName.charAt(0)}
                            </span>
                          )
                        )}
                      </div>
                      {extraCount > 0 && (
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 tabular-nums">
                          +{extraCount}
                        </span>
                      )}
                    </div>
                  );
                };

                if (msg.isSystem) {
                  const SysIcon =
                    msg.systemAction === 'added_member' || msg.systemAction === 'created'
                      ? UserPlus
                      : msg.systemAction === 'removed_member' || msg.systemAction === 'left_group'
                      ? UserMinus
                      : msg.systemAction === 'transferred_owner'
                      ? Crown
                      : msg.systemAction === 'call'
                      ? Phone
                      : Info;
                  const iconColor =
                    msg.systemAction === 'added_member' || msg.systemAction === 'created'
                      ? 'text-emerald-500'
                      : msg.systemAction === 'removed_member' || msg.systemAction === 'left_group'
                      ? 'text-rose-500'
                      : msg.systemAction === 'transferred_owner'
                      ? 'text-amber-500'
                      : 'text-nexus';

                  return (
                    <div key={msg.id} id={`msg-${msg.id}`} className="my-1.5">
                      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-50/80 dark:bg-[#2B2D31]/60 text-xs text-slate-600 dark:text-zinc-300">
                        <SysIcon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                        <span className="flex-1 min-w-0 font-medium">
                          {renderSystemText(msg, authorName)}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">
                          {formatTimestamp(currMs)}
                        </span>
                      </div>
                      {renderReadersRow()}
                    </div>
                  );
                }

                const isBlockedAuthor =
                  msg.authorId !== myUid && blockedUserIds.has(msg.authorId);

                if (isBlockedAuthor && !revealedBlockedIds[msg.id]) {
                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className="my-1 px-3 py-1.5 rounded-lg bg-slate-100/70 dark:bg-[#2B2D31]/50 border border-slate-200/70 dark:border-white/5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>{t(language, 'blockedMessageHidden')}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedBlockedIds((prev) => ({ ...prev, [msg.id]: true }))
                        }
                        className="inline-flex items-center gap-1 text-nexus hover:underline shrink-0 font-medium"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{t(language, 'showBlockedMessage')}</span>
                      </button>
                    </div>
                  );
                }

                const isCompact = settings.messageStyle === 'compact';
                const isGrouped =
                  !isCompact &&
                  Boolean(prev) &&
                  !prev!.isSystem &&
                  prev!.authorId === msg.authorId &&
                  !msg.replyToId &&
                  currMs - prevMs < 5 * 60 * 1000;

                const isMySentMessage =
                  (mode === 'dm' || mode === 'group') && msg.authorId === myUid;
                const isReadByAnyone =
                  isMySentMessage &&
                  Object.values(readerLastIndexByUid).some((rIdx) => rIdx >= idx);

                const authorAvatar = pubAuthor?.avatarUrl ?? msg.authorAvatar;
                const memberRole =
                  members.find((m) => m.uid === msg.authorId)?.role || msg.authorRole;
                const msgReactions = reactionsByMessage[msg.id] || [];
                const firstUrl = extractFirstUrl(msg.content);
                const isImageAttachment =
                  msg.attachmentUrl && msg.attachmentType?.startsWith('image/');
                const canDelete = msg.authorId === myUid || canDeleteAny;
                const canEdit = msg.authorId === myUid;
                const externalHandler = settings.confirmExternalLinks
                  ? (url: string) => setPendingExternalUrl(url)
                  : undefined;

                return (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`group relative rounded-lg px-2 nexus-chat-msg transition-colors ${
                      highlightedMsgId === msg.id
                        ? 'bg-nexus/20'
                        : 'hover:bg-slate-100/70 dark:hover:bg-[#2E3035]/70'
                    } ${
                      isCompact
                        ? 'py-0.5 mt-0.5'
                        : isGrouped
                        ? 'py-1 mt-0'
                        : 'py-1 mt-3 pt-1.5'
                    }`}
                  >
                    {/* Reply Context */}
                    {msg.replyToId && (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(msg.replyToId!)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white mb-1 ps-11 max-w-full truncate"
                      >
                        <CornerUpLeft className="w-3 h-3 shrink-0" />
                        <span className="font-medium shrink-0">{msg.replyToAuthor}:</span>
                        <span className="truncate opacity-80">{msg.replyToContent}</span>
                      </button>
                    )}

                    <div className={`flex items-start ${isCompact ? 'gap-2' : 'gap-3'}`}>
                      {isCompact ? (
                        <span className="w-12 shrink-0 text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums pt-1 text-end">
                          {formatTimeOnly(currMs, dateOpts)}
                        </span>
                      ) : isGrouped ? (
                        <div className="w-9 shrink-0 flex items-center justify-end pe-0.5">
                          <span className="hidden group-hover:inline text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums">
                            {formatTimeOnly(currMs, dateOpts)}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-0.5 shrink-0">
                          <UserAvatar
                            src={authorAvatar}
                            name={authorName}
                            size="md"
                          />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        {!isGrouped && !isCompact && (
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span
                              className={`text-sm font-semibold ${
                                mode === 'channel'
                                  ? getRoleColorClass(memberRole)
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {authorName}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                              {formatTimestamp(currMs)}
                            </span>
                            {isMySentMessage && (
                              <span
                                title={
                                  isReadByAnyone
                                    ? t(language, 'readLabel')
                                    : t(language, 'sentLabel')
                                }
                                aria-label={
                                  isReadByAnyone
                                    ? t(language, 'readLabel')
                                    : t(language, 'sentLabel')
                                }
                                className={`inline-flex items-center ${
                                  isReadByAnyone
                                    ? 'text-emerald-500'
                                    : 'text-slate-400 dark:text-zinc-500'
                                }`}
                              >
                                {isReadByAnyone ? (
                                  <CheckCheck className="w-3.5 h-3.5" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                              </span>
                            )}
                          </div>
                        )}

                        {editingMsgId === msg.id ? (
                          <div className="mt-1 space-y-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingMsgId(null);
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEdit(msg.id);
                                }
                              }}
                              className="w-full px-3 py-1.5 rounded-md border border-nexus bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none"
                            />
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
                              <span>{t(language, 'editingMessage')}</span>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(msg.id)}
                                className="text-nexus font-medium hover:underline"
                              >
                                {t(language, 'save')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingMsgId(null)}
                                className="hover:underline"
                              >
                                {t(language, 'cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-800 dark:text-[#DBDEE1] leading-relaxed">
                            {isCompact && (
                              <span
                                className={`font-semibold me-1.5 ${
                                  mode === 'channel'
                                    ? getRoleColorClass(memberRole)
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {authorName}:
                              </span>
                            )}
                            <RichMessageContent
                              content={msg.content}
                              currentUsername={myUsername}
                              onExternalLinkClick={externalHandler}
                            />
                            {msg.edited && (
                              <span className="text-[10px] text-slate-400 dark:text-zinc-500 ms-1">
                                {t(language, 'edited')}
                              </span>
                            )}
                            {(isGrouped || isCompact) && isMySentMessage && (
                              <span
                                title={
                                  isReadByAnyone
                                    ? t(language, 'readLabel')
                                    : t(language, 'sentLabel')
                                }
                                aria-label={
                                  isReadByAnyone
                                    ? t(language, 'readLabel')
                                    : t(language, 'sentLabel')
                                }
                                className={`ms-1.5 inline-flex items-center align-middle ${
                                  isReadByAnyone
                                    ? 'text-emerald-500'
                                    : 'text-slate-400 dark:text-zinc-500'
                                }`}
                              >
                                {isReadByAnyone ? (
                                  <CheckCheck className="w-3.5 h-3.5" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Link Embed */}
                        {firstUrl && settings.autoPreviewLinks && (
                          <LinkEmbedCard url={firstUrl} onExternalLinkClick={externalHandler} />
                        )}

                        {/* Attachment / Voice Note */}
                        {msg.attachmentUrl && (
                          <div className="mt-2">
                            {msg.attachmentType?.includes('audio') || msg.attachmentName?.includes('voice_note') ? (
                              <VoiceNotePlayer audioUrl={msg.attachmentUrl} />
                            ) : isImageAttachment ? (
                              settings.autoPreviewLinks || revealedImageIds[msg.id] ? (
                                <button
                                  type="button"
                                  onClick={() => setLightboxUrl(msg.attachmentUrl!)}
                                  className="block rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 max-w-sm max-h-72 hover:opacity-95 transition-opacity"
                                >
                                  <img
                                    src={msg.attachmentUrl}
                                    alt={msg.attachmentName || 'Attachment'}
                                    referrerPolicy="no-referrer"
                                    className="max-h-72 w-auto object-contain bg-slate-100 dark:bg-[#1E1F22]"
                                  />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedImageIds((prev) => ({ ...prev, [msg.id]: true }))
                                  }
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] text-xs font-medium text-nexus hover:bg-slate-100 dark:hover:bg-[#35373C]"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{msg.attachmentName || t(language, 'showImagePreview')}</span>
                                </button>
                              )
                            ) : (
                              <a
                                href={msg.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] hover:bg-slate-100 dark:hover:bg-[#35373C] text-sm transition-colors"
                              >
                                <FileText className="w-5 h-5 text-nexus shrink-0" />
                                <span className="truncate max-w-[220px] font-medium text-[#006CE7] dark:text-[#00A8FC]">
                                  {msg.attachmentName || 'Download file'}
                                </span>
                                <Download className="w-4 h-4 text-slate-400 shrink-0" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Reactions */}
                        {msgReactions.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {msgReactions.map((r) => (
                              <button
                                key={r.emoji}
                                type="button"
                                onClick={() =>
                                  onToggleReaction(msg.id, r.emoji, r.reactedByMe)
                                }
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border transition-colors tabular-nums ${
                                  r.reactedByMe
                                    ? 'bg-nexus/15 border-nexus/50 text-nexus'
                                    : 'bg-slate-100 dark:bg-[#2B2D31] border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#35373C]'
                                }`}
                              >
                                <span>{r.emoji}</span>
                                <span className="font-medium">{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {renderReadersRow()}

                    {/* Hover Action Toolbar */}
                    {(settings.showQuickReply || canEdit || canDelete) && (
                      <div className="hidden group-hover:flex items-center gap-0.5 absolute -top-3 end-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] shadow-md px-1 py-0.5 z-10">
                        {settings.showQuickReply && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setEmojiPickerForId(emojiPickerForId === msg.id ? null : msg.id)
                              }
                              title={t(language, 'react')}
                              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300"
                            >
                              <SmilePlus className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTo(msg);
                                composerRef.current?.focus();
                              }}
                              title={t(language, 'reply')}
                              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300"
                            >
                              <CornerUpLeft className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMsgId(msg.id);
                              setEditingText(msg.content);
                            }}
                            title={t(language, 'edit')}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDeleteMessage(msg.id)}
                            title={t(language, 'delete')}
                            className="p-1.5 rounded hover:bg-rose-500/15 text-slate-600 dark:text-zinc-300 hover:text-rose-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Quick Emoji Picker Popover */}
                    {emojiPickerForId === msg.id && (
                      <div className="absolute top-6 end-3 z-20 flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] shadow-xl px-2 py-1.5">
                        {QUICK_EMOJIS.map((em) => {
                          const existing = msgReactions.find((r) => r.emoji === em);
                          return (
                            <button
                              key={em}
                              type="button"
                              onClick={() => {
                                onToggleReaction(msg.id, em, Boolean(existing?.reactedByMe));
                                setEmojiPickerForId(null);
                              }}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-base transition-transform hover:scale-110"
                            >
                              {em}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer Section */}
          <div className="px-3 sm:px-5 pb-4 pt-1 shrink-0 relative">
            {/* @Mention Autocomplete */}
            {mentionCandidates.length > 0 && (
              <div className="mb-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] shadow-xl overflow-hidden max-w-sm">
                {mentionCandidates.map((m) => (
                  <button
                    key={m.uid}
                    type="button"
                    onClick={() => insertMention(m.username)}
                    className="w-full px-3 py-2 flex items-center gap-2.5 text-start hover:bg-slate-100 dark:hover:bg-[#404249] transition-colors"
                  >
                    <UserAvatar src={m.avatarUrl} name={m.displayName} size="xs" />
                    <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {m.displayName}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                      @{m.username}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Reply Banner */}
            {replyTo && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-t-lg bg-slate-100 dark:bg-[#2B2D31] border-b border-slate-200 dark:border-white/10 text-xs">
                <span className="text-slate-600 dark:text-zinc-300 truncate">
                  {t(language, 'replyingTo')}{' '}
                  <strong className="text-slate-900 dark:text-white">{replyTo.authorName}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Pending File Preview */}
            {pendingFile && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-100 dark:bg-[#2B2D31] border-b border-slate-200 dark:border-white/10 rounded-t-lg">
                <div className="flex items-center gap-3 min-w-0">
                  {pendingPreviewUrl ? (
                    <img
                      src={pendingPreviewUrl}
                      alt={pendingFile.name}
                      className="w-12 h-12 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <FileText className="w-8 h-8 text-nexus shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
                      {pendingFile.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                      {(pendingFile.size / 1024).toFixed(1)} KB
                      {uploadProgress !== null ? ` · ${uploadProgress}%` : ''}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearPendingFile}
                  className="p-1 rounded text-slate-400 hover:text-rose-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Composer Box */}
            {isRecordingVoice ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                    {t(language, 'recordingVoiceNote')} (
                    {Math.floor(recordingSeconds / 60)}:
                    {(recordingSeconds % 60).toString().padStart(2, '0')})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1F22] text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    {t(language, 'cancelRecording')}
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>{t(language, 'sendVoiceNote')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`flex items-end gap-2 px-3 py-2 bg-slate-100 dark:bg-[#383A40] ${
                  replyTo || pendingFile ? 'rounded-b-lg' : 'rounded-lg'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title={t(language, 'attachFile')}
                  aria-label={t(language, 'attachFile')}
                  className="p-1.5 rounded-full text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shrink-0 mb-0.5"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={startVoiceRecording}
                  title={t(language, 'voiceNote')}
                  aria-label={t(language, 'voiceNote')}
                  className="p-1.5 rounded-full text-slate-500 dark:text-zinc-300 hover:text-nexus hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shrink-0 mb-0.5"
                >
                  <Mic className="w-5 h-5" />
                </button>

                <textarea
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`${t(language, 'typeMessage')} ${
                    mode === 'channel' ? `#${title}` : mode === 'group' ? title : `@${title}`
                  }`}
                  className="flex-1 bg-transparent resize-none max-h-36 py-1.5 text-sm text-slate-900 dark:text-[#F2F3F5] placeholder:text-slate-500 dark:placeholder:text-zinc-400 focus:outline-none"
                />

                <div className="relative shrink-0 mb-0.5">
                  <button
                    type="button"
                    onClick={() => setComposerEmojiOpen((v) => !v)}
                    title={t(language, 'react')}
                    className="p-1.5 rounded-full text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    aria-label="Insert emoji"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  {composerEmojiOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setComposerEmojiOpen(false)}
                      />
                      <div className="absolute bottom-11 end-0 z-30 w-64 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1F22] shadow-2xl p-2.5 grid grid-cols-8 gap-1">
                        {COMPOSER_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => {
                              const cursor = composerRef.current?.selectionStart ?? draft.length;
                              const next = (
                                draft.slice(0, cursor) +
                                em +
                                draft.slice(cursor)
                              ).slice(0, LIMITS.MESSAGE_MAX);
                              setDraft(next);
                              setComposerEmojiOpen(false);
                              composerRef.current?.focus();
                            }}
                            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-lg transition-transform hover:scale-110 flex items-center justify-center"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  disabled={sending || (!draft.trim() && !pendingFile)}
                  onClick={handleSubmit}
                  className="p-1.5 rounded-md bg-nexus hover:bg-nexus-hover disabled:opacity-40 text-white transition-colors shrink-0 mb-0.5"
                  aria-label="Send message"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}

            {/* Typing Indicator */}
            <div className="h-4 mt-1 px-1 text-[11px] text-slate-500 dark:text-zinc-400 flex items-center">
              {activeTypers.length === 1 && (
                <span>
                  <strong className="font-medium text-slate-700 dark:text-zinc-200">
                    {activeTypers[0].displayName}
                  </strong>{' '}
                  {t(language, 'isTyping')}
                </span>
              )}
              {activeTypers.length > 1 && (
                <span>
                  <strong className="font-medium text-slate-700 dark:text-zinc-200">
                    {activeTypers.map((u) => u.displayName).join(', ')}
                  </strong>{' '}
                  {t(language, 'areTyping')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Search Results Drawer */}
        {searchOpen && searchQuery.trim() && (
          <aside className="w-72 shrink-0 border-s border-slate-200 dark:border-black/25 bg-slate-50 dark:bg-[#2B2D31] flex flex-col">
            <div className="h-11 px-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200 tabular-nums">
                {t(language, 'searchResults')} ({searchResults.length})
              </span>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {searchResults.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-500 dark:text-zinc-400">
                  {t(language, 'noSearchResults')}
                </p>
              ) : (
                searchResults.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => scrollToMessage(m.id)}
                    className="w-full text-start p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#313338] hover:border-nexus transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {m.authorName}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                        {m.createdAt?.toMillis
                          ? formatShortDate(m.createdAt.toMillis(), dateOpts)
                          : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-zinc-300 line-clamp-3">
                      {m.content || m.attachmentName}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* External Link Safety Confirmation Modal */}
      {pendingExternalUrl && (
        <div
          onClick={() => setPendingExternalUrl(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <ExternalLink className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {t(language, 'externalLinkWarningTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    {t(language, 'externalLinkWarningDesc')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingExternalUrl(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 rounded-lg bg-slate-100 dark:bg-[#1E1F22] text-xs font-mono text-slate-700 dark:text-zinc-200 break-all">
              {pendingExternalUrl}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingExternalUrl(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/10"
              >
                {t(language, 'cancel')}
              </button>
              <a
                href={pendingExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingExternalUrl(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover text-white text-xs font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{t(language, 'visitExternalSite')}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 end-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/80"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Full preview"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
