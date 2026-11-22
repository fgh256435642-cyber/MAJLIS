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
import type { DirectMessageThread, GroupDm, PublicUser } from '../types/majlis';
import { getEffectiveUserStatus, getGroupDisplayName } from '../utils/validation';
import { CollapsibleBody } from './CollapsibleSection';
import { GroupAvatar, UserAvatar } from './MajlisLogo';
import { SidebarMemberSearch } from './SidebarMemberSearch';
import { MajlisTooltip } from './ui/MajlisUI';

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
    <aside className="w-60 shrink-0 h-full bg-main dark:bg-main flex flex-col border-accent border-border dark:border-border select-none">
      {/* Fixed Header with Search & Collapse Button */}
      <div className="h-12 px-2.5 flex items-center justify-between gap-1.5 border-accent border-border dark:border-border shrink-0">
        <div className="flex-1 min-w-0">
          <SidebarMemberSearch
            myUid={myUid || ''}
            usersById={usersById}
            onStartDm={onStartDm || onSelectDm}
            onAddFriend={onAddFriend}
            onAfterSelect={onAfterSelectMember}
            compact
            trailingAction={
              <MajlisTooltip
                content={`${t(language, 'quickSwitcher')} (Ctrl+K)`}
                side="bottom"
              >
                <button
                  type="button"
                  onClick={onOpenQuickSwitcher}
                  aria-label={t(language, 'quickSwitcher')}
                  className="p-1.5 rounded-md border border-border dark:border-border bg-elevated dark:bg-elevated text-text-muted dark:text-text-muted hover:text-text dark:hover:text-text transition-colors shrink-0"
                >
                  <Command className="w-3.5 h-3.5" />
                </button>
              </MajlisTooltip>
            }
          />
        </div>

        {onCollapseSidebar && (
          <MajlisTooltip
            content={`${t(language, 'collapseSidebar')} (Ctrl+B)`}
            side="bottom"
          >
            <button
              type="button"
              onClick={onCollapseSidebar}
              aria-label={t(language, 'collapseSidebar')}
              aria-expanded={true}
              aria-keyshortcuts="Control+b"
              className="p-1.5 rounded-md border border-border bg-elevated text-text hover:bg-hover hover:text-text shadow-xs transition-colors shrink-0"
            >
              <PanelLeftClose className="w-4 h-4 rtl:rotate-180" />
            </button>
          </MajlisTooltip>
        )}
      </div>

      {/* Friends + DM & Group List */}
      <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-3">
        {/* Fixed Friends Entry */}
        <button
          type="button"
          onClick={onSelectFriends}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-link font-medium transition-colors ${
            activeDmId === null && activeGroupId === null
              ? 'bg-accent/10 text-link'
              : 'text-text dark:text-text hover:bg-hover/60 dark:hover:bg-hover/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Users className="w-4 h-4" />
            <span>{t(language, 'friends')}</span>
          </span>
          {pendingFriendCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-danger text-text text-[10px] font-bold tabular-nums">
              {pendingFriendCount}
            </span>
          )}
        </button>

        {/* Collapsible Direct Messages & Groups Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-1 px-1.5 py-1">
            <div className="flex-1 min-w-0 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted tabular-nums">
              <span className="truncate">
                {t(language, 'directMessages')} — {combinedItems.length}
              </span>
            </div>

            {onOpenCreateGroup && (
              <MajlisTooltip content={t(language, 'createGroup')} side="top">
                <button
                  type="button"
                  onClick={onOpenCreateGroup}
                  aria-label={t(language, 'createGroup')}
                  className="p-1 rounded hover:bg-hover dark:hover:bg-hover text-text-muted dark:text-text-muted hover:text-link transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </MajlisTooltip>
            )}
          </div>

          {combinedItems.length === 0 ? (
            <CollapsibleBody isOpen={!dmsCollapsed}>
              <div className="px-3 py-6 text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <p className="text-sm leading-6 text-text-muted break-words">
                  {t(language, 'noDmsYet')}
                </p>
              </div>
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
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-link transition-colors ${
                        isActive
                          ? 'bg-hover/90 dark:bg-hover/90 text-text dark:text-text font-medium'
                          : unreadCount > 0
                          ? 'text-text dark:text-text font-semibold hover:bg-hover/60 dark:hover:bg-hover/60'
                          : 'text-text dark:text-text hover:bg-hover/60 dark:hover:bg-hover/60 hover:text-text dark:hover:text-text'
                      }`}
                    >
                      <GroupAvatar src={group.iconUrl} name={groupTitle} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-link truncate">{groupTitle}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isMuted && (
                              <BellOff className="w-3 h-3 text-text-muted dark:text-text-muted" />
                            )}
                            {unreadCount > 0 ? (
                              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-text text-[10px] font-bold flex items-center justify-center tabular-nums">
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            ) : (
                              <span className="text-[10px] text-text-muted dark:text-text-muted tabular-nums">
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
                    className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-link transition-colors ${
                      isActive
                        ? 'bg-hover/90 dark:bg-hover/90 text-text dark:text-text font-medium'
                        : unreadCount > 0
                        ? 'text-text dark:text-text font-semibold hover:bg-hover/60 dark:hover:bg-hover/60'
                        : 'text-text dark:text-text hover:bg-hover/60 dark:hover:bg-hover/60 hover:text-text dark:hover:text-text'
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
                        <span className="text-link truncate">
                          {otherUser?.displayName || 'User'}
                        </span>
                        {unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-text text-[10px] font-bold flex items-center justify-center tabular-nums shrink-0">
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

      <div className="h-[62px] px-2.5 border-accent border-border dark:border-border bg-main/95 dark:bg-main/95 flex items-center gap-2 shrink-0">
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
          <div className="text-[10px] text-text-muted dark:text-text-muted truncate">
            <bdi dir="ltr">{publicUser?.username ? `@${publicUser.username}` : '@majlis'}</bdi>
          </div>
          <div className="text-link font-semibold text-text dark:text-text truncate mt-0.5">
            {publicUser?.displayName || t(language, 'myAccount')}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {onToggleMute && (
            <MajlisTooltip content={voiceMuted ? t(language, 'unmute') : t(language, 'mute')} side="top">
              <button type="button" onClick={onToggleMute} aria-label={voiceMuted ? t(language, 'unmute') : t(language, 'mute')} className="w-8 h-8 rounded-md text-text-muted dark:text-text-muted hover:bg-hover dark:hover:bg-hover hover:text-text dark:hover:text-text flex items-center justify-center">
                {voiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </MajlisTooltip>
          )}
          {onToggleDeafen && (
            <MajlisTooltip content={voiceDeafened ? t(language, 'undeafen') : t(language, 'deafen')} side="top">
              <button type="button" onClick={onToggleDeafen} aria-label={voiceDeafened ? t(language, 'undeafen') : t(language, 'deafen')} className="w-8 h-8 rounded-md text-text-muted dark:text-text-muted hover:bg-hover dark:hover:bg-hover hover:text-text dark:hover:text-text flex items-center justify-center">
                <Headphones className={`w-4 h-4 ${voiceDeafened ? 'text-danger' : ''}`} />
              </button>
            </MajlisTooltip>
          )}
          {onOpenUserSettings && (
            <MajlisTooltip content={t(language, 'settings')} side="top">
              <button type="button" onClick={onOpenUserSettings} aria-label={t(language, 'settings')} className="w-8 h-8 rounded-md text-text-muted dark:text-text-muted hover:bg-hover dark:hover:bg-hover hover:text-text dark:hover:text-text flex items-center justify-center">
                <Settings className="w-4 h-4" />
              </button>
            </MajlisTooltip>
          )}
        </div>
      </div>
    </aside>
  );
}
