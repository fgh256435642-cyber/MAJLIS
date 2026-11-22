import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePersistentBool } from '../hooks/useCollapsibleState';
import { useMessageNotifications } from '../hooks/useMessageNotifications';
import { useToast } from '../hooks/useToast';
import { useUserSettings } from '../hooks/useUserSettings';
import { useVoiceRTC } from '../hooks/useVoiceRTC';
import { t } from '../i18n/translations';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import {
  getNotificationPermission,
  type NotificationPermissionState,
  requestNotificationPermission,
} from '../services/notificationService';
import {
  addParticipantToCall,
  banMember,
  unbanMember,
  cleanupStaleJoinedServer,
  deleteChannel,
  deleteChannelMessage,
  deleteDmMessage,
  deleteGroupMessage,
  editChannelMessage,
  editDmMessage,
  editGroupMessage,
  endDmCall,
  getOrCreateDmThread,
  joinServerByInvite,
  kickGroupMember,
  kickMember,
  leaveGroupDm,
  leaveServer,
  logAuditAction,
  markChannelRead,
  markConversationRead,
  respondDmCall,
  sendChannelMessage,
  sendDmMessage,
  sendFriendRequest,
  sendGroupMessage,
  setChannelTyping,
  setDmTyping,
  setGroupTyping,
  startDmCall,
  toggleChannelReaction,
  toggleDmReaction,
  toggleGroupReaction,
  toggleMuteGroup,
  transferGroupOwnership,
  updateMemberRole,
} from '../services/majlisService';
import { ActiveCallOverlay } from './ActiveCallOverlay';
import { GroupMembersSidebar } from './GroupMembersSidebar';
import { CreateGroupModal, GroupSettingsModal } from './GroupModals';
import { IncomingCallModal } from './IncomingCallModal';
import { ModerationDashboardModal } from './ModerationDashboardModal';
import type {
  Channel,
  ChannelType,
  ChatMessage,
  ConversationReadReceipt,
  DirectCall,
  DirectMessageThread,
  Friendship,
  GroupDm,
  JoinedServerRef,
  MessageReaction,
  PublicUser,
  ReadState,
  Role,
  Server,
  ServerMember,
  SettingsCategoryId,
  TypingUser,
  VoiceParticipant,
} from '../types/majlis';
import { getGroupDisplayName, matchesShortcutEvent } from '../utils/validation';
import { ChatArea } from './ChatArea';
import { FriendsDashboard } from './FriendsDashboard';
import {
  DiscoverServersModal,
  QuickSwitcherModal,
} from './GlobalModals';
import { MembersSidebar } from './MembersSidebar';
import { PersistentSidebar } from './PersistentSidebar';
import {
  ChannelModal,
  CreateJoinServerModal,
  InviteModal,
  ServerSettingsModal,
} from './ServerModals';
import { FullScreenSettingsModal } from './settings/FullScreenSettingsModal';
import { VoiceStage } from './VoiceStage';

const PAGE_SIZE = 35;

export function MajlisWorkspace() {
  const { firebaseUser, userPrivate, publicUser, language, effectiveSelfStatus } = useAuth();
  const { settings, blockedUserIds, isEffectivelyDnd } = useUserSettings();
  const { pushToast } = useToast();
  const uid = firebaseUser!.uid;

  // Navigation state
  const [activeView, setActiveView] = useState<'home' | 'server'>('home');
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeDmId, setActiveDmId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileMembersOpen, setMobileMembersOpen] = useState(false);
  const [isLargeViewport, setIsLargeViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const membersTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const membersPanelKey =
    activeView === 'server' && activeServerId
      ? `majlis_members_panel_${activeServerId}`
      : activeView === 'home' && activeGroupId
      ? `majlis_members_panel_grp_${activeGroupId}`
      : 'majlis_members_panel_default';
  const [showMembersPanel, setShowMembersPanel] = usePersistentBool(
    membersPanelKey,
    true
  );

  const secondarySidebarKey =
    activeView === 'server' && activeServerId
      ? `majlis_secondary_open_${activeServerId}`
      : 'majlis_secondary_open_home';
  const [secondarySidebarOpen, setSecondarySidebarOpen] = usePersistentBool(
    secondarySidebarKey,
    true
  );

  // Modals state
  const [showCreateJoin, setShowCreateJoin] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupSettingsState, setGroupSettingsState] = useState<{
    open: boolean;
    tab: 'overview' | 'members' | 'add';
  }>({ open: false, tab: 'overview' });
  const [userSettingsTab, setUserSettingsTab] = useState<SettingsCategoryId | null>(
    null
  );
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [channelModalState, setChannelModalState] = useState<{
    open: boolean;
    editing: Channel | null;
    defaultType: ChannelType;
  }>({ open: false, editing: null, defaultType: 'text' });

  // Global Firestore collections
  const [joinedServers, setJoinedServers] = useState<JoinedServerRef[]>([]);
  const [readStates, setReadStates] = useState<Record<string, ReadState>>({});
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [dmThreads, setDmThreads] = useState<DirectMessageThread[]>([]);
  const [dmThreadsLoaded, setDmThreadsLoaded] = useState(false);
  const [groups, setGroups] = useState<GroupDm[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [mutedGroupIds, setMutedGroupIds] = useState<Set<string>>(() => new Set());
  const [usersById, setUsersById] = useState<Record<string, PublicUser>>({});
  const [notifPermission, setNotifPermission] =
    useState<NotificationPermissionState>(() => getNotificationPermission());
  const [notifPromptDismissed, setNotifPromptDismissed] = useState<boolean>(
    () => localStorage.getItem('majlis_notif_prompt_dismissed') === '1'
  );

  // Active server state
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [voiceParticipantsByChannel, setVoiceParticipantsByChannel] = useState<
    Record<string, VoiceParticipant[]>
  >({});
  const [showModerationModal, setShowModerationModal] = useState(false);

  // Active messages state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageLimit, setMessageLimit] = useState(PAGE_SIZE);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [readReceipts, setReadReceipts] = useState<ConversationReadReceipt[]>([]);
  const [liveUnreadCounts, setLiveUnreadCounts] = useState<Record<string, number>>({});
  const [convReadAtMs, setConvReadAtMs] = useState<Record<string, number>>({});
  const [serverOrder, setServerOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`majlis_server_order_${uid}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });

  const [incomingCall, setIncomingCall] = useState<DirectCall | null>(null);
  const [activeDmCall, setActiveDmCall] = useState<DirectCall | null>(null);
  const lastMarkedReceiptKeyRef = useRef<string | null>(null);

  const soundEnabled = settings.soundEnabled ?? userPrivate?.soundEnabled ?? true;
  const voiceConfig = useMemo(
    () => ({
      audioInputId: settings.audioInputId,
      audioOutputId: settings.audioOutputId,
      videoInputId: settings.videoInputId,
      voiceSensitivityAuto: settings.voiceSensitivityAuto,
      voiceSensitivityThreshold: settings.voiceSensitivityThreshold,
      noiseSuppression: settings.noiseSuppression,
      echoCancellation: settings.echoCancellation,
      autoGainControl: settings.autoGainControl,
      outputVolume: settings.outputVolume,
      cameraQuality: settings.cameraQuality,
      pushToTalkEnabled: settings.pushToTalkEnabled,
      pushToTalkKey: settings.pushToTalkKey,
      soundPreset: settings.notificationSound,
      soundVolume: settings.notificationVolume,
    }),
    [
      settings.audioInputId,
      settings.audioOutputId,
      settings.videoInputId,
      settings.voiceSensitivityAuto,
      settings.voiceSensitivityThreshold,
      settings.noiseSuppression,
      settings.echoCancellation,
      settings.autoGainControl,
      settings.outputVolume,
      settings.cameraQuality,
      settings.pushToTalkEnabled,
      settings.pushToTalkKey,
      settings.notificationSound,
      settings.notificationVolume,
    ]
  );
  const voice = useVoiceRTC(publicUser, soundEnabled, voiceConfig);
  const lastNotifiedMsgIdRef = useRef<string | null>(null);
  const handledInviteParamRef = useRef(false);
  const activeDmCallRef = useRef<DirectCall | null>(null);
  const activeVoiceSessionRef = useRef(voice.activeSession);
  activeDmCallRef.current = activeDmCall;
  activeVoiceSessionRef.current = voice.activeSession;

  const { notifyForMessage } = useMessageNotifications({
    uid,
    publicUser,
    language,
    joinedServers,
    dmThreads,
    dmThreadsLoaded,
    groups,
    groupsLoaded,
    mutedGroupIds,
    blockedUserIds,
    usersById,
    activeView,
    activeServerId,
    activeChannelId,
    activeDmId,
    activeGroupId,
    notificationsEnabled:
      (userPrivate?.notificationsEnabled ?? true) && settings.notificationMode !== 'none',
    soundEnabled,
    mentionsOnly:
      (userPrivate?.mentionsOnly ?? false) || settings.notificationMode === 'mentions',
    notificationMode: settings.notificationMode,
    notificationSound: settings.notificationSound,
    notificationVolume: settings.notificationVolume,
    dndScheduleEnabled: settings.dndScheduleEnabled,
    dndStartHour: settings.dndStartHour,
    dndEndHour: settings.dndEndHour,
    serverNotifications: settings.serverNotifications,
    channelMutes: settings.channelMutes,
    presenceStatus: isEffectivelyDnd ? 'dnd' : effectiveSelfStatus,
    onNavigate: (payload) => {
      if (payload.kind === 'dm' && payload.dmId) {
        setActiveView('home');
        setActiveGroupId(null);
        setActiveDmId(payload.dmId);
        setMobileNavOpen(false);
      } else if (payload.kind === 'group' && payload.groupId) {
        setActiveView('home');
        setActiveDmId(null);
        setActiveGroupId(payload.groupId);
        setMobileNavOpen(false);
      } else if (payload.kind === 'channel' && payload.serverId) {
        setActiveServerId(payload.serverId);
        if (payload.channelId) {
          setActiveChannelId(payload.channelId);
        }
        setActiveView('server');
        setMobileNavOpen(false);
      }
    },
    onUnreadMessage: ({ kind, id }) => {
      if (kind === 'dm' || kind === 'group') {
        const key = `${kind === 'dm' ? 'dm' : 'grp'}_${id}`;
        setLiveUnreadCounts((prev) => ({
          ...prev,
          [key]: (prev[key] || 0) + 1,
        }));
      }
    },
  });

  // Track lg breakpoint & Escape to close mobile members drawer
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLargeViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobileMembersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMembersOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMembersOpen]);

  useEffect(() => {
    setMobileMembersOpen(false);
  }, [activeView, activeServerId, activeChannelId, activeGroupId]);

  // Global customizable keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (isTyping && !hasModifier) return;

      const shortcuts = settings.shortcuts;
      if (matchesShortcutEvent(e, shortcuts.quickSwitcher)) {
        e.preventDefault();
        setShowQuickSwitcher((v) => !v);
      } else if (matchesShortcutEvent(e, shortcuts.toggleSidebar)) {
        e.preventDefault();
        setSecondarySidebarOpen((v) => !v);
      } else if (matchesShortcutEvent(e, shortcuts.openSettings)) {
        e.preventDefault();
        setUserSettingsTab((v) => (v ? null : 'account'));
      } else if (
        voice.activeSession &&
        matchesShortcutEvent(e, shortcuts.toggleMute)
      ) {
        e.preventDefault();
        void voice.toggleMute();
      } else if (
        voice.activeSession &&
        matchesShortcutEvent(e, shortcuts.toggleDeafen)
      ) {
        e.preventDefault();
        void voice.toggleDeafen();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [settings.shortcuts, setSecondarySidebarOpen, voice]);

  // Auto-handle ?invite=CODE URL param once publicUser is loaded
  useEffect(() => {
    if (!publicUser || handledInviteParamRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (!inviteCode) return;
    handledInviteParamRef.current = true;
    joinServerByInvite(uid, publicUser, inviteCode)
      .then((serverId) => {
        setActiveServerId(serverId);
        setActiveView('server');
        pushToast({ type: 'success', title: 'Joined server via invite!' });
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch((err) => {
        pushToast({
          type: 'error',
          title: 'Invite failed',
          description: err instanceof Error ? err.message : undefined,
        });
      });
  }, [publicUser, uid, pushToast]);

  // Core user-scoped listeners: joinedServers, readStates, friendships, dms
  useEffect(() => {
    const unsubServers = onSnapshot(
      collection(db, 'users', uid, 'joinedServers'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as JoinedServerRef)
          .sort((a, b) => (a.joinedAt?.toMillis?.() || 0) - (b.joinedAt?.toMillis?.() || 0));
        setJoinedServers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/joinedServers`)
    );

    const unsubReads = onSnapshot(
      collection(db, 'users', uid, 'readStates'),
      (snap) => {
        const map: Record<string, ReadState> = {};
        snap.docs.forEach((d) => {
          const rs = d.data() as ReadState;
          map[rs.channelId] = rs;
        });
        setReadStates(map);
      }
    );

    const unsubFriends = onSnapshot(
      query(collection(db, 'friendships'), where('participants', 'array-contains', uid)),
      (snap) => {
        setFriendships(snap.docs.map((d) => d.data() as Friendship));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendships')
    );

    const unsubDms = onSnapshot(
      query(collection(db, 'dms'), where('participants', 'array-contains', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as DirectMessageThread)
          .sort(
            (a, b) =>
              (b.lastMessageAt?.toMillis?.() || b.updatedAt?.toMillis?.() || 0) -
              (a.lastMessageAt?.toMillis?.() || a.updatedAt?.toMillis?.() || 0)
          );
        setDmThreads(list);
        setDmThreadsLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'dms')
    );

    const unsubGroups = onSnapshot(
      query(collection(db, 'groups'), where('memberIds', 'array-contains', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as GroupDm)
          .sort(
            (a, b) =>
              (b.lastMessageAt?.toMillis?.() || b.updatedAt?.toMillis?.() || 0) -
              (a.lastMessageAt?.toMillis?.() || a.updatedAt?.toMillis?.() || 0)
          );
        setGroups(list);
        setGroupsLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'groups')
    );

    const unsubMutedGroups = onSnapshot(
      collection(db, 'users', uid, 'mutedGroups'),
      (snap) => {
        setMutedGroupIds(new Set(snap.docs.map((d) => d.id)));
      }
    );

    return () => {
      unsubServers();
      unsubReads();
      unsubFriends();
      unsubDms();
      unsubGroups();
      unsubMutedGroups();
    };
  }, [uid]);

  // Clear activeGroupId if user is kicked or leaves the group
  useEffect(() => {
    if (groupsLoaded && activeGroupId && !groups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(null);
      setGroupSettingsState({ open: false, tab: 'overview' });
    }
  }, [groupsLoaded, groups, activeGroupId]);

  // Global listener for incoming DM / group calls
  useEffect(() => {
    const callsQuery = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', uid),
      where('status', 'in', ['ringing', 'active'])
    );

    const unsubCalls = onSnapshot(
      callsQuery,
      (snap) => {
        const calls = snap.docs.map((d) => d.data() as DirectCall);
        const currentCallId = activeDmCallRef.current?.id;

        const invited = calls.find(
          (c) =>
            c.id !== currentCallId &&
            c.callerId !== uid &&
            !(c.activeParticipants || []).includes(uid)
        );

        if (invited) {
          if (activeVoiceSessionRef.current || activeDmCallRef.current) {
            if (invited.status === 'ringing') {
              void updateDoc(doc(db, 'calls', invited.id), {
                status: 'busy',
                endedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          } else {
            setIncomingCall(invited);
          }
        } else {
          setIncomingCall((prev) => {
            if (!prev) return null;
            const stillPending = calls.some(
              (c) => c.id === prev.id && !(c.activeParticipants || []).includes(uid)
            );
            return stillPending ? prev : null;
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'calls')
    );

    return () => unsubCalls();
  }, [uid]);

  // Listen to active DM call status transitions (accept / decline / busy / end / missed)
  const activeDmCallId = activeDmCall?.id || null;
  useEffect(() => {
    if (!activeDmCallId) return;

    const unsubCall = onSnapshot(doc(db, 'calls', activeDmCallId), (snap) => {
      if (!snap.exists()) {
        setActiveDmCall(null);
        void voice.leaveVoice();
        return;
      }
      const data = snap.data() as DirectCall;
      setActiveDmCall(data);

      if (
        data.status === 'ended' ||
        data.status === 'declined' ||
        data.status === 'missed' ||
        data.status === 'busy'
      ) {
        if (data.callerId === uid) {
          if (data.status === 'declined') {
            pushToast({ type: 'info', title: t(language, 'callDeclined') });
          } else if (data.status === 'busy') {
            pushToast({ type: 'info', title: t(language, 'userBusy') });
          } else if (data.status === 'missed') {
            pushToast({ type: 'info', title: t(language, 'callUnanswered') });
          }
        }
        setActiveDmCall(null);
        void voice.leaveVoice(`call-${data.status}`);
      }
    });

    return () => unsubCall();
  }, [activeDmCallId, uid, language, pushToast, voice.leaveVoice]);

  // Caller 30s timeout if recipient does not answer
  useEffect(() => {
    if (!activeDmCall || activeDmCall.callerId !== uid || activeDmCall.status !== 'ringing') {
      return;
    }
    const timer = window.setTimeout(() => {
      if (publicUser) {
        void endDmCall(activeDmCall.id, activeDmCall.dmId, publicUser, 0, 'missed');
      }
    }, 31_000);
    return () => window.clearTimeout(timer);
  }, [activeDmCall?.id, activeDmCall?.status, activeDmCall?.callerId, activeDmCall?.dmId, uid, publicUser]);

  // Live publicUsers listeners for members, friends, DM contacts, and Group DM members
  const trackedUserIds = useMemo(() => {
    const set = new Set<string>([uid]);
    members.forEach((m) => set.add(m.uid));
    friendships.forEach((f) => f.participants.forEach((p) => set.add(p)));
    dmThreads.forEach((d) => d.participants.forEach((p) => set.add(p)));
    groups.forEach((g) => g.memberIds.forEach((p) => set.add(p)));
    return Array.from(set).sort();
  }, [uid, members, friendships, dmThreads, groups]);

  useEffect(() => {
    const unsubs = trackedUserIds.map((targetId) =>
      onSnapshot(doc(db, 'publicUsers', targetId), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PublicUser;
          setUsersById((prev) => ({ ...prev, [targetId]: data }));
        }
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [trackedUserIds.join(',')]);

  // Active server listeners (server doc, channels, members)
  useEffect(() => {
    if (activeView !== 'server' || !activeServerId) {
      setActiveServer(null);
      setChannels([]);
      setMembers([]);
      return;
    }

    const unsubServer = onSnapshot(
      doc(db, 'servers', activeServerId),
      (snap) => {
        if (!snap.exists()) {
          cleanupStaleJoinedServer(uid, activeServerId);
          setActiveView('home');
          setActiveServerId(null);
          return;
        }
        setActiveServer(snap.data() as Server);
      },
      () => {
        // User was kicked/banned or server deleted
        cleanupStaleJoinedServer(uid, activeServerId);
        setActiveView('home');
        setActiveServerId(null);
      }
    );

    const unsubChannels = onSnapshot(
      query(
        collection(db, 'servers', activeServerId, 'channels'),
        orderBy('position', 'asc')
      ),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Channel);
        setChannels(list);
      },
      () => {
        setChannels([]);
      }
    );

    const unsubMembers = onSnapshot(
      collection(db, 'servers', activeServerId, 'members'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ServerMember);
        setMembers(list);
        const me = list.find((m) => m.uid === uid);
        if (!me && snap.metadata.fromCache === false) {
          // Membership removed (kicked/banned)
          cleanupStaleJoinedServer(uid, activeServerId);
        }
      },
      () => {
        setMembers([]);
      }
    );

    return () => {
      unsubServer();
      unsubChannels();
      unsubMembers();
    };
  }, [activeView, activeServerId, uid]);

  // Auto-select first text channel when entering a server
  useEffect(() => {
    if (activeView !== 'server' || channels.length === 0) return;
    const exists = channels.some((c) => c.id === activeChannelId);
    if (!exists) {
      const preferred =
        channels.find((c) => c.id === activeServer?.defaultChannelId) ||
        channels.find((c) => c.type === 'text') ||
        channels[0];
      if (preferred) setActiveChannelId(preferred.id);
    }
  }, [activeView, channels, activeChannelId, activeServer?.defaultChannelId]);

  // Voice participants listeners for all voice channels in active server
  const voiceChannelIdsKey = useMemo(
    () =>
      channels
        .filter((c) => c.type === 'voice')
        .map((c) => c.id)
        .join(','),
    [channels]
  );

  useEffect(() => {
    if (activeView !== 'server' || !activeServerId || !voiceChannelIdsKey) {
      setVoiceParticipantsByChannel({});
      return;
    }
    const ids = voiceChannelIdsKey.split(',').filter(Boolean);
    const unsubs = ids.map((chId) =>
      onSnapshot(
        collection(db, 'servers', activeServerId, 'channels', chId, 'voiceParticipants'),
        (snap) => {
          setVoiceParticipantsByChannel((prev) => ({
            ...prev,
            [chId]: snap.docs.map((d) => d.data() as VoiceParticipant),
          }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [activeView, activeServerId, voiceChannelIdsKey]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) || null,
    [channels, activeChannelId]
  );

  const activeDmThread = useMemo(
    () => dmThreads.find((d) => d.id === activeDmId) || null,
    [dmThreads, activeDmId]
  );

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) || null,
    [groups, activeGroupId]
  );

  const activeGroupMembers = useMemo(
    () =>
      activeGroup
        ? activeGroup.memberIds
            .map((id) => usersById[id])
            .filter((u): u is PublicUser => Boolean(u))
        : [],
    [activeGroup, usersById]
  );

  const activeChatScopeKey =
    activeView === 'server' && activeServerId && activeChannel?.type === 'text'
      ? `ch:${activeServerId}:${activeChannel.id}`
      : activeView === 'home' && activeDmId
      ? `dm:${activeDmId}`
      : activeView === 'home' && activeGroupId && activeGroup
      ? `grp:${activeGroupId}`
      : null;

  // Reset pagination when active chat changes
  useEffect(() => {
    setMessageLimit(PAGE_SIZE);
    setMessages([]);
    setReactions([]);
    setTypingUsers([]);
    setReadReceipts([]);
    setHasMoreMessages(false);
    lastNotifiedMsgIdRef.current = null;
    lastMarkedReceiptKeyRef.current = null;
  }, [activeChatScopeKey]);

  // Mark channel as read when opening or receiving messages
  useEffect(() => {
    if (activeView === 'server' && activeServerId && activeChannel?.type === 'text') {
      markChannelRead(uid, activeServerId, activeChannel.id);
    }
  }, [activeView, activeServerId, activeChannel?.id, activeChannel?.type, messages.length, uid]);

  // Clear live unread count when opening a DM or Group DM
  useEffect(() => {
    if (activeView !== 'home') return;
    if (activeDmId) {
      setLiveUnreadCounts((prev) => {
        if (!prev[`dm_${activeDmId}`]) return prev;
        const next = { ...prev };
        delete next[`dm_${activeDmId}`];
        return next;
      });
    } else if (activeGroupId) {
      setLiveUnreadCounts((prev) => {
        if (!prev[`grp_${activeGroupId}`]) return prev;
        const next = { ...prev };
        delete next[`grp_${activeGroupId}`];
        return next;
      });
    }
  }, [activeView, activeDmId, activeGroupId]);

  // Listen to own readReceipts for recent DMs & Groups so unread badges persist across reloads
  const trackedDmReadIdsKey = useMemo(
    () =>
      dmThreads
        .slice(0, 12)
        .map((d) => d.id)
        .join(','),
    [dmThreads]
  );
  const trackedGroupReadIdsKey = useMemo(
    () =>
      groups
        .slice(0, 12)
        .map((g) => g.id)
        .join(','),
    [groups]
  );

  useEffect(() => {
    const dmIds = trackedDmReadIdsKey.split(',').filter(Boolean);
    const groupIds = trackedGroupReadIdsKey.split(',').filter(Boolean);
    const unsubs: (() => void)[] = [];

    dmIds.forEach((dmId) => {
      unsubs.push(
        onSnapshot(doc(db, 'dms', dmId, 'readReceipts', uid), (snap) => {
          const data = snap.data() as ConversationReadReceipt | undefined;
          const ms = data?.lastReadAt?.toMillis?.() || 0;
          setConvReadAtMs((prev) =>
            prev[`dm_${dmId}`] === ms ? prev : { ...prev, [`dm_${dmId}`]: ms }
          );
        })
      );
    });

    groupIds.forEach((groupId) => {
      unsubs.push(
        onSnapshot(doc(db, 'groups', groupId, 'readReceipts', uid), (snap) => {
          const data = snap.data() as ConversationReadReceipt | undefined;
          const ms = data?.lastReadAt?.toMillis?.() || 0;
          setConvReadAtMs((prev) =>
            prev[`grp_${groupId}`] === ms ? prev : { ...prev, [`grp_${groupId}`]: ms }
          );
        })
      );
    });

    return () => unsubs.forEach((u) => u());
  }, [trackedDmReadIdsKey, trackedGroupReadIdsKey, uid]);

  // Mark DM / Group DM conversation as read when visible and latest message is shown
  useEffect(() => {
    if (
      activeView !== 'home' ||
      !activeChatScopeKey ||
      (!activeChatScopeKey.startsWith('dm:') && !activeChatScopeKey.startsWith('grp:')) ||
      messages.length === 0
    ) {
      return;
    }

    const scope: 'dm' | 'group' = activeChatScopeKey.startsWith('dm:') ? 'dm' : 'group';
    const convId = scope === 'dm' ? activeDmId : activeGroupId;
    const latestMsg = messages[messages.length - 1];
    if (!convId || !latestMsg?.id) return;

    const tryMarkRead = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const convKey = `${scope === 'dm' ? 'dm' : 'grp'}_${convId}`;
      setLiveUnreadCounts((prev) => {
        if (!prev[convKey]) return prev;
        const next = { ...prev };
        delete next[convKey];
        return next;
      });
      const myReceipt = readReceipts.find((r) => r.userId === uid);
      if (myReceipt?.lastReadMessageId === latestMsg.id) return;
      const markKey = `${activeChatScopeKey}:${latestMsg.id}`;
      if (lastMarkedReceiptKeyRef.current === markKey) return;
      lastMarkedReceiptKeyRef.current = markKey;
      void markConversationRead(scope, convId, uid, latestMsg.id);
      void markChannelRead(uid, scope === 'dm' ? 'dm_home' : 'group_home', convKey);
    };

    tryMarkRead();
    window.addEventListener('focus', tryMarkRead);
    document.addEventListener('visibilitychange', tryMarkRead);
    return () => {
      window.removeEventListener('focus', tryMarkRead);
      document.removeEventListener('visibilitychange', tryMarkRead);
    };
  }, [activeView, activeChatScopeKey, activeDmId, activeGroupId, messages, readReceipts, uid]);

  // Active text chat / DM messages + reactions + typing + readReceipts listeners
  useEffect(() => {
    if (!activeChatScopeKey) return;

    setMessagesLoading((prev) => (messages.length === 0 ? true : prev));

    let msgsQuery;
    let reactionsCol;
    let typingCol;
    let readReceiptsCol: ReturnType<typeof collection> | null = null;
    let errorPath = '';

    if (activeChatScopeKey.startsWith('ch:') && activeServerId && activeChannel) {
      errorPath = `servers/${activeServerId}/channels/${activeChannel.id}/messages`;
      msgsQuery = query(
        collection(db, 'servers', activeServerId, 'channels', activeChannel.id, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(messageLimit)
      );
      reactionsCol = collection(
        db,
        'servers',
        activeServerId,
        'channels',
        activeChannel.id,
        'reactions'
      );
      typingCol = collection(
        db,
        'servers',
        activeServerId,
        'channels',
        activeChannel.id,
        'typing'
      );
    } else if (activeChatScopeKey.startsWith('dm:') && activeDmId) {
      errorPath = `dms/${activeDmId}/messages`;
      msgsQuery = query(
        collection(db, 'dms', activeDmId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(messageLimit)
      );
      reactionsCol = collection(db, 'dms', activeDmId, 'reactions');
      typingCol = collection(db, 'dms', activeDmId, 'typing');
      readReceiptsCol = collection(db, 'dms', activeDmId, 'readReceipts');
    } else if (activeChatScopeKey.startsWith('grp:') && activeGroupId) {
      errorPath = `groups/${activeGroupId}/messages`;
      msgsQuery = query(
        collection(db, 'groups', activeGroupId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(messageLimit)
      );
      reactionsCol = collection(db, 'groups', activeGroupId, 'reactions');
      typingCol = collection(db, 'groups', activeGroupId, 'typing');
      readReceiptsCol = collection(db, 'groups', activeGroupId, 'readReceipts');
    } else {
      return;
    }

    const unsubMsgs = onSnapshot(
      msgsQuery,
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as ChatMessage).reverse();
        setHasMoreMessages(snap.docs.length >= messageLimit);
        setMessages(docs);
        setMessagesLoading(false);
        setLoadingMore(false);

        const latest = docs[docs.length - 1];
        if (
          latest &&
          latest.id !== lastNotifiedMsgIdRef.current &&
          lastNotifiedMsgIdRef.current !== null &&
          latest.authorId !== uid
        ) {
          if (activeChatScopeKey.startsWith('ch:') && activeServer && activeChannel) {
            notifyForMessage(latest, {
              kind: 'channel',
              serverId: activeServer.id,
              serverName: activeServer.name,
              channelId: activeChannel.id,
              channelName: activeChannel.name,
            });
          } else if (activeChatScopeKey.startsWith('dm:') && activeDmId) {
            notifyForMessage(latest, {
              kind: 'dm',
              dmId: activeDmId,
            });
          } else if (activeChatScopeKey.startsWith('grp:') && activeGroupId && activeGroup) {
            notifyForMessage(latest, {
              kind: 'group',
              groupId: activeGroupId,
              groupName: getGroupDisplayName(activeGroup, usersById, uid, language),
            });
          }
        }
        if (latest) {
          lastNotifiedMsgIdRef.current = latest.id;
        }
      },
      (err) => {
        setMessagesLoading(false);
        setLoadingMore(false);
        handleFirestoreError(err, OperationType.LIST, errorPath);
      }
    );

    const unsubReactions = onSnapshot(reactionsCol, (snap) => {
      setReactions(snap.docs.map((d) => d.data() as MessageReaction));
    });

    const unsubTyping = onSnapshot(typingCol, (snap) => {
      setTypingUsers(snap.docs.map((d) => d.data() as TypingUser));
    });

    const unsubReadReceipts = readReceiptsCol
      ? onSnapshot(readReceiptsCol, (snap) => {
          setReadReceipts(snap.docs.map((d) => d.data() as ConversationReadReceipt));
        })
      : undefined;

    return () => {
      unsubMsgs();
      unsubReactions();
      unsubTyping();
      unsubReadReceipts?.();
    };
  }, [activeChatScopeKey, messageLimit, uid]);

  // Compute unread channels in current server
  const unreadChannelIds = useMemo(() => {
    const set = new Set<string>();
    for (const ch of channels) {
      if (ch.type !== 'text' || !ch.lastMessageAt) continue;
      const lastMsgMs = ch.lastMessageAt.toMillis?.() || 0;
      const lastReadMs = readStates[ch.id]?.lastReadAt?.toMillis?.() || 0;
      if (lastMsgMs > lastReadMs) {
        set.add(ch.id);
      }
    }
    return set;
  }, [channels, readStates]);

  const unreadServerIds = useMemo(() => {
    const set = new Set<string>();
    if (activeServerId && unreadChannelIds.size > 0) {
      set.add(activeServerId);
    }
    return set;
  }, [activeServerId, unreadChannelIds]);

  const unreadCountsByConv = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const dm of dmThreads) {
      const key = `dm_${dm.id}`;
      const isActive = activeView === 'home' && activeDmId === dm.id;
      if (isActive) {
        counts[key] = 0;
        continue;
      }
      const live = liveUnreadCounts[key] || 0;
      if (live > 0) {
        counts[key] = live;
        continue;
      }
      const lastMsgMs = dm.lastMessageAt?.toMillis?.() || 0;
      const lastReadMs = Math.max(
        convReadAtMs[key] || 0,
        readStates[key]?.lastReadAt?.toMillis?.() || 0
      );
      if (lastMsgMs > 0 && lastMsgMs > lastReadMs) {
        counts[key] = 1;
      }
    }
    for (const grp of groups) {
      const key = `grp_${grp.id}`;
      const isActive = activeView === 'home' && activeGroupId === grp.id;
      if (isActive) {
        counts[key] = 0;
        continue;
      }
      const live = liveUnreadCounts[key] || 0;
      if (live > 0) {
        counts[key] = live;
        continue;
      }
      const lastMsgMs = grp.lastMessageAt?.toMillis?.() || 0;
      const lastReadMs = Math.max(
        convReadAtMs[key] || 0,
        readStates[key]?.lastReadAt?.toMillis?.() || 0
      );
      if (lastMsgMs > 0 && lastMsgMs > lastReadMs) {
        counts[key] = 1;
      }
    }
    return counts;
  }, [
    dmThreads,
    groups,
    activeView,
    activeDmId,
    activeGroupId,
    liveUnreadCounts,
    convReadAtMs,
    readStates,
  ]);

  const orderedJoinedServers = useMemo(() => {
    if (serverOrder.length === 0) return joinedServers;
    const rankMap = new Map<string, number>();
    serverOrder.forEach((id, idx) => rankMap.set(id, idx));
    return [...joinedServers].sort((a, b) => {
      const ra = rankMap.get(a.serverId);
      const rb = rankMap.get(b.serverId);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return (a.joinedAt?.toMillis?.() || 0) - (b.joinedAt?.toMillis?.() || 0);
    });
  }, [joinedServers, serverOrder]);

  const handleReorderServers = useCallback(
    (fromServerId: string, toServerId: string, position: 'before' | 'after') => {
      if (fromServerId === toServerId) return;
      const currentIds = orderedJoinedServers.map((s) => s.serverId);
      const fromIdx = currentIds.indexOf(fromServerId);
      if (fromIdx === -1) return;
      currentIds.splice(fromIdx, 1);
      const targetIdx = currentIds.indexOf(toServerId);
      if (targetIdx === -1) return;
      const insertAt = position === 'after' ? targetIdx + 1 : targetIdx;
      currentIds.splice(insertAt, 0, fromServerId);
      setServerOrder(currentIds);
      try {
        localStorage.setItem(`majlis_server_order_${uid}`, JSON.stringify(currentIds));
      } catch {
        // Ignore storage quota errors
      }
    },
    [orderedJoinedServers, uid]
  );

  const pendingFriendCount = useMemo(
    () =>
      friendships.filter((f) => f.status === 'pending' && f.recipientId === uid)
        .length,
    [friendships, uid]
  );

  const myMemberRecord = useMemo(
    () => members.find((m) => m.uid === uid) || null,
    [members, uid]
  );
  const myRole: Role = myMemberRecord?.role || 'member';

  const handleLoadOlder = useCallback(() => {
    if (loadingMore || !hasMoreMessages) return;
    setLoadingMore(true);
    setMessageLimit((prev) => prev + PAGE_SIZE);
  }, [loadingMore, hasMoreMessages]);

  const handleStartDm = async (targetUid: string) => {
    try {
      const thread = await getOrCreateDmThread(uid, targetUid);
      setActiveView('home');
      setActiveGroupId(null);
      setActiveDmId(thread.id);
      setMobileNavOpen(false);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const friendly =
        code === 'USER_IS_BLOCKED'
          ? t(language, 'errorUserBlocked')
          : code === 'DM_FRIENDS_ONLY'
          ? t(language, 'errorDmFriendsOnly')
          : code;
      pushToast({
        type: 'error',
        title: t(language, 'couldNotOpenDm'),
        description: friendly || undefined,
      });
    }
  };

  const handleAddFriendFromPopover = async (username: string) => {
    try {
      await sendFriendRequest(uid, username);
      pushToast({ type: 'success', title: `${t(language, 'friendRequestSent')}: @${username}` });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const friendly =
        code === 'USER_IS_BLOCKED'
          ? t(language, 'errorUserBlocked')
          : code === 'FRIEND_REQUEST_RESTRICTED'
          ? t(language, 'errorFriendRequestRestricted')
          : code;
      pushToast({
        type: 'error',
        title: t(language, 'couldNotAddFriend'),
        description: friendly || undefined,
      });
    }
  };

  const joinedServerIds = useMemo(
    () => new Set(joinedServers.map((s) => s.serverId)),
    [joinedServers]
  );

  const otherDmUid =
    activeDmThread?.participants.find((id) => id !== uid) || '';
  const otherDmUser = usersById[otherDmUid];

  const handleStartDmCall = async (callType: 'audio' | 'video') => {
    if (!publicUser || !activeDmId || !otherDmUser) return;
    if (blockedUserIds.has(otherDmUser.uid)) {
      pushToast({ type: 'error', title: t(language, 'errorUserBlocked') });
      return;
    }
    if (voice.activeSession || activeDmCall) {
      pushToast({ type: 'error', title: t(language, 'alreadyInCall') });
      return;
    }
    try {
      const callId = await startDmCall(activeDmId, publicUser, otherDmUser, callType);
      await voice.joinVoice({
        kind: 'call',
        callId,
        callName: otherDmUser.displayName,
        dmId: activeDmId,
        callType,
      });
      setActiveDmCall({
        id: callId,
        dmId: activeDmId,
        callerId: publicUser.uid,
        callerName: publicUser.displayName,
        callerAvatar: publicUser.avatarUrl || '',
        participants: [publicUser.uid, otherDmUser.uid],
        activeParticipants: [publicUser.uid],
        type: callType,
        status: 'ringing',
        createdAt: publicUser.updatedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'USER_BUSY') {
        pushToast({ type: 'info', title: t(language, 'userBusy') });
      } else if (msg === 'ALREADY_IN_CALL') {
        pushToast({ type: 'error', title: t(language, 'alreadyInCall') });
      } else {
        pushToast({
          type: 'error',
          title: t(language, 'errorGeneric'),
          description: msg || undefined,
        });
      }
    }
  };

  const handleStartGroupCall = async (callType: 'audio' | 'video') => {
    if (!publicUser || !activeGroup) return;
    if (voice.activeSession || activeDmCall) {
      pushToast({ type: 'error', title: t(language, 'alreadyInCall') });
      return;
    }
    const groupTitle = getGroupDisplayName(activeGroup, usersById, uid, language);
    try {
      const callId = await startDmCall(
        activeGroup.id,
        publicUser,
        activeGroup.memberIds,
        callType,
        { isGroup: true, groupName: groupTitle }
      );
      await voice.joinVoice({
        kind: 'call',
        callId,
        callName: groupTitle,
        dmId: activeGroup.id,
        callType,
      });
      setActiveDmCall({
        id: callId,
        dmId: activeGroup.id,
        callerId: publicUser.uid,
        callerName: publicUser.displayName,
        callerAvatar: publicUser.avatarUrl || '',
        participants: activeGroup.memberIds,
        activeParticipants: [publicUser.uid],
        type: callType,
        status: 'ringing',
        isGroup: true,
        groupName: groupTitle,
        createdAt: publicUser.updatedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'ALREADY_IN_CALL') {
        pushToast({ type: 'error', title: t(language, 'alreadyInCall') });
      } else {
        pushToast({
          type: 'error',
          title: t(language, 'errorGeneric'),
          description: msg || undefined,
        });
      }
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-elevated dark:bg-elevated text-text dark:text-text">
      <PersistentSidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        secondaryOpen={secondarySidebarOpen}
        onToggleSecondaryOpen={() => setSecondarySidebarOpen((v) => !v)}
        joinedServers={orderedJoinedServers}
        activeView={activeView}
        activeServer={activeServer}
        activeServerId={activeServerId}
        channels={channels}
        activeChannelId={activeChannel?.id || null}
        myRole={myRole}
        unreadServerIds={unreadServerIds}
        unreadChannelIds={unreadChannelIds}
        unreadCountsByConv={unreadCountsByConv}
        pendingFriendCount={pendingFriendCount}
        dmThreads={dmThreads}
        activeDmId={activeDmId}
        groups={groups}
        activeGroupId={activeGroupId}
        mutedGroupIds={mutedGroupIds}
        usersById={usersById}
        members={members}
        publicUser={publicUser}
        voiceParticipantsByChannel={voiceParticipantsByChannel}
        activeVoiceSession={voice.activeSession}
        voiceConnectionStatus={voice.connectionStatus}
        voiceMuted={voice.muted}
        voiceDeafened={voice.deafened}
        localSpeaking={voice.localSpeaking}
        remoteSpeaking={voice.remoteSpeaking}
        onToggleMute={voice.toggleMute}
        onToggleDeafen={voice.toggleDeafen}
        onLeaveVoice={voice.leaveVoice}
        onSelectHome={() => {
          setActiveView('home');
          setActiveDmId(null);
          setActiveGroupId(null);
        }}
        onSelectServer={(sId) => {
          setActiveServerId(sId);
          setActiveView('server');
        }}
        onReorderServers={handleReorderServers}
        onSelectChannel={(ch) => setActiveChannelId(ch.id)}
        onSelectFriends={() => {
          setActiveView('home');
          setActiveDmId(null);
          setActiveGroupId(null);
        }}
        onSelectDm={(dmId) => {
          setActiveView('home');
          setActiveGroupId(null);
          setActiveDmId(dmId);
        }}
        onSelectGroup={(groupId) => {
          setActiveDmId(null);
          setActiveGroupId(groupId);
          setActiveView('home');
          setMobileNavOpen(false);
        }}
        onOpenCreateGroup={() => setShowCreateGroup(true)}
        onStartDm={handleStartDm}
        onAddFriend={handleAddFriendFromPopover}
        onOpenCreateJoin={() => setShowCreateJoin(true)}
        onOpenDiscover={() => setShowDiscover(true)}
        onOpenQuickSwitcher={() => setShowQuickSwitcher(true)}
        onOpenCreateChannel={(defaultType) =>
          setChannelModalState({ open: true, editing: null, defaultType })
        }
        onEditChannel={(ch) =>
          setChannelModalState({ open: true, editing: ch, defaultType: ch.type })
        }
        onDeleteChannel={async (ch) => {
          if (!activeServer) return;
          try {
            await deleteChannel(activeServer.id, ch.id);
            pushToast({ type: 'info', title: `Deleted #${ch.name}` });
          } catch (err) {
            pushToast({
              type: 'error',
              title: 'Delete failed',
              description: err instanceof Error ? err.message : undefined,
            });
          }
        }}
        onOpenInvite={() => setShowInviteModal(true)}
        onOpenServerSettings={() => setShowServerSettings(true)}
        onOpenModerationDashboard={() => setShowModerationModal(true)}
        onLeaveServer={async () => {
          if (!activeServer) return;
          try {
            await leaveServer(uid, activeServer);
            pushToast({ type: 'info', title: `Left ${activeServer.name}` });
            setActiveView('home');
            setActiveServerId(null);
          } catch (err) {
            pushToast({
              type: 'error',
              title: 'Could not leave server',
              description: err instanceof Error ? err.message : undefined,
            });
          }
        }}
        onOpenUserSettings={(tab = 'account') => setUserSettingsTab(tab)}
      />

      {/* Center Content Viewport */}
      <main className="flex-1 min-w-0 h-full flex flex-col">
        {notifPermission === 'default' &&
          (userPrivate?.notificationsEnabled ?? true) &&
          !notifPromptDismissed && (
            <div className="px-4 py-2 bg-accent/10 border-accent border-accent flex items-center justify-between gap-3 text-link shrink-0">
              <div className="flex items-center gap-2 min-w-0 text-text dark:text-text">
                <Bell className="w-4 h-4 text-link shrink-0" />
                <span className="truncate">
                  {t(language, 'browserNotificationsPrompt')}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await requestNotificationPermission();
                    setNotifPermission(res);
                  }}
                  className="px-2.5 py-1 rounded-md bg-accent hover:bg-majlis-hover text-text font-semibold transition-colors"
                >
                  {t(language, 'enableBrowserNotifications')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifPromptDismissed(true);
                    localStorage.setItem('majlis_notif_prompt_dismissed', '1');
                  }}
                  aria-label={t(language, 'cancel')}
                  className="p-1 rounded text-text-muted hover:text-text dark:text-text-muted dark:hover:text-text transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

        <div className="flex-1 min-h-0 flex">
        {activeView === 'home' ? (
          activeDmId && activeDmThread ? (
            <ChatArea
              mode="dm"
              title={otherDmUser?.displayName || t(language, 'directMessage')}
              subtitle={otherDmUser?.username ? `@${otherDmUser.username}` : undefined}
              dmRecipient={otherDmUser}
              storageScopeId={`dm_${activeDmId}`}
              channelOrDmId={activeDmId}
              messages={messages}
              loading={messagesLoading}
              hasMore={hasMoreMessages}
              loadingMore={loadingMore}
              reactions={reactions}
              typingUsers={typingUsers}
              readReceipts={readReceipts}
              usersById={usersById}
              myUid={uid}
              myUsername={publicUser?.username || ''}
              sidebarCollapsed={!secondarySidebarOpen}
              onExpandSidebar={() => setSecondarySidebarOpen(true)}
              onOpenMobileSidebar={() => setMobileNavOpen(true)}
              onLoadOlder={handleLoadOlder}
              onSendMessage={async (payload) => {
                if (!publicUser) return;
                await sendDmMessage(activeDmId, publicUser, payload);
              }}
              onEditMessage={(mId, content) => editDmMessage(activeDmId, mId, content)}
              onDeleteMessage={(mId) => deleteDmMessage(activeDmId, mId)}
              onToggleReaction={(mId, emoji, reacted) =>
                toggleDmReaction(activeDmId, mId, uid, emoji, reacted)
              }
              onTypingChange={(typing) => {
                if (!publicUser) return;
                setDmTyping(activeDmId, uid, publicUser.displayName, typing);
              }}
              onStartDmCall={handleStartDmCall}
            />
          ) : activeGroupId && activeGroup ? (
            <>
              <ChatArea
                mode="group"
                title={getGroupDisplayName(activeGroup, usersById, uid, language)}
                group={activeGroup}
                groupMembers={activeGroupMembers}
                isGroupMuted={mutedGroupIds.has(activeGroup.id)}
                onToggleMuteGroup={async () => {
                  const nextMuted = !mutedGroupIds.has(activeGroup.id);
                  await toggleMuteGroup(uid, activeGroup.id, nextMuted);
                  pushToast({
                    type: 'info',
                    title: nextMuted ? t(language, 'groupMuted') : t(language, 'groupUnmuted'),
                  });
                }}
                onOpenGroupSettings={() =>
                  setGroupSettingsState({ open: true, tab: 'overview' })
                }
                storageScopeId={`grp_${activeGroup.id}`}
                channelOrDmId={activeGroup.id}
                messages={messages}
                loading={messagesLoading}
                hasMore={hasMoreMessages}
                loadingMore={loadingMore}
                reactions={reactions}
                typingUsers={typingUsers}
                readReceipts={readReceipts}
                usersById={usersById}
                myUid={uid}
                myUsername={publicUser?.username || ''}
                showMembersPanel={
                  isLargeViewport ? showMembersPanel : mobileMembersOpen
                }
                onToggleMembersPanel={() => {
                  if (window.innerWidth >= 1024) {
                    setShowMembersPanel((v) => !v);
                  } else {
                    setMobileMembersOpen((v) => !v);
                  }
                }}
                sidebarCollapsed={!secondarySidebarOpen}
                onExpandSidebar={() => setSecondarySidebarOpen(true)}
                onOpenMobileSidebar={() => setMobileNavOpen(true)}
                onLoadOlder={handleLoadOlder}
                onSendMessage={async (payload) => {
                  if (!publicUser) return;
                  await sendGroupMessage(activeGroup.id, publicUser, payload);
                }}
                onEditMessage={(mId, content) => editGroupMessage(activeGroup.id, mId, content)}
                onDeleteMessage={(mId) => deleteGroupMessage(activeGroup.id, mId)}
                onToggleReaction={(mId, emoji, reacted) =>
                  toggleGroupReaction(activeGroup.id, mId, uid, emoji, reacted)
                }
                onTypingChange={(typing) => {
                  if (!publicUser) return;
                  setGroupTyping(activeGroup.id, uid, publicUser.displayName, typing);
                }}
                onStartDmCall={handleStartGroupCall}
              />

              {/* Desktop Collapsible Group Members Sidebar */}
              <div
                aria-hidden={!showMembersPanel}
                className={`hidden lg:flex h-full shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out ${
                  showMembersPanel
                    ? 'w-60 opacity-100'
                    : 'w-0 opacity-0 pointer-events-none'
                }`}
              >
                <GroupMembersSidebar
                  group={activeGroup}
                  usersById={usersById}
                  myUid={uid}
                  onClosePanel={() => setShowMembersPanel(false)}
                  onStartDm={handleStartDm}
                  onAddFriend={handleAddFriendFromPopover}
                  onKickMember={async (targetUid, targetName) => {
                    if (!publicUser) return;
                    await kickGroupMember(activeGroup, publicUser, targetUid, targetName);
                    pushToast({ type: 'info', title: t(language, 'memberKickedFromGroup') });
                  }}
                  onTransferOwnership={async (targetUid, targetName) => {
                    if (!publicUser) return;
                    await transferGroupOwnership(activeGroup, publicUser, targetUid, targetName);
                    pushToast({ type: 'success', title: t(language, 'ownershipTransferred') });
                  }}
                  onOpenGroupSettings={(tab = 'overview') =>
                    setGroupSettingsState({ open: true, tab })
                  }
                  onLeaveGroup={async () => {
                    if (!publicUser) return;
                    await leaveGroupDm(activeGroup, publicUser);
                    setActiveGroupId(null);
                    pushToast({ type: 'info', title: t(language, 'youLeftGroup') });
                  }}
                />
              </div>

              {/* Mobile Slide-In Group Members Drawer */}
              <div
                aria-hidden={!mobileMembersOpen}
                className={`fixed inset-0 z-40 lg:hidden flex justify-end transition-[opacity,visibility] duration-200 ${
                  mobileMembersOpen
                    ? 'pointer-events-auto visible opacity-100'
                    : 'pointer-events-none invisible opacity-0'
                }`}
              >
                <div
                  className={`fixed inset-0 bg-rail/50 backdrop-blur-[1px] transition-opacity duration-200 ease-out ${
                    mobileMembersOpen ? 'opacity-100' : 'opacity-0'
                  }`}
                  onClick={() => setMobileMembersOpen(false)}
                />
                <div
                  className={`relative z-10 h-full shadow-2xl flex transition-transform duration-200 ease-out ${
                    mobileMembersOpen
                      ? 'translate-x-0'
                      : 'translate-x-full rtl:-translate-x-full'
                  }`}
                >
                  <GroupMembersSidebar
                    group={activeGroup}
                    usersById={usersById}
                    myUid={uid}
                    onClosePanel={() => setMobileMembersOpen(false)}
                    onStartDm={(targetId) => {
                      setMobileMembersOpen(false);
                      handleStartDm(targetId);
                    }}
                    onAddFriend={handleAddFriendFromPopover}
                    onKickMember={async (targetUid, targetName) => {
                      if (!publicUser) return;
                      await kickGroupMember(activeGroup, publicUser, targetUid, targetName);
                      pushToast({ type: 'info', title: t(language, 'memberKickedFromGroup') });
                    }}
                    onTransferOwnership={async (targetUid, targetName) => {
                      if (!publicUser) return;
                      await transferGroupOwnership(activeGroup, publicUser, targetUid, targetName);
                      pushToast({ type: 'success', title: t(language, 'ownershipTransferred') });
                    }}
                    onOpenGroupSettings={(tab = 'overview') => {
                      setMobileMembersOpen(false);
                      setGroupSettingsState({ open: true, tab });
                    }}
                    onLeaveGroup={async () => {
                      if (!publicUser) return;
                      setMobileMembersOpen(false);
                      await leaveGroupDm(activeGroup, publicUser);
                      setActiveGroupId(null);
                      pushToast({ type: 'info', title: t(language, 'youLeftGroup') });
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-0 h-full flex flex-col">
              <FriendsDashboard
                myUid={uid}
                friendships={friendships}
                usersById={usersById}
                sidebarCollapsed={!secondarySidebarOpen}
                onExpandSidebar={() => setSecondarySidebarOpen(true)}
                onOpenMobileSidebar={() => setMobileNavOpen(true)}
                onStartDm={handleStartDm}
                onOpenCreateGroup={() => setShowCreateGroup(true)}
              />
            </div>
          )
        ) : activeServer && activeChannel ? (
          activeChannel.type === 'voice' ? (
              <VoiceStage
                server={activeServer}
                channel={activeChannel}
                participants={voiceParticipantsByChannel[activeChannel.id] || []}
                isConnectedHere={
                  voice.activeSession?.kind === 'channel' &&
                  voice.activeSession.serverId === activeServer.id &&
                  voice.activeSession.channelId === activeChannel.id
                }
                muted={voice.muted}
                deafened={voice.deafened}
                localSpeaking={voice.localSpeaking}
                remoteSpeaking={voice.remoteSpeaking}
                myUid={uid}
                voiceError={voice.voiceError}
                connectionStatus={voice.connectionStatus}
                cameraActive={voice.cameraActive}
                screenShareActive={voice.screenShareActive}
                remoteVideoStreams={voice.remoteVideoStreams}
                pinnedUserId={voice.pinnedUserId}
                setPinnedUserId={voice.setPinnedUserId}
                videoStreamRef={voice.localVideoStream}
                screenStreamRef={null}
                onJoinVoice={() =>
                  voice.joinVoice({
                    kind: 'channel',
                    serverId: activeServer.id,
                    serverName: activeServer.name,
                    channelId: activeChannel.id,
                    channelName: activeChannel.name,
                  })
                }
                onLeaveVoice={voice.leaveVoice}
                onToggleMute={voice.toggleMute}
                onToggleDeafen={voice.toggleDeafen}
                onToggleCamera={voice.toggleCamera}
                onToggleScreenShare={voice.toggleScreenShare}
                sidebarCollapsed={!secondarySidebarOpen}
                onExpandSidebar={() => setSecondarySidebarOpen(true)}
                onOpenMobileSidebar={() => setMobileNavOpen(true)}
              />
          ) : (
            <>
              <ChatArea
                mode="channel"
                title={activeChannel.name}
                subtitle={activeChannel.topic}
                categoryName={activeChannel.category}
                memberCount={members.length}
                storageScopeId={`srv_${activeServer.id}`}
                channelOrDmId={activeChannel.id}
                messages={messages}
                loading={messagesLoading}
                hasMore={hasMoreMessages}
                loadingMore={loadingMore}
                reactions={reactions}
                typingUsers={typingUsers}
                members={members}
                usersById={usersById}
                myUid={uid}
                myUsername={publicUser?.username || ''}
                myRole={myRole}
                showMembersPanel={
                  isLargeViewport ? showMembersPanel : mobileMembersOpen
                }
                onToggleMembersPanel={() => {
                  if (window.innerWidth >= 1024) {
                    setShowMembersPanel((v) => !v);
                  } else {
                    setMobileMembersOpen((v) => !v);
                  }
                }}
                sidebarCollapsed={!secondarySidebarOpen}
                onExpandSidebar={() => setSecondarySidebarOpen(true)}
                onOpenMobileSidebar={() => setMobileNavOpen(true)}
                onLoadOlder={handleLoadOlder}
                onSendMessage={async (payload) => {
                  if (!publicUser) return;
                  await sendChannelMessage(
                    activeServer.id,
                    activeChannel.id,
                    {
                      uid,
                      displayName: publicUser.displayName,
                      avatarUrl: publicUser.avatarUrl,
                      role: myRole,
                    },
                    payload
                  );
                }}
                onEditMessage={(mId, content) =>
                  editChannelMessage(activeServer.id, activeChannel.id, mId, content)
                }
                onDeleteMessage={(mId) =>
                  deleteChannelMessage(activeServer.id, activeChannel.id, mId)
                }
                onToggleReaction={(mId, emoji, reacted) =>
                  toggleChannelReaction(
                    activeServer.id,
                    activeChannel.id,
                    mId,
                    uid,
                    emoji,
                    reacted
                  )
                }
                onTypingChange={(typing) => {
                  if (!publicUser) return;
                  setChannelTyping(
                    activeServer.id,
                    activeChannel.id,
                    uid,
                    publicUser.displayName,
                    typing
                  );
                }}
              />

              {/* Desktop Collapsible Members Sidebar */}
              <div
                aria-hidden={!showMembersPanel}
                className={`hidden lg:flex h-full shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out ${
                  showMembersPanel
                    ? 'w-60 opacity-100'
                    : 'w-0 opacity-0 pointer-events-none'
                }`}
              >
                <MembersSidebar
                  serverId={activeServer.id}
                  members={members}
                  usersById={usersById}
                  myUid={uid}
                  myRole={myRole}
                  onClosePanel={() => setShowMembersPanel(false)}
                  onStartDm={handleStartDm}
                  onAddFriend={handleAddFriendFromPopover}
                  onChangeRole={async (targetUid, role) => {
                    await updateMemberRole(activeServer.id, targetUid, role);
                    pushToast({ type: 'success', title: 'Member role updated' });
                  }}
                  onKickMember={async (m) => {
                    await kickMember(activeServer, m.uid);
                    pushToast({ type: 'info', title: `Kicked ${m.displayName}` });
                  }}
                  onBanMember={async (m) => {
                    await banMember(activeServer, m.uid, uid, 'Banned by moderator');
                    pushToast({ type: 'info', title: `Banned ${m.displayName}` });
                  }}
                />
              </div>

              {/* Mobile Slide-In Members Drawer (RTL-aware logical end edge + swipe-to-close) */}
              <div
                aria-hidden={!mobileMembersOpen}
                className={`fixed inset-0 z-40 lg:hidden flex justify-end transition-[opacity,visibility] duration-200 ${
                  mobileMembersOpen
                    ? 'pointer-events-auto visible opacity-100'
                    : 'pointer-events-none invisible opacity-0'
                }`}
              >
                <div
                  className={`fixed inset-0 bg-rail/50 backdrop-blur-[1px] transition-opacity duration-200 ease-out ${
                    mobileMembersOpen ? 'opacity-100' : 'opacity-0'
                  }`}
                  onClick={() => setMobileMembersOpen(false)}
                />
                <div
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    if (touch) {
                      membersTouchStartRef.current = {
                        x: touch.clientX,
                        y: touch.clientY,
                      };
                    }
                  }}
                  onTouchEnd={(e) => {
                    if (!membersTouchStartRef.current) return;
                    const touch = e.changedTouches[0];
                    if (!touch) return;
                    const dx = touch.clientX - membersTouchStartRef.current.x;
                    const dy = touch.clientY - membersTouchStartRef.current.y;
                    membersTouchStartRef.current = null;
                    if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy) * 1.2) {
                      return;
                    }
                    const isRtl =
                      typeof document !== 'undefined' &&
                      document.documentElement.dir === 'rtl';
                    if (isRtl ? dx < -56 : dx > 56) {
                      setMobileMembersOpen(false);
                    }
                  }}
                  className={`relative z-10 h-full shadow-2xl flex transition-transform duration-200 ease-out ${
                    mobileMembersOpen
                      ? 'translate-x-0'
                      : 'translate-x-full rtl:-translate-x-full'
                  }`}
                >
                  <MembersSidebar
                    serverId={activeServer.id}
                    members={members}
                    usersById={usersById}
                    myUid={uid}
                    myRole={myRole}
                    onClosePanel={() => setMobileMembersOpen(false)}
                    onStartDm={(targetId) => {
                      setMobileMembersOpen(false);
                      handleStartDm(targetId);
                    }}
                    onAddFriend={handleAddFriendFromPopover}
                    onChangeRole={async (targetUid, role) => {
                      await updateMemberRole(activeServer.id, targetUid, role);
                      pushToast({ type: 'success', title: 'Member role updated' });
                    }}
                    onKickMember={async (m) => {
                      await kickMember(activeServer, m.uid);
                      pushToast({ type: 'info', title: `Kicked ${m.displayName}` });
                    }}
                    onBanMember={async (m) => {
                      await banMember(activeServer, m.uid, uid, 'Banned by moderator');
                      pushToast({ type: 'info', title: `Banned ${m.displayName}` });
                    }}
                  />
                </div>
              </div>
            </>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-link text-text-muted dark:text-text-muted">
            {t(language, 'loadingServer')}
          </div>
        )}
        </div>
      </main>

      {/* Modals */}
      {showCreateJoin && publicUser && (
        <CreateJoinServerModal
          publicUser={publicUser}
          onClose={() => setShowCreateJoin(false)}
          onSuccess={(serverId) => {
            setShowCreateJoin(false);
            setActiveServerId(serverId);
            setActiveView('server');
          }}
        />
      )}

      {showDiscover && publicUser && (
        <DiscoverServersModal
          publicUser={publicUser}
          joinedServerIds={joinedServerIds}
          onClose={() => setShowDiscover(false)}
          onJoined={(serverId) => {
            setShowDiscover(false);
            setActiveServerId(serverId);
            setActiveView('server');
          }}
        />
      )}

      {userSettingsTab && (
        <FullScreenSettingsModal
          initialCategory={userSettingsTab}
          joinedServers={orderedJoinedServers}
          voiceActive={voice.activeSession !== null}
          getVoiceDiagnostics={voice.getVoiceDiagnostics}
          onClose={() => {
            setUserSettingsTab(null);
            setNotifPermission(getNotificationPermission());
          }}
        />
      )}

      {showQuickSwitcher && (
        <QuickSwitcherModal
          joinedServers={orderedJoinedServers}
          channels={channels}
          groups={groups}
          usersById={usersById}
          myUid={uid}
          onClose={() => setShowQuickSwitcher(false)}
          onSelectServer={(sId) => {
            setActiveServerId(sId);
            setActiveView('server');
          }}
          onSelectChannel={(ch) => {
            setActiveServerId(ch.serverId);
            setActiveChannelId(ch.id);
            setActiveView('server');
          }}
          onSelectGroup={(gId) => {
            setActiveDmId(null);
            setActiveGroupId(gId);
            setActiveView('home');
          }}
          onStartDm={handleStartDm}
        />
      )}

      {showCreateGroup && publicUser && (
        <CreateGroupModal
          publicUser={publicUser}
          friendships={friendships}
          usersById={usersById}
          onClose={() => setShowCreateGroup(false)}
          onCreated={(groupId) => {
            setShowCreateGroup(false);
            setActiveDmId(null);
            setActiveGroupId(groupId);
            setActiveView('home');
            setMobileNavOpen(false);
          }}
        />
      )}

      {groupSettingsState.open && activeGroup && publicUser && (
        <GroupSettingsModal
          group={activeGroup}
          publicUser={publicUser}
          friendships={friendships}
          usersById={usersById}
          isMuted={mutedGroupIds.has(activeGroup.id)}
          initialTab={groupSettingsState.tab}
          onToggleMute={async () => {
            const nextMuted = !mutedGroupIds.has(activeGroup.id);
            await toggleMuteGroup(uid, activeGroup.id, nextMuted);
            pushToast({
              type: 'info',
              title: nextMuted ? t(language, 'groupMuted') : t(language, 'groupUnmuted'),
            });
          }}
          onClose={() => setGroupSettingsState({ open: false, tab: 'overview' })}
          onLeftGroup={() => {
            setGroupSettingsState({ open: false, tab: 'overview' });
            setActiveGroupId(null);
          }}
        />
      )}

      {showInviteModal && activeServer && (
        <InviteModal
          server={activeServer}
          myUid={uid}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {showServerSettings && activeServer && (
        <ServerSettingsModal
          server={activeServer}
          members={members}
          usersById={usersById}
          myUid={uid}
          myRole={myRole}
          onClose={() => setShowServerSettings(false)}
          onDeleted={() => {
            setShowServerSettings(false);
            setActiveView('home');
            setActiveServerId(null);
          }}
        />
      )}

      {channelModalState.open && activeServer && (
        <ChannelModal
          serverId={activeServer.id}
          myUid={uid}
          channelCount={channels.length}
          editingChannel={channelModalState.editing}
          defaultType={channelModalState.defaultType}
          onClose={() =>
            setChannelModalState({ open: false, editing: null, defaultType: 'text' })
          }
          onCreated={(ch) => {
            setChannelModalState({ open: false, editing: null, defaultType: 'text' });
            setActiveChannelId(ch.id);
          }}
        />
      )}

      {showModerationModal && activeServer && (
        <ModerationDashboardModal
          server={activeServer}
          members={members}
          myRole={myRole}
          onClose={() => setShowModerationModal(false)}
          onKick={async (targetUid) => {
            const targetM = members.find((m) => m.uid === targetUid);
            await kickMember(activeServer, targetUid);
            await logAuditAction(
              activeServer.id,
              uid,
              publicUser?.displayName || 'Moderator',
              'kick_member',
              targetM?.displayName || targetUid,
              `Kicked member ${targetM?.displayName || targetUid}`
            );
            pushToast({ type: 'info', title: `Kicked member` });
          }}
          onBan={async (targetUid) => {
            const targetM = members.find((m) => m.uid === targetUid);
            await banMember(activeServer, targetUid, uid, 'Banned by moderator');
            await logAuditAction(
              activeServer.id,
              uid,
              publicUser?.displayName || 'Moderator',
              'ban_member',
              targetM?.displayName || targetUid,
              `Banned member ${targetM?.displayName || targetUid}`
            );
            pushToast({ type: 'info', title: `Banned member` });
          }}
          onUnban={async (targetUid) => {
            await unbanMember(activeServer.id, targetUid);
            pushToast({ type: 'success', title: `Unbanned user` });
          }}
        />
      )}

      {incomingCall && !activeDmCall && (
        <IncomingCallModal
          call={incomingCall}
          soundEnabled={soundEnabled && !isEffectivelyDnd}
          onAccept={async () => {
            const call = incomingCall;
            setIncomingCall(null);
            await respondDmCall(call.id, true, uid);
            await voice.joinVoice({
              kind: 'call',
              callId: call.id,
              callName: call.isGroup ? (call.groupName || call.callerName) : call.callerName,
              dmId: call.dmId,
              callType: call.type,
            });
            setActiveDmCall(call);
          }}
          onDecline={async () => {
            const call = incomingCall;
            setIncomingCall(null);
            if (call.isGroup) {
              return;
            }
            if (publicUser) {
              await endDmCall(call.id, call.dmId, publicUser, 0, 'declined');
            } else {
              await respondDmCall(call.id, false, uid);
            }
          }}
          onMissed={async () => {
            const call = incomingCall;
            setIncomingCall(null);
            if (call.isGroup) {
              return;
            }
            if (publicUser) {
              await endDmCall(call.id, call.dmId, publicUser, 0, 'missed');
            }
          }}
        />
      )}

      {activeDmCall && (
        <ActiveCallOverlay
          call={activeDmCall}
          participants={voice.participants}
          usersById={usersById}
          friendships={friendships}
          myUid={uid}
          connectionStatus={voice.connectionStatus}
          muted={voice.muted}
          deafened={voice.deafened}
          localSpeaking={voice.localSpeaking}
          remoteSpeaking={voice.remoteSpeaking}
          cameraActive={voice.cameraActive}
          screenShareActive={voice.screenShareActive}
          localVideoStream={voice.localVideoStream}
          remoteVideoStreams={voice.remoteVideoStreams}
          pinnedUserId={voice.pinnedUserId}
          setPinnedUserId={voice.setPinnedUserId}
          onToggleMute={voice.toggleMute}
          onToggleDeafen={voice.toggleDeafen}
          onToggleCamera={voice.toggleCamera}
          onToggleScreenShare={voice.toggleScreenShare}
          onEndCall={async (durationSeconds) => {
            const call = activeDmCall;
            setActiveDmCall(null);
            await voice.leaveVoice('call-ended-by-user');
            if (publicUser) {
              await endDmCall(call.id, call.dmId, publicUser, durationSeconds, 'ended');
            }
          }}
          onAddParticipant={async (targetUid) => {
            await addParticipantToCall(activeDmCall.id, targetUid);
            pushToast({ type: 'success', title: t(language, 'inviteToCall') });
          }}
        />
      )}
    </div>
  );
}
