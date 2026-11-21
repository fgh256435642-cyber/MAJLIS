import { useState } from 'react';
import {
  Ban,
  Crown,
  MessageSquare,
  PanelRightClose,
  Search,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePersistentCollapseMap } from '../hooks/useCollapsibleState';
import { useToast } from '../hooks/useToast';
import { useUserSettings } from '../hooks/useUserSettings';
import { t } from '../i18n/translations';
import { blockUser, unblockUser } from '../services/nexusService';
import type { PublicUser, Role, ServerMember } from '../types/nexus';
import {
  getActiveCustomStatus,
  getEffectiveUserStatus,
  getRoleColorClass,
  hasPermission,
  isUserEffectivelyOnline,
} from '../utils/validation';
import { CollapseChevron, CollapsibleBody } from './CollapsibleSection';
import { StatusIndicator, UserAvatar } from './NexusLogo';
import { ProfileBanner } from './ProfileBanner';

interface MembersSidebarProps {
  serverId: string;
  members: ServerMember[];
  usersById: Record<string, PublicUser>;
  myUid: string;
  myRole: Role;
  onClosePanel?: () => void;
  onStartDm: (targetUid: string) => void;
  onAddFriend: (username: string) => void;
  onChangeRole: (targetUid: string, role: Exclude<Role, 'owner'>) => void;
  onKickMember: (member: ServerMember) => void;
  onBanMember: (member: ServerMember) => void;
}

export function MembersSidebar({
  serverId,
  members,
  usersById,
  myUid,
  myRole,
  onClosePanel,
  onStartDm,
  onAddFriend,
  onChangeRole,
  onKickMember,
  onBanMember,
}: MembersSidebarProps) {
  const { language, presenceNowMs, effectiveSelfStatus } = useAuth();
  const { blockedUserIds } = useUserSettings();
  const { pushToast } = useToast();
  const [selectedMember, setSelectedMember] = useState<ServerMember | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { isCollapsed: isGroupCollapsed, toggleSection: toggleGroup } =
    usePersistentCollapseMap(`nexus_collapsed_members_${serverId}`);

  const rawTerm = searchQuery.trim().toLowerCase();
  const normalizedTerm = rawTerm.startsWith('@') ? rawTerm.slice(1) : rawTerm;

  const filteredMembers = normalizedTerm
    ? members.filter((m) => {
        const pub = usersById[m.uid];
        const displayName = (pub?.displayName || m.displayName).toLowerCase();
        const username = (pub?.username || m.username).toLowerCase();
        return (
          displayName.includes(normalizedTerm) ||
          username.includes(normalizedTerm)
        );
      })
    : members;

  const onlineMembers: ServerMember[] = [];
  const offlineMembers: ServerMember[] = [];

  for (const m of filteredMembers) {
    const pub = usersById[m.uid];
    const lastSeenMs = pub?.lastSeen?.toMillis?.();
    const effectiveOnline =
      m.uid === myUid
        ? effectiveSelfStatus !== 'offline'
        : isUserEffectivelyOnline(pub?.status, lastSeenMs, presenceNowMs);

    if (effectiveOnline) onlineMembers.push(m);
    else offlineMembers.push(m);
  }

  const roleOrder: Record<Role, number> = { owner: 0, admin: 1, moderator: 2, member: 3 };
  const sortFn = (a: ServerMember, b: ServerMember) =>
    roleOrder[a.role] - roleOrder[b.role] || a.displayName.localeCompare(b.displayName);

  onlineMembers.sort(sortFn);
  offlineMembers.sort(sortFn);

  const renderMemberRow = (m: ServerMember, isOffline: boolean) => {
    const pub = usersById[m.uid];
    const displayName = pub?.displayName || m.displayName;
    const username = pub?.username || m.username;
    const avatarUrl = pub?.avatarUrl ?? m.avatarUrl;
    const status =
      m.uid === myUid
        ? effectiveSelfStatus
        : isOffline
        ? 'offline'
        : getEffectiveUserStatus(pub?.status, pub?.lastSeen?.toMillis?.(), presenceNowMs);

    return (
      <button
        key={m.uid}
        type="button"
        onClick={() => setSelectedMember(selectedMember?.uid === m.uid ? null : m)}
        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-start hover:bg-slate-200/70 dark:hover:bg-[#35373C] transition-colors ${
          isOffline ? 'opacity-50 hover:opacity-100' : ''
        }`}
      >
        <UserAvatar
          src={avatarUrl}
          name={displayName}
          status={status}
          size="sm"
          showStatus
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-medium truncate ${getRoleColorClass(m.role)}`}>
              {displayName}
            </span>
            {m.role === 'owner' && (
              <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
            {(m.role === 'admin' || m.role === 'moderator') && (
              <Shield className="w-3 h-3 text-emerald-500 shrink-0" />
            )}
          </div>
          {normalizedTerm ? (
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
              @{username}
            </div>
          ) : (() => {
            const custom = getActiveCustomStatus(pub, presenceNowMs);
            if (custom && !isOffline) {
              return (
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {custom.emoji} {custom.text}
                </div>
              );
            }
            if (pub?.bio && !isOffline) {
              return (
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {pub.bio}
                </div>
              );
            }
            return null;
          })()}
        </div>
      </button>
    );
  };

  const selectedPub = selectedMember ? usersById[selectedMember.uid] : null;
  const selectedStatus = selectedMember
    ? selectedMember.uid === myUid
      ? effectiveSelfStatus
      : getEffectiveUserStatus(
          selectedPub?.status,
          selectedPub?.lastSeen?.toMillis?.(),
          presenceNowMs
        )
    : 'offline';
  const canManageRoles = hasPermission(myRole, 'manage_roles');
  const canKick = hasPermission(myRole, 'kick_members');
  const canBan = hasPermission(myRole, 'ban_members');

  const canActOnTarget =
    selectedMember &&
    selectedMember.uid !== myUid &&
    selectedMember.role !== 'owner' &&
    !(myRole === 'admin' && selectedMember.role === 'admin') &&
    !(myRole === 'moderator' && selectedMember.role !== 'member');

  const onlineCollapsed = !normalizedTerm && isGroupCollapsed('online');
  const offlineCollapsed = !normalizedTerm && isGroupCollapsed('offline');

  return (
    <aside className="relative w-60 shrink-0 h-full bg-slate-100 dark:bg-[#2B2D31] border-s border-slate-200 dark:border-black/25 flex flex-col select-none">
      {/* Member Search Bar & Panel Collapse Toggle */}
      <div className="h-12 px-2.5 flex items-center gap-1.5 border-b border-slate-200 dark:border-black/25 shrink-0">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && searchQuery) {
                e.stopPropagation();
                setSearchQuery('');
              }
            }}
            placeholder={t(language, 'searchMembersPlaceholder')}
            aria-label={t(language, 'searchMembers')}
            className={`w-full ps-8 ${
              searchQuery ? 'pe-7' : 'pe-2.5'
            } py-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1F22] text-xs text-slate-900 dark:text-[#F2F3F5] placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-nexus transition-colors`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t(language, 'clearSearch')}
              className="absolute end-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {onClosePanel && (
          <button
            type="button"
            onClick={onClosePanel}
            title={t(language, 'hideMembers')}
            aria-label={t(language, 'hideMembers')}
            className="p-1.5 rounded-md text-slate-500 dark:text-zinc-400 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
          >
            <PanelRightClose className="w-4 h-4 rtl:rotate-180" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {onlineMembers.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              aria-expanded={!onlineCollapsed}
              onClick={() => toggleGroup('online')}
              className="w-full px-2 py-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors tabular-nums text-start rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-nexus"
            >
              <CollapseChevron collapsed={onlineCollapsed} className="w-3 h-3" />
              <span>
                {t(language, 'online')} — {onlineMembers.length}
              </span>
            </button>
            <CollapsibleBody isOpen={!onlineCollapsed}>
              <div className="space-y-0.5">
                {onlineMembers.map((m) => renderMemberRow(m, false))}
              </div>
            </CollapsibleBody>
          </div>
        )}

        {offlineMembers.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              aria-expanded={!offlineCollapsed}
              onClick={() => toggleGroup('offline')}
              className="w-full px-2 py-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors tabular-nums text-start rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-nexus"
            >
              <CollapseChevron collapsed={offlineCollapsed} className="w-3 h-3" />
              <span>
                {t(language, 'offline')} — {offlineMembers.length}
              </span>
            </button>
            <CollapsibleBody isOpen={!offlineCollapsed}>
              <div className="space-y-0.5">
                {offlineMembers.map((m) => renderMemberRow(m, true))}
              </div>
            </CollapsibleBody>
          </div>
        )}

        {filteredMembers.length === 0 && (
          <div className="py-10 px-3 text-center space-y-2">
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {t(language, 'noMatchingMembers')}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs font-medium text-nexus hover:underline"
              >
                {t(language, 'clearSearch')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Member Quick Profile Popover */}
      {selectedMember && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setSelectedMember(null)}
          />
          <div className="fixed bottom-4 end-4 sm:absolute sm:top-4 sm:bottom-auto sm:end-64 z-40 w-68 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] shadow-2xl overflow-hidden">
            {selectedPub?.profileVisible !== false && (
              <ProfileBanner
                bannerUrl={selectedPub?.bannerUrl}
                profileColor={selectedPub?.profileColor}
                className="h-14"
              />
            )}
            <div className="p-4 pt-0 space-y-3">
              <div className="-mt-7 flex items-end justify-between">
                <div className="rounded-full bg-transparent">
                  <UserAvatar
                    src={selectedPub?.avatarUrl ?? selectedMember.avatarUrl}
                    name={selectedPub?.displayName || selectedMember.displayName}
                    status={selectedStatus}
                    size="lg"
                    showStatus
                  />
                </div>
              </div>

              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                  {selectedPub?.displayName || selectedMember.displayName}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                  @{selectedPub?.username || selectedMember.username} ·{' '}
                  <span className={getRoleColorClass(selectedMember.role)}>
                    {selectedMember.role === 'owner'
                      ? t(language, 'roleOwner')
                      : selectedMember.role === 'admin'
                      ? t(language, 'roleAdmin')
                      : selectedMember.role === 'moderator'
                      ? t(language, 'roleModerator')
                      : t(language, 'roleMember')}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                  <StatusIndicator status={selectedStatus} className="w-2 h-2 shrink-0" />
                  <span>
                    {selectedStatus === 'online'
                      ? t(language, 'online')
                      : selectedStatus === 'idle'
                      ? t(language, 'idle')
                      : selectedStatus === 'dnd'
                      ? t(language, 'dnd')
                      : t(language, 'offline')}
                  </span>
                </div>
                {(() => {
                  if (selectedPub?.profileVisible === false) return null;
                  const custom = getActiveCustomStatus(selectedPub, presenceNowMs);
                  if (!custom) return null;
                  return (
                    <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1E1F22] text-xs text-slate-700 dark:text-zinc-200 flex items-center gap-1.5">
                      {custom.emoji && <span>{custom.emoji}</span>}
                      <span className="truncate">{custom.text}</span>
                    </div>
                  );
                })()}
              </div>

            {selectedPub?.profileVisible !== false && selectedPub?.bio && (
              <p className="text-xs text-slate-600 dark:text-zinc-300 break-words">
                {selectedPub.bio}
              </p>
            )}

            {selectedMember.uid !== myUid && (
              <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-white/10">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onStartDm(selectedMember.uid);
                      setSelectedMember(null);
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md bg-nexus hover:bg-nexus-hover text-white text-xs font-medium transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{t(language, 'messageUser')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onAddFriend(selectedPub?.username || selectedMember.username);
                      setSelectedMember(null);
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{t(language, 'addFriend')}</span>
                  </button>
                </div>

                {(() => {
                  const isBlocked = blockedUserIds.has(selectedMember.uid);
                  const targetProfile: PublicUser = selectedPub || ({
                    uid: selectedMember.uid,
                    username: selectedMember.username,
                    usernameLower: selectedMember.username.toLowerCase(),
                    displayName: selectedMember.displayName,
                    avatarUrl: selectedMember.avatarUrl,
                    status: 'offline',
                    isDiscoverable: true,
                  } as PublicUser);
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        if (isBlocked) {
                          await unblockUser(myUid, selectedMember.uid);
                          pushToast({ type: 'info', title: t(language, 'userUnblockedToast') });
                        } else {
                          await blockUser(myUid, targetProfile);
                          pushToast({ type: 'info', title: t(language, 'userBlockedToast') });
                        }
                        setSelectedMember(null);
                      }}
                      className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
                        isBlocked
                          ? 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-zinc-200'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
                      }`}
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      <span>{isBlocked ? t(language, 'unblockUser') : t(language, 'blockUser')}</span>
                    </button>
                  );
                })()}

                {canActOnTarget && canManageRoles && (
                  <div className="pt-1.5">
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-1">
                      {t(language, 'roles')}
                    </label>
                    <select
                      value={selectedMember.role}
                      onChange={(e) => {
                        onChangeRole(
                          selectedMember.uid,
                          e.target.value as Exclude<Role, 'owner'>
                        );
                        setSelectedMember(null);
                      }}
                      className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-xs"
                    >
                      {myRole === 'owner' && <option value="admin">{t(language, 'roleAdmin')}</option>}
                      <option value="moderator">{t(language, 'roleModerator')}</option>
                      <option value="member">{t(language, 'roleMember')}</option>
                    </select>
                  </div>
                )}

                {canActOnTarget && (canKick || canBan) && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {canKick && (
                      <button
                        type="button"
                        onClick={() => {
                          onKickMember(selectedMember);
                          setSelectedMember(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 text-xs font-medium transition-colors"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>{t(language, 'kick')}</span>
                      </button>
                    )}
                    {canBan && (
                      <button
                        type="button"
                        onClick={() => {
                          onBanMember(selectedMember);
                          setSelectedMember(null);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25 text-xs font-medium transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>{t(language, 'ban')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
