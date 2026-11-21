import {
  BellOff,
  Command,
  Headphones,
  Mic,
  MicOff,
  PanelLeftClose,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/translations';
import type { DirectMessageThread, GroupDm, PublicUser } from '../types/nexus';
import { getEffectiveUserStatus, getGroupDisplayName } from '../utils/validation';
import { CollapsibleBody } from './CollapsibleSection';
import { GroupAvatar, UserAvatar } from './NexusLogo';
import { SidebarMemberSearch } from './SidebarMemberSearch';
import { NexusTooltip } from './ui/NexusUI';

interface FriendsAndDmSidebarProps {
  activeDmId: string | null;
  activeGroupId?: string | null;
  dmThreads: DirectMessageThread[];
  groups?: GroupDm[];
  mutedGroupIds?: Set<string>;
  unreadCountsByConv?: Record<string, number>;
  usersById: Record<string, PublicUser>;
  pendingFriendCount: number;
  publicUser: PublicUser | null;
  onCollapseSidebar?: () => void;
  onSelectFriends: () => void;
  onSelectDm: (dmId: string) => void;
  onSelectGroup?: (groupId: string) => void;
  onOpenCreateGroup?: () => void;
  onStartDm?: (targetUid: string) => void;
  onAddFriend?: (username: string) => void;
  onAfterSelectMember?: () => void;
  onOpenQuickSwitcher: () => void;
  onOpenUserSettings?: () => void;
  voiceMuted?: boolean;
  voiceDeafened?: boolean;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
}

export function FriendsAndDmSidebar({
  activeDmId,
  activeGroupId = null,
  dmThreads,
  groups = [],
  mutedGroupIds,
  unreadCountsByConv = {},
  usersById,
  pendingFriendCount,
  publicUser,
  onCollapseSidebar,
  onSelectFriends,
  onSelectDm,
  onSelectGroup,
  onOpenCreateGroup,
  onStartDm,
  onAddFriend,
  onAfterSelectMember,
  onOpenQuickSwitcher,
  onOpenUserSettings,
  voiceMuted = false,
  voiceDeafened = false,
  onToggleMute,
  onToggleDeafen,
}: FriendsAndDmSidebarProps) {
  const { language, presenceNowMs } = useAuth();
  const myUid = publicUser?.uid || '';
  const tooltipSide = language === 'ar' ? 'left' : 'right';
  const dmsCollapsed = false;

  const combinedItems = [
    ...dmThreads.map((dm) => ({
      kind: 'dm' as const,
      id: dm.id,
      sortMs: dm.lastMessageAt?.toMillis?.() || dm.updatedAt?.toMillis?.() || 0,
      dm,
    })),
    ...groups.map((group) => ({
      kind: 'group' as const,
      id: group.id,
      sortMs:
        group.lastMessageAt?.toMillis?.() ||
        group.updatedAt?.toMillis?.() ||
        group.createdAt?.toMillis?.() ||
        0,
      group,
    })),
  ].sort((a, b) => b.sortMs - a.sortMs);

  return (
    <aside className="w-60 shrink-0 h-full bg-slate-100 dark:bg-[#2B2D31] flex flex-col border-e border-slate-200 dark:border-black/25 select-none">
      {/* Fixed Header with Search & Collapse Button */}
      <div className="h-12 px-2.5 flex items-center justify-between gap-1.5 border-b border-slate-200 dark:border-black/25 shrink-0">
        <div className="flex-1 min-w-0">
          <SidebarMemberSearch
            myUid={myUid || ''}
            usersById={usersById}
            onStartDm={onStartDm || onSelectDm}
            onAddFriend={onAddFriend}
            onAfterSelect={onAfterSelectMember}
            compact
            trailingAction={
              <NexusTooltip
                content={`${t(language, 'quickSwitcher')} (Ctrl+K)`}
                side="bottom"
              >
                <button
                  type="button"
                  onClick={onOpenQuickSwitcher}
                  aria-label={t(language, 'quickSwitcher')}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1F22] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
                >
                  <Command className="w-3.5 h-3.5" />
                </button>
              </NexusTooltip>
            }
          />
        </div>

        {onCollapseSidebar && (
          <NexusTooltip
            content={`${t(language, 'collapseSidebar')} (Ctrl+B)`}
            side="bottom"
          >
            <button
              type="button"
              onClick={onCollapseSidebar}
              aria-label={t(language, 'collapseSidebar')}
              aria-expanded={true}
              aria-keyshortcuts="Control+b"
              className="p-1.5 rounded-md border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#1E1F22] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white shadow-xs transition-colors shrink-0"
            >
              <PanelLeftClose className="w-4 h-4 rtl:rotate-180" />
            </button>
          </NexusTooltip>
        )}
      </div>

      {/* Friends + DM & Group List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Fixed Friends Entry */}
        <button
          type="button"
          onClick={onSelectFriends}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeDmId === null && activeGroupId === null
              ? 'bg-nexus/10 text-nexus'
              : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-[#35373C]'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Users className="w-4 h-4" />
            <span>{t(language, 'friends')}</span>
          </span>
          {pendingFriendCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold tabular-nums">
              {pendingFriendCount}
            </span>
          )}
        </button>

        {/* Collapsible Direct Messages & Groups Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-1 px-1.5 py-1">
            <div className="flex-1 min-w-0 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 tabular-nums">
              <span className="truncate">
                {t(language, 'directMessages')} — {combinedItems.length}
              </span>
            </div>

            {onOpenCreateGroup && (
              <NexusTooltip content={t(language, 'createGroup')} side="top">
                <button
                  type="button"
                  onClick={onOpenCreateGroup}
                  aria-label={t(language, 'createGroup')}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 hover:text-nexus transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </NexusTooltip>
            )}
          </div>

          {combinedItems.length === 0 ? (
            <CollapsibleBody isOpen={!dmsCollapsed}>
              <p className="px-2 py-2 text-xs text-slate-500 dark:text-zinc-500">
                {t(language, 'noDmsYet')}
              </p>
            </CollapsibleBody>
          ) : (
            combinedItems.map((item) => {
              if (item.kind === 'group') {
                const group = item.group;
                const isActive = activeGroupId === group.id;
                const groupTitle = getGroupDisplayName(group, usersById, myUid, language);
                const isMuted = mutedGroupIds?.has(group.id) ?? false;
                const unreadCount = !isActive ? unreadCountsByConv[`grp_${group.id}`] || 0 : 0;

                return (
                  <CollapsibleBody key={`g_${group.id}`} isOpen={!dmsCollapsed || isActive}>
                    <button
                      type="button"
                      onClick={() => onSelectGroup?.(group.id)}
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-start transition-colors ${
                        isActive
                          ? 'bg-slate-200/90 dark:bg-[#404249] text-slate-950 dark:text-white font-medium'
                          : unreadCount > 0
                          ? 'text-slate-950 dark:text-white font-semibold hover:bg-slate-200/60 dark:hover:bg-[#35373C]'
                          : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/60 dark:hover:bg-[#35373C] hover:text-slate-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      <GroupAvatar src={group.iconUrl} name={groupTitle} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm truncate">{groupTitle}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isMuted && (
                              <BellOff className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                            )}
                            {unreadCount > 0 ? (
                              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums">
                                {group.memberIds.length}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] opacity-70 truncate">
                          {group.lastMessagePreview
                            ? group.lastMessagePreview
                            : `${group.memberIds.length} ${t(language, 'members')}`}
                        </div>
                      </div>
                    </button>
                  </CollapsibleBody>
                );
              }

              const dm = item.dm;
              const otherUid = dm.participants.find((id) => id !== myUid) || '';
              const otherUser = usersById[otherUid];
              const isActive = activeDmId === dm.id;
              const unreadCount = !isActive ? unreadCountsByConv[`dm_${dm.id}`] || 0 : 0;
              const effectiveStatus = getEffectiveUserStatus(
                otherUser?.status,
                otherUser?.lastSeen?.toMillis?.(),
                presenceNowMs
              );

              return (
                <CollapsibleBody key={dm.id} isOpen={!dmsCollapsed || isActive}>
                  <button
                    type="button"
                    onClick={() => onSelectDm(dm.id)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-start transition-colors ${
                      isActive
                        ? 'bg-slate-200/90 dark:bg-[#404249] text-slate-950 dark:text-white font-medium'
                        : unreadCount > 0
                        ? 'text-slate-950 dark:text-white font-semibold hover:bg-slate-200/60 dark:hover:bg-[#35373C]'
                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200/60 dark:hover:bg-[#35373C] hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <UserAvatar
                      src={otherUser?.avatarUrl}
                      name={otherUser?.displayName || 'User'}
                      status={effectiveStatus}
                      size="sm"
                      showStatus
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm truncate">
                          {otherUser?.displayName || 'User'}
                        </span>
                        {unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shrink-0">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </div>
                      {dm.lastMessagePreview && (
                        <div className="text-[11px] opacity-70 truncate">
                          {dm.lastMessagePreview}
                        </div>
                      )}
                    </div>
                  </button>
                </CollapsibleBody>
              );
            })
          )}
        </div>
      </div>

      <div className="h-[62px] px-2.5 border-t border-slate-200/80 dark:border-black/25 bg-slate-100/95 dark:bg-[#232428] flex items-center gap-2 shrink-0">
        <UserAvatar
          src={publicUser?.avatarUrl}
          name={publicUser?.displayName || 'User'}
          status={getEffectiveUserStatus(
            publicUser?.status,
            publicUser?.lastSeen?.toMillis?.(),
            presenceNowMs
          )}
          size="sm"
          showStatus
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
            {publicUser?.displayName || t(language, 'myAccount')}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
            @{publicUser?.username || 'majlis'}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {onToggleMute && (
            <NexusTooltip content={voiceMuted ? t(language, 'unmute') : t(language, 'mute')} side="top">
              <button type="button" onClick={onToggleMute} aria-label={voiceMuted ? t(language, 'unmute') : t(language, 'mute')} className="w-8 h-8 rounded-md text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white flex items-center justify-center">
                {voiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </NexusTooltip>
          )}
          {onToggleDeafen && (
            <NexusTooltip content={voiceDeafened ? t(language, 'undeafen') : t(language, 'deafen')} side="top">
              <button type="button" onClick={onToggleDeafen} aria-label={voiceDeafened ? t(language, 'undeafen') : t(language, 'deafen')} className="w-8 h-8 rounded-md text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white flex items-center justify-center">
                <Headphones className={`w-4 h-4 ${voiceDeafened ? 'text-rose-500' : ''}`} />
              </button>
            </NexusTooltip>
          )}
          {onOpenUserSettings && (
            <NexusTooltip content={t(language, 'settings')} side="top">
              <button type="button" onClick={onOpenUserSettings} aria-label={t(language, 'settings')} className="w-8 h-8 rounded-md text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white flex items-center justify-center">
                <Settings className="w-4 h-4" />
              </button>
            </NexusTooltip>
          )}
        </div>
      </div>
    </aside>
  );
}
