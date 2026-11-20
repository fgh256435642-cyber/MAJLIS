import { useMemo, useState } from 'react';
import {
  Check,
  Compass,
  Globe,
  LogOut,
  Plus,
  Search,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUserSettings } from '../hooks/useUserSettings';
import { t } from '../i18n/translations';
import type {
  DirectMessageThread,
  GroupDm,
  JoinedServerRef,
  PublicUser,
  SelectableUserStatus,
  SettingsCategoryId,
} from '../types/nexus';
import {
  getActiveCustomStatus,
  getEffectiveUserStatus,
  getGroupDisplayName,
} from '../utils/validation';
import {
  GroupAvatar,
  MajlisBrandIcon,
  ServerIcon,
  StatusIndicator,
  UserAvatar,
} from './NexusLogo';
import {
  NexusPopover,
  NexusPopoverContent,
  NexusPopoverTrigger,
  NexusTooltip,
} from './ui/NexusUI';

interface ServerRailProps {
  joinedServers: JoinedServerRef[];
  activeView: 'home' | 'server';
  activeServerId: string | null;
  activeDmId: string | null;
  activeGroupId: string | null;
  unreadServerIds: Set<string>;
  unreadCountsByConv: Record<string, number>;
  pendingFriendCount: number;
  dmThreads: DirectMessageThread[];
  groups: GroupDm[];
  usersById: Record<string, PublicUser>;
  publicUser: PublicUser | null;
  onSelectHome: () => void;
  onSelectFriends: () => void;
  onSelectDm: (dmId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onSelectServer: (serverId: string) => void;
  onReorderServers: (fromServerId: string, toServerId: string, position: 'before' | 'after') => void;
  onOpenCreateJoin: () => void;
  onOpenDiscover: () => void;
  onOpenQuickSwitcher: () => void;
  onOpenUserSettings: (tab?: SettingsCategoryId) => void;
}

export function ServerRail({
  joinedServers,
  activeView,
  activeServerId,
  activeDmId,
  activeGroupId,
  unreadServerIds,
  unreadCountsByConv,
  pendingFriendCount,
  dmThreads,
  groups,
  usersById,
  publicUser,
  onSelectHome,
  onSelectFriends,
  onSelectDm,
  onSelectGroup,
  onSelectServer,
  onReorderServers,
  onOpenCreateJoin,
  onOpenDiscover,
  onOpenQuickSwitcher,
  onOpenUserSettings,
}: ServerRailProps) {
  const {
    language,
    presenceNowMs,
    effectiveSelfStatus,
    preferredStatus,
    changePresenceStatus,
    logout,
  } = useAuth();
  const { settings, updateSetting } = useUserSettings();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [draggedServerId, setDraggedServerId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    serverId: string;
    position: 'before' | 'after';
  } | null>(null);

  const tooltipSide = language === 'ar' ? 'left' : 'right';
  const myUid = publicUser?.uid || '';

  const recentConversations = useMemo(() => {
    const items = [
      ...dmThreads.map((dm) => ({
        kind: 'dm' as const,
        id: dm.id,
        convKey: `dm_${dm.id}`,
        sortMs: dm.lastMessageAt?.toMillis?.() || dm.updatedAt?.toMillis?.() || 0,
        dm,
      })),
      ...groups.map((group) => ({
        kind: 'group' as const,
        id: group.id,
        convKey: `grp_${group.id}`,
        sortMs:
          group.lastMessageAt?.toMillis?.() ||
          group.updatedAt?.toMillis?.() ||
          group.createdAt?.toMillis?.() ||
          0,
        group,
      })),
    ].sort((a, b) => b.sortMs - a.sortMs);

    const top = items.slice(0, 8);
    if (activeView === 'home' && activeDmId && !top.some((i) => i.kind === 'dm' && i.id === activeDmId)) {
      const activeItem = items.find((i) => i.kind === 'dm' && i.id === activeDmId);
      if (activeItem) top.unshift(activeItem);
    }
    if (activeView === 'home' && activeGroupId && !top.some((i) => i.kind === 'group' && i.id === activeGroupId)) {
      const activeItem = items.find((i) => i.kind === 'group' && i.id === activeGroupId);
      if (activeItem) top.unshift(activeItem);
    }
    return top.slice(0, 8);
  }, [dmThreads, groups, activeView, activeDmId, activeGroupId]);

  const statusLabelText = settings.hideOnlineStatus
    ? t(language, 'offline')
    : effectiveSelfStatus === 'online'
    ? t(language, 'online')
    : effectiveSelfStatus === 'idle'
    ? t(language, 'idle')
    : effectiveSelfStatus === 'dnd'
    ? t(language, 'dnd')
    : t(language, 'offline');
  const activeCustomStatus = getActiveCustomStatus(publicUser, presenceNowMs);

  const statusOptions: ReadonlyArray<{
    id: SelectableUserStatus;
    label: string;
    desc: string;
  }> = [
    { id: 'online', label: t(language, 'online'), desc: t(language, 'onlineDesc') },
    { id: 'idle', label: t(language, 'idle'), desc: t(language, 'idleDesc') },
    { id: 'dnd', label: t(language, 'dnd'), desc: t(language, 'dndDesc') },
  ];

  const isHomeFriendsActive =
    activeView === 'home' && activeDmId === null && activeGroupId === null;

  return (
    <nav
      aria-label={t(language, 'serversLabel')}
      className="w-[72px] shrink-0 h-full bg-slate-200 dark:bg-[#1E1F22] flex flex-col items-center border-e border-slate-300/70 dark:border-black/30 select-none"
    >
      {/* Scrollable Navigation Rail */}
      <div className="flex-1 w-full overflow-y-auto no-scrollbar flex flex-col items-center py-3 gap-2">
        {/* 1. App Logo / Home Button */}
        <div className="relative group flex items-center justify-center w-full shrink-0">
          <span
            className={`absolute start-0 w-1 rounded-e-full bg-slate-900 dark:bg-white transition-all duration-150 ${
              isHomeFriendsActive
                ? 'h-9'
                : activeView === 'home'
                ? 'h-5'
                : 'h-0 group-hover:h-5'
            }`}
          />
          <NexusTooltip
            content={`${t(language, 'home')} · ${t(language, 'friendsAndDms')}`}
            side={tooltipSide}
          >
            <button
              type="button"
              onClick={onSelectHome}
              aria-label={t(language, 'home')}
              className={`relative w-12 h-12 flex items-center justify-center transition-all duration-150 ${
                activeView === 'home'
                  ? 'rounded-2xl bg-nexus text-white shadow-sm'
                  : 'rounded-3xl hover:rounded-2xl bg-white dark:bg-[#313338] text-slate-700 dark:text-zinc-200 hover:bg-nexus hover:text-white'
              }`}
            >
              <MajlisBrandIcon className="w-6 h-6" />
            </button>
          </NexusTooltip>
        </div>

        {/* 2. Search / Quick Switcher (Ctrl+K) */}
        <div className="relative group flex items-center justify-center w-full shrink-0">
          <span className="absolute start-0 w-1 rounded-e-full bg-slate-900 dark:bg-white transition-all duration-150 h-0 group-hover:h-4" />
          <NexusTooltip
            content={`${t(language, 'quickSwitcher')} (Ctrl+K)`}
            side={tooltipSide}
          >
            <button
              type="button"
              onClick={onOpenQuickSwitcher}
              aria-label={t(language, 'quickSwitcher')}
              aria-keyshortcuts="Control+k"
              className="w-12 h-12 rounded-3xl hover:rounded-2xl bg-white dark:bg-[#313338] text-slate-600 dark:text-zinc-300 hover:bg-nexus hover:text-white flex items-center justify-center transition-all duration-150"
            >
              <Search className="w-5 h-5" />
            </button>
          </NexusTooltip>
        </div>

        {/* 3. Friends Icon with Red Pending Badge */}
        <div className="relative group flex items-center justify-center w-full shrink-0">
          <span
            className={`absolute start-0 w-1 rounded-e-full bg-slate-900 dark:bg-white transition-all duration-150 ${
              isHomeFriendsActive ? 'h-8' : 'h-0 group-hover:h-5'
            }`}
          />
          <NexusTooltip content={t(language, 'friends')} side={tooltipSide}>
            <button
              type="button"
              onClick={onSelectFriends}
              aria-label={t(language, 'friends')}
              className={`relative w-12 h-12 flex items-center justify-center transition-all duration-150 ${
                isHomeFriendsActive
                  ? 'rounded-2xl bg-nexus text-white shadow-sm'
                  : 'rounded-3xl hover:rounded-2xl bg-white dark:bg-[#313338] text-slate-700 dark:text-zinc-200 hover:bg-nexus hover:text-white'
              }`}
            >
              <Users className="w-5 h-5" />
              {pendingFriendCount > 0 && (
                <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-slate-200 dark:border-[#1E1F22] tabular-nums">
                  {pendingFriendCount > 99 ? '99+' : pendingFriendCount}
                </span>
              )}
            </button>
          </NexusTooltip>
        </div>

        {/* 4. Recent Direct Messages & Groups */}
        {recentConversations.map((item) => {
          const unreadCount = unreadCountsByConv[item.convKey] || 0;

          if (item.kind === 'group') {
            const g = item.group;
            const isActive = activeView === 'home' && activeGroupId === g.id;
            const gLabel = getGroupDisplayName(g, usersById, myUid, language);
            const hasUnread = !isActive && unreadCount > 0;

            return (
              <div
                key={item.convKey}
                className="relative group flex items-center justify-center w-full shrink-0"
              >
                <span
                  className={`absolute start-0 w-1 rounded-e-full bg-slate-900 dark:bg-white transition-all duration-150 ${
                    isActive
                      ? 'h-9'
                      : hasUnread
                      ? 'h-2.5 group-hover:h-5'
                      : 'h-0 group-hover:h-5'
                  }`}
                />
                <NexusTooltip content={gLabel} side={tooltipSide}>
                  <button
                    type="button"
                    onClick={() => onSelectGroup(g.id)}
                    aria-label={gLabel}
                    className={`relative rounded-full transition-all duration-150 ${
                      isActive
                        ? 'ring-2 ring-nexus ring-offset-2 ring-offset-slate-200 dark:ring-offset-[#1E1F22]'
                        : 'hover:scale-105'
                    }`}
                  >
                    <GroupAvatar
                      src={g.iconUrl}
                      name={gLabel}
                      size="md"
                      className="w-11 h-11"
                    />
                    {hasUnread && (
                      <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-slate-200 dark:border-[#1E1F22] tabular-nums">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                </NexusTooltip>
              </div>
            );
          }

          const dm = item.dm;
          const otherUid = dm.participants.find((id) => id !== myUid) || '';
          const otherUser = usersById[otherUid];
          const isActive = activeView === 'home' && activeDmId === dm.id;
          const hasUnread = !isActive && unreadCount > 0;
          const effectiveStatus = getEffectiveUserStatus(
            otherUser?.status,
            otherUser?.lastSeen?.toMillis?.(),
            presenceNowMs
          );
          const dmLabel = otherUser?.displayName || t(language, 'directMessage');

          return (
            <div
              key={item.convKey}
              className="relative group flex items-center justify-center w-full shrink-0"
            >
              <span
                className={`absolute start-0 w-1 rounded-e-full bg-slate-900 dark:bg-white transition-all duration-150 ${
                  isActive
                    ? 'h-9'
                    : hasUnread
                    ? 'h-2.5 group-hover:h-5'
                    : 'h-0 group-hover:h-5'
                }`}
              />
              <NexusTooltip content={dmLabel} side={tooltipSide}>
                <button
                  type="button"
                  onClick={() => onSelectDm(dm.id)}
                  aria-label={dmLabel}
                  className={`relative rounded-full transition-all duration-150 ${
                    isActive
                      ? 'ring-2 ring-nexus ring-offset-2 ring-offset-slate-200 dark:ring-offset-[#1E1F22]'
                      : 'hover:scale-105'
                  }`}
                >
                  <UserAvatar
                    src={otherUser?.avatarUrl}
                    name={otherUser?.displayName || 'U'}
                    status={effectiveStatus}
                    size="md"
                    showStatus
                    className="w-11 h-11"
                  />
                  {hasUnread && (
                    <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-slate-200 dark:border-[#1E1F22] tabular-nums">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              </NexusTooltip>
            </div>
          );
        })}

        {/* 5. Thin Divider */}
        <div className="w-8 h-[2px] rounded-full bg-slate-300 dark:bg-white/10 my-0.5 shrink-0" />

        {/* 6. Draggable Server List */}
        {joinedServers.map((srv) => {
          const isActive = activeView === 'server' && activeServerId === srv.serverId;
          const hasUnread = !isActive && unreadServerIds.has(srv.serverId);
          const isDragging = draggedServerId === srv.serverId;
          const showDropBefore =
            dropTarget?.serverId === srv.serverId &&
            dropTarget.position === 'before' &&
            draggedServerId !== srv.serverId;
          const showDropAfter =
            dropTarget?.serverId === srv.serverId &&
            dropTarget.position === 'after' &&
            draggedServerId !== srv.serverId;

          return (
            <div
              key={srv.serverId}
              className="relative group flex flex-col items-center justify-center w-full shrink-0"
              onDragOver={(e) => {
                if (!draggedServerId || draggedServerId === srv.serverId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const pos: 'before' | 'after' =
                  e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                if (
                  dropTarget?.serverId !== srv.serverId ||
                  dropTarget?.position !== pos
                ) {
                  setDropTarget({ serverId: srv.serverId, position: pos });
                }
              }}
              onDragLeave={() => {
                if (dropTarget?.serverId === srv.serverId) {
                  setDropTarget(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId =
                  draggedServerId || e.dataTransfer.getData('text/plain');
                const pos = dropTarget?.position || 'before';
                if (fromId && fromId !== srv.serverId) {
                  onReorderServers(fromId, srv.serverId, pos);
                }
                setDraggedServerId(null);
                setDropTarget(null);
              }}
            >
              {showDropBefore && (
                <div className="w-8 h-0.5 rounded-full bg-nexus mb-1 transition-opacity" />
              )}

              <div className="relative flex items-center justify-center w-full">
                <span
                  className={`absolute start-0 w-1 rounded-e-full bg-slate-900 dark:bg-white transition-all duration-150 ${
                    isActive
                      ? 'h-10'
                      : hasUnread
                      ? 'h-2.5 group-hover:h-5'
                      : 'h-0 group-hover:h-5'
                  }`}
                />
                <NexusTooltip content={srv.serverName} side={tooltipSide}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      setDraggedServerId(srv.serverId);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', srv.serverId);
                    }}
                    onDragEnd={() => {
                      setDraggedServerId(null);
                      setDropTarget(null);
                    }}
                    onClick={() => onSelectServer(srv.serverId)}
                    aria-label={srv.serverName}
                    className={`transition-all duration-150 overflow-hidden cursor-grab active:cursor-grabbing ${
                      isDragging ? 'opacity-45 scale-95' : ''
                    } ${
                      isActive
                        ? 'rounded-2xl ring-2 ring-nexus ring-offset-2 ring-offset-slate-200 dark:ring-offset-[#1E1F22]'
                        : 'rounded-3xl hover:rounded-2xl'
                    }`}
                  >
                    <ServerIcon
                      src={srv.serverIconUrl}
                      name={srv.serverName}
                      size="md"
                      rounded={
                        isActive ? 'rounded-2xl' : 'rounded-3xl group-hover:rounded-2xl'
                      }
                    />
                  </button>
                </NexusTooltip>
              </div>

              {showDropAfter && (
                <div className="w-8 h-0.5 rounded-full bg-nexus mt-1 transition-opacity" />
              )}
            </div>
          );
        })}

        {/* 7. Add / Join Server (+) */}
        <NexusTooltip content={t(language, 'addServer')} side={tooltipSide}>
          <button
            type="button"
            onClick={onOpenCreateJoin}
            aria-label={t(language, 'addServer')}
            className="w-12 h-12 rounded-3xl hover:rounded-2xl bg-white dark:bg-[#313338] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white flex items-center justify-center transition-all duration-150 shrink-0"
          >
            <Plus className="w-6 h-6" />
          </button>
        </NexusTooltip>

        {/* 8. Discover Public Servers (Compass) */}
        <NexusTooltip content={t(language, 'discoverServers')} side={tooltipSide}>
          <button
            type="button"
            onClick={onOpenDiscover}
            aria-label={t(language, 'discoverServers')}
            className="w-12 h-12 rounded-3xl hover:rounded-2xl bg-white dark:bg-[#313338] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white flex items-center justify-center transition-all duration-150 shrink-0"
          >
            <Compass className="w-5 h-5" />
          </button>
        </NexusTooltip>
      </div>

      {/* 9 & 10. Bottom User Avatar (with Account Menu) + Settings Button */}
      <div className="shrink-0 w-full py-2.5 border-t border-slate-300/70 dark:border-black/30 bg-slate-200/95 dark:bg-[#1E1F22] flex flex-col items-center gap-2">
        <NexusPopover open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <NexusTooltip
            content={
              accountMenuOpen
                ? undefined
                : `${publicUser?.displayName || t(language, 'myAccount')} · ${statusLabelText}`
            }
            side={tooltipSide}
          >
            <NexusPopoverTrigger asChild>
              <button
                type="button"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                aria-label={t(language, 'accountMenu')}
                className="p-1 rounded-full hover:bg-slate-300/70 dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus"
              >
                <UserAvatar
                  src={publicUser?.avatarUrl}
                  name={publicUser?.displayName || 'User'}
                  status={effectiveSelfStatus}
                  size="md"
                  showStatus
                />
              </button>
            </NexusPopoverTrigger>
          </NexusTooltip>

          <NexusPopoverContent
            side={tooltipSide}
            align="end"
            sideOffset={12}
            className="w-64 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] shadow-2xl py-1.5 text-sm"
          >
            {/* User summary header */}
            <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10 flex items-center gap-2.5">
              <UserAvatar
                src={publicUser?.avatarUrl}
                name={publicUser?.displayName || 'User'}
                status={effectiveSelfStatus}
                size="sm"
                showStatus
              />
              <div className="min-w-0 flex-1 text-start">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {publicUser?.displayName || t(language, 'loading')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 truncate">
                  <StatusIndicator
                    status={settings.hideOnlineStatus ? 'offline' : effectiveSelfStatus}
                    className="w-2.5 h-2.5 shrink-0"
                  />
                  <span className="truncate">{statusLabelText}</span>
                </div>
                {activeCustomStatus && (
                  <div className="text-[11px] text-slate-600 dark:text-zinc-300 truncate mt-0.5">
                    {activeCustomStatus.emoji ? `${activeCustomStatus.emoji} ` : ''}
                    {activeCustomStatus.text}
                  </div>
                )}
              </div>
            </div>

            {/* Real-time Presence Status Selector */}
            <div className="px-2 py-1.5 border-b border-slate-200 dark:border-white/10 space-y-0.5">
              <div className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                {t(language, 'statusLabel')}
              </div>
              {statusOptions.map((opt) => {
                const isSelected = preferredStatus === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    onClick={() => {
                      void changePresenceStatus(opt.id);
                      setAccountMenuOpen(false);
                    }}
                    className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-start transition-colors ${
                      isSelected
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-950 dark:text-white'
                        : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <StatusIndicator
                        status={opt.id}
                        className="w-3 h-3 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">
                          {opt.label}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                          {opt.desc}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-nexus shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Account Actions: Profile, Settings, Switch Language */}
            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onOpenUserSettings('profileStatus');
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-start text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-nexus dark:hover:text-white transition-colors"
              >
                <User className="w-4 h-4 shrink-0" />
                <span>{t(language, 'profile')}</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onOpenUserSettings('account');
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-start text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-nexus dark:hover:text-white transition-colors"
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span>{t(language, 'settings')}</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  void updateSetting({ language: language === 'ar' ? 'en' : 'ar' }, { silent: true });
                }}
                className="w-full px-3 py-2 flex items-center justify-between gap-2.5 text-start text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-nexus dark:hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 shrink-0" />
                  <span>{t(language, 'switchLanguage')}</span>
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-zinc-300">
                  {language === 'ar' ? 'EN' : 'عربي'}
                </span>
              </button>
            </div>

            <div className="my-1 border-t border-slate-200 dark:border-white/10" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAccountMenuOpen(false);
                void logout();
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-start text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>{t(language, 'signOut')}</span>
            </button>
          </NexusPopoverContent>
        </NexusPopover>

        <NexusTooltip content={t(language, 'userSettings')} side={tooltipSide}>
          <button
            type="button"
            onClick={() => onOpenUserSettings('account')}
            aria-label={t(language, 'userSettings')}
            className="w-10 h-10 rounded-2xl text-slate-600 dark:text-zinc-300 hover:bg-slate-300/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </NexusTooltip>
      </div>
    </nav>
  );
}
