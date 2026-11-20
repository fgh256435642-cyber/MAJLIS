import { useEffect, useRef } from 'react';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { t } from '../i18n/translations';
import { db } from '../services/firebase';
import {
  ensureServiceWorkerMessageListener,
  getNotificationPermission,
  getOrRegisterNotificationWorker,
  type NexusNotificationPayload,
  showWebNotification,
} from '../services/notificationService';
import type {
  Channel,
  ChatMessage,
  DirectMessageThread,
  GroupDm,
  JoinedServerRef,
  Language,
  NotificationMode,
  NotificationSoundId,
  PublicUser,
  ServerNotificationPref,
  UserStatus,
} from '../types/nexus';
import { getGroupDisplayName, isDndScheduleActive, isTargetMuted } from '../utils/validation';
import { playChime } from '../utils/sound';

interface UseMessageNotificationsOptions {
  uid: string;
  publicUser: PublicUser | null;
  language: Language;
  joinedServers: JoinedServerRef[];
  dmThreads: DirectMessageThread[];
  dmThreadsLoaded: boolean;
  groups?: GroupDm[];
  groupsLoaded?: boolean;
  mutedGroupIds?: Set<string>;
  blockedUserIds?: Set<string>;
  usersById: Record<string, PublicUser>;
  activeView: 'home' | 'server';
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmId: string | null;
  activeGroupId?: string | null;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  mentionsOnly: boolean;
  notificationMode?: NotificationMode;
  notificationSound?: NotificationSoundId;
  notificationVolume?: number;
  dndScheduleEnabled?: boolean;
  dndStartHour?: number;
  dndEndHour?: number;
  serverNotifications?: Record<string, ServerNotificationPref>;
  channelMutes?: Record<string, number>;
  presenceStatus?: UserStatus;
  onNavigate: (payload: NexusNotificationPayload) => void;
  onUnreadMessage?: (info: {
    kind: 'dm' | 'group' | 'channel';
    id: string;
  }) => void;
}

export function useMessageNotifications({
  uid,
  publicUser,
  language,
  joinedServers,
  dmThreads,
  dmThreadsLoaded,
  groups = [],
  groupsLoaded = false,
  mutedGroupIds,
  blockedUserIds,
  usersById,
  activeView,
  activeServerId,
  activeChannelId,
  activeDmId,
  activeGroupId = null,
  notificationsEnabled,
  soundEnabled,
  mentionsOnly,
  notificationMode = 'all',
  notificationSound = 'classic',
  notificationVolume = 80,
  dndScheduleEnabled = false,
  dndStartHour = 23,
  dndEndHour = 7,
  serverNotifications = {},
  channelMutes = {},
  presenceStatus = 'online',
  onNavigate,
  onUnreadMessage,
}: UseMessageNotificationsOptions) {
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const dmLastMsgMsRef = useRef<Record<string, number>>({});
  const dmInitializedRef = useRef(false);
  const groupLastMsgMsRef = useRef<Record<string, number>>({});
  const groupInitializedRef = useRef(false);
  const channelLastMsgMsRef = useRef<Record<string, number>>({});
  const channelInitializedServersRef = useRef<Set<string>>(new Set());

  // Keep fresh refs so snapshot callbacks never hold stale navigation/settings state
  const stateRef = useRef({
    publicUser,
    language,
    usersById,
    activeView,
    activeServerId,
    activeChannelId,
    activeDmId,
    activeGroupId,
    mutedGroupIds,
    blockedUserIds,
    notificationsEnabled,
    soundEnabled,
    mentionsOnly,
    notificationMode,
    notificationSound,
    notificationVolume,
    dndScheduleEnabled,
    dndStartHour,
    dndEndHour,
    serverNotifications,
    channelMutes,
    presenceStatus,
    onNavigate,
    onUnreadMessage,
  });

  stateRef.current = {
    publicUser,
    language,
    usersById,
    activeView,
    activeServerId,
    activeChannelId,
    activeDmId,
    activeGroupId,
    mutedGroupIds,
    blockedUserIds,
    notificationsEnabled,
    soundEnabled,
    mentionsOnly,
    notificationMode,
    notificationSound,
    notificationVolume,
    dndScheduleEnabled,
    dndStartHour,
    dndEndHour,
    serverNotifications,
    channelMutes,
    presenceStatus,
    onNavigate,
    onUnreadMessage,
  };

  // Register Service Worker & click handler if permission already granted
  useEffect(() => {
    ensureServiceWorkerMessageListener((payload) => {
      stateRef.current.onNavigate(payload);
    });
    if (getNotificationPermission() === 'granted') {
      void getOrRegisterNotificationWorker();
    }
  }, []);

  const notifyForMessage = (
    msg: ChatMessage,
    context: {
      kind: 'dm' | 'channel' | 'group';
      serverId?: string;
      serverName?: string;
      channelId?: string;
      channelName?: string;
      dmId?: string;
      groupId?: string;
      groupName?: string;
    }
  ) => {
    if (!msg || !msg.id || msg.authorId === uid) return;
    if (msg.isSystem && msg.systemAction !== 'call') return;
    const s = stateRef.current;
    if (s.blockedUserIds?.has(msg.authorId)) return;
    if (notifiedIdsRef.current.has(msg.id)) return;
    notifiedIdsRef.current.add(msg.id);
    if (notifiedIdsRef.current.size > 200) {
      const first = notifiedIdsRef.current.values().next().value;
      if (first) notifiedIdsRef.current.delete(first);
    }

    const isViewingThisChat =
      context.kind === 'dm'
        ? s.activeView === 'home' && s.activeDmId === context.dmId
        : context.kind === 'group'
        ? s.activeView === 'home' && s.activeGroupId === context.groupId
        : s.activeView === 'server' &&
          s.activeServerId === context.serverId &&
          s.activeChannelId === context.channelId;

    if (!isViewingThisChat) {
      const targetId =
        context.kind === 'dm'
          ? context.dmId
          : context.kind === 'group'
          ? context.groupId
          : context.channelId;
      if (targetId) {
        s.onUnreadMessage?.({ kind: context.kind, id: targetId });
      }
    }

    if (s.presenceStatus === 'dnd') return;
    if (isDndScheduleActive(s.dndScheduleEnabled, s.dndStartHour, s.dndEndHour)) return;
    if (context.kind === 'group' && context.groupId && s.mutedGroupIds?.has(context.groupId)) {
      return;
    }
    if (context.kind === 'channel') {
      if (context.serverId && isTargetMuted(s.serverNotifications?.[context.serverId]?.mutedUntilMs)) {
        return;
      }
      if (context.channelId && isTargetMuted(s.channelMutes?.[context.channelId])) {
        return;
      }
    }

    const effectiveMode: NotificationMode =
      context.kind === 'channel' &&
      context.serverId &&
      s.serverNotifications?.[context.serverId]?.mode
        ? (s.serverNotifications[context.serverId].mode as NotificationMode)
        : s.notificationMode;

    if (effectiveMode === 'none') return;

    const myUsernameLower = s.publicUser?.usernameLower;
    const isMentioned = Boolean(
      myUsernameLower && msg.mentions?.includes(myUsernameLower)
    );
    const onlyMentions = effectiveMode === 'mentions' || (context.kind === 'channel' && s.mentionsOnly);
    const shouldAlert =
      onlyMentions
        ? isMentioned
        : context.kind === 'dm' || context.kind === 'group' || !s.mentionsOnly || isMentioned;

    if (!shouldAlert) return;

    const isAppInBackground =
      typeof document !== 'undefined' &&
      (document.visibilityState === 'hidden' || !document.hasFocus());

    if (
      s.soundEnabled &&
      s.notificationSound !== 'none' &&
      (!isViewingThisChat || isAppInBackground)
    ) {
      playChime('message', {
        preset: s.notificationSound,
        volume: s.notificationVolume,
      });
    }

    if (
      s.notificationsEnabled &&
      getNotificationPermission() === 'granted' &&
      (isAppInBackground || !isViewingThisChat)
    ) {
      const senderName =
        s.usersById[msg.authorId]?.displayName || msg.authorName;
      const senderAvatar =
        s.usersById[msg.authorId]?.avatarUrl || msg.authorAvatar || undefined;
      const title =
        context.kind === 'dm'
          ? `${senderName} · ${t(s.language, 'directMessageLabel')}`
          : context.kind === 'group'
          ? `${senderName} · ${context.groupName || t(s.language, 'groupChat')}`
          : `${senderName} (${context.serverName ? `${context.serverName} · ` : ''}#${context.channelName || 'channel'})`;
      const body =
        msg.content ||
        msg.attachmentName ||
        t(s.language, 'sentAttachment');

      const navPayload: NexusNotificationPayload =
        context.kind === 'dm'
          ? { kind: 'dm', dmId: context.dmId }
          : context.kind === 'group'
          ? { kind: 'group', groupId: context.groupId }
          : {
              kind: 'channel',
              serverId: context.serverId,
              channelId: context.channelId,
            };

      void showWebNotification({
        title,
        body,
        icon: senderAvatar,
        tag: `nexus-msg-${msg.id}`,
        payload: navPayload,
        onClick: () => stateRef.current.onNavigate(navPayload),
      });
    }
  };

  // Detect new DM messages across all user's DM threads
  useEffect(() => {
    if (!dmThreadsLoaded) return;

    if (!dmInitializedRef.current) {
      for (const dm of dmThreads) {
        dmLastMsgMsRef.current[dm.id] = dm.lastMessageAt?.toMillis?.() || 0;
      }
      dmInitializedRef.current = true;
      return;
    }

    for (const dm of dmThreads) {
      const nextMs = dm.lastMessageAt?.toMillis?.() || 0;
      const prevMs = dmLastMsgMsRef.current[dm.id];
      if (prevMs === undefined) {
        dmLastMsgMsRef.current[dm.id] = nextMs;
        if (nextMs > 0) {
          void getDocs(
            query(
              collection(db, 'dms', dm.id, 'messages'),
              orderBy('createdAt', 'desc'),
              limit(1)
            )
          ).then((snap) => {
            const latest = snap.docs[0]?.data() as ChatMessage | undefined;
            if (latest) {
              notifyForMessage(latest, { kind: 'dm', dmId: dm.id });
            }
          });
        }
      } else if (nextMs > prevMs) {
        dmLastMsgMsRef.current[dm.id] = nextMs;
        void getDocs(
          query(
            collection(db, 'dms', dm.id, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(1)
          )
        ).then((snap) => {
          const latest = snap.docs[0]?.data() as ChatMessage | undefined;
          if (latest) {
            notifyForMessage(latest, { kind: 'dm', dmId: dm.id });
          }
        });
      }
    }
  }, [dmThreads, dmThreadsLoaded, uid]);

  // Detect new Group DM messages across all user's groups
  useEffect(() => {
    if (!groupsLoaded) return;

    if (!groupInitializedRef.current) {
      for (const grp of groups) {
        groupLastMsgMsRef.current[grp.id] = grp.lastMessageAt?.toMillis?.() || 0;
      }
      groupInitializedRef.current = true;
      return;
    }

    for (const grp of groups) {
      const nextMs = grp.lastMessageAt?.toMillis?.() || 0;
      const prevMs = groupLastMsgMsRef.current[grp.id];
      const grpName = getGroupDisplayName(
        grp,
        stateRef.current.usersById,
        uid,
        stateRef.current.language
      );

      if (prevMs === undefined) {
        groupLastMsgMsRef.current[grp.id] = nextMs;
        if (nextMs > 0) {
          void getDocs(
            query(
              collection(db, 'groups', grp.id, 'messages'),
              orderBy('createdAt', 'desc'),
              limit(1)
            )
          ).then((snap) => {
            const latest = snap.docs[0]?.data() as ChatMessage | undefined;
            if (latest) {
              notifyForMessage(latest, {
                kind: 'group',
                groupId: grp.id,
                groupName: grpName,
              });
            }
          });
        }
      } else if (nextMs > prevMs) {
        groupLastMsgMsRef.current[grp.id] = nextMs;
        void getDocs(
          query(
            collection(db, 'groups', grp.id, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(1)
          )
        ).then((snap) => {
          const latest = snap.docs[0]?.data() as ChatMessage | undefined;
          if (latest) {
            notifyForMessage(latest, {
              kind: 'group',
              groupId: grp.id,
              groupName: grpName,
            });
          }
        }).catch(() => {});
      }
    }
  }, [groups, groupsLoaded, uid]);

  // Listen to text channels across all joined servers for background / cross-channel alerts
  const joinedServersKey = joinedServers
    .map((s) => `${s.serverId}:${s.serverName}`)
    .join('|');

  useEffect(() => {
    if (joinedServers.length === 0) return;

    const unsubs = joinedServers.slice(0, 20).map((srv) =>
      onSnapshot(
        query(
          collection(db, 'servers', srv.serverId, 'channels'),
          where('type', '==', 'text')
        ),
        (snap) => {
          const isInitial = !channelInitializedServersRef.current.has(srv.serverId);
          for (const docSnap of snap.docs) {
            const ch = docSnap.data() as Channel;
            const nextMs = ch.lastMessageAt?.toMillis?.() || 0;
            const prevMs = channelLastMsgMsRef.current[ch.id];

            if (isInitial || prevMs === undefined) {
              channelLastMsgMsRef.current[ch.id] = nextMs;
              continue;
            }

            if (nextMs > prevMs) {
              channelLastMsgMsRef.current[ch.id] = nextMs;
              void getDocs(
                query(
                  collection(
                    db,
                    'servers',
                    srv.serverId,
                    'channels',
                    ch.id,
                    'messages'
                  ),
                  orderBy('createdAt', 'desc'),
                  limit(1)
                )
              )
                .then((msgSnap) => {
                  const latest = msgSnap.docs[0]?.data() as ChatMessage | undefined;
                  if (latest) {
                    notifyForMessage(latest, {
                      kind: 'channel',
                      serverId: srv.serverId,
                      serverName: srv.serverName,
                      channelId: ch.id,
                      channelName: ch.name,
                    });
                  }
                })
                .catch(() => {});
            }
          }
          channelInitializedServersRef.current.add(srv.serverId);
        }
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [joinedServersKey, uid]);

  return {
    notifyForMessage,
    markMessageNotified: (msgId: string) => {
      notifiedIdsRef.current.add(msgId);
    },
  };
}
