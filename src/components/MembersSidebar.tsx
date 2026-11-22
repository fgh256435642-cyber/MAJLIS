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
import { blockUser, unblockUser } from '../services/majlisService';
import type { PublicUser, Role, ServerMember } from '../types/majlis';
import {
  getActiveCustomStatus,
  getEffectiveUserStatus,
  getRoleColorClass,
  hasPermission,
  isUserEffectivelyOnline,
} from '../utils/validation';
import { CollapseChevron, CollapsibleBody } from './CollapsibleSection';
import { StatusIndicator, UserAvatar } from './MajlisLogo';
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
    usePersistentCollapseMap(`majlis_collapsed_members_${serverId}`);

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
        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-link hover:bg-hover/70 dark:hover:bg-hover/70 transition-colors ${
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
            <span className={`text-link font-medium truncate ${getRoleColorClass(m.role)}`}>
              {displayName}
            </span>
            {m.role === 'owner' && (
              <Crown className="w-3.5 h-3.5 text-warning shrink-0" />
            )}
            {(m.role === 'admin' || m.role === 'moderator') && (
              <Shield className="w-3 h-3 text-success shrink-0" />
            )}
          </div>
          {normalizedTerm ? (
            <div className="text-[11px] text-text-muted dark:text-text-muted truncate">
              @{username}
            </div>
          ) : (() => {
            const custom = getActiveCustomStatus(pub, presenceNowMs);
            if (custom && !isOffline) {
              return (
                <div className="text-[11px] text-text-muted dark:text-text-muted truncate">
                  {custom.emoji} {custom.text}
                </div>
              );
            }
            if (pub?.bio && !isOffline) {
              return (
                <div className="text-[11px] text-text-muted dark:text-text-muted truncate">
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
    <aside className="relative w-60 shrink-0 h-full bg-main dark:bg-main border-accent border-border dark:border-border flex flex-col select-none">
      {/* Member Search Bar & Panel Collapse Toggle */}
      <div className="h-12 px-2.5 flex items-center gap-1.5 border-accent border-border dark:border-border shrink-0">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-text-muted dark:text-text-muted absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            } py-1.5 rounded-md border border-border dark:border-border bg-elevated dark:bg-elevated text-link text-text dark:text-text placeholder:text-text-muted dark:placeholder:text-text-muted focus:outline-accent focus:ring-2 focus:ring-accent transition-colors`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t(language, 'clearSearch')}
              className="absolute end-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text dark:hover:text-text transition-colors"
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
            className="p-1.5 rounded-md text-text-muted dark:text-text-muted hover:bg-hover/70 dark:hover:bg-hover/70 hover:text-text dark:hover:text-text transition-colors shrink-0"
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
              className="w-full px-2 py-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted hover:text-text dark:hover:text-text transition-colors tabular-nums text-link rounded focus:outline-accent focus-visible:ring-2 focus-visible:ring-accent"
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
              className="w-full px-2 py-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted hover:text-text dark:hover:text-text transition-colors tabular-nums text-link rounded focus:outline-accent focus-visible:ring-2 focus-visible:ring-accent"
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
          <div className="py-10 px-3 text-link space-y-2">
            <p className="text-link text-text-muted dark:text-text-muted">
              {t(language, 'noMatchingMembers')}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-link font-medium text-link hover:underline"
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
          <div className="fixed bottom-4 end-4 sm:absolute sm:top-4 sm:bottom-auto sm:end-64 z-40 w-68 rounded-xl border border-border dark:border-border bg-elevated dark:bg-elevated shadow-2xl overflow-hidden">
            {selectedPub?.profileVisible !== false && (
              <ProfileBanner
                bannerUrl={selectedPub?.bannerUrl}
                profileColor={selectedPub?.profileColor}
                className="h-14"
              />
            )}
            <div className="p-4 pt-0 space-y-3">
              <div className="-mt-7 flex items-end justify-between">
                <UserAvatar
                  src={selectedPub?.avatarUrl ?? selectedMember.avatarUrl}
                  name={selectedPub?.displayName || selectedMember.displayName}
                  status={selectedStatus}
                  size="lg"
                  showStatus
                />
              </div>

              <div className="min-w-0">
                <div className="font-semibold text-link text-text dark:text-text truncate">
                  {selectedPub?.displayName || selectedMember.displayName}
                </div>
                <div className="text-link text-text-muted dark:text-text-muted truncate">
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
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-text-muted dark:text-text-muted">
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
                    <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-main dark:bg-main text-link text-text dark:text-text flex items-center gap-1.5">
                      {custom.emoji && <span>{custom.emoji}</span>}
                      <span className="truncate">{custom.text}</span>
                    </div>
                  );
                })()}
              </div>

            {selectedPub?.profileVisible !== false && selectedPub?.bio && (
              <p className="text-link text-text dark:text-text break-words">
                {selectedPub.bio}
              </p>
            )}

            {selectedMember.uid !== myUid && (
              <div className="space-y-1.5 pt-1 border-accent border-border dark:border-border">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onStartDm(selectedMember.uid);
                      setSelectedMember(null);
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md bg-accent hover:bg-majlis-hover text-text text-link font-medium transition-colors"
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
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border border-border dark:border-border hover:bg-main dark:hover:bg-main text-link font-medium transition-colors"
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
                      className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-link font-medium transition-colors ${
                        isBlocked
                          ? 'bg-main dark:bg-main text-text dark:text-text'
                          : 'bg-danger/10 text-danger dark:text-danger hover:bg-danger/20'
                      }`}
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      <span>{isBlocked ? t(language, 'unblockUser') : t(language, 'blockUser')}</span>
                    </button>
                  );
                })()}

                {canActOnTarget && canManageRoles && (
                  <div className="pt-1.5">
                    <label className="block text-[11px] font-medium text-text-muted dark:text-text-muted mb-1">
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
                      className="w-full px-2 py-1.5 rounded-md border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
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
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md bg-warning/15 text-warning dark:text-warning hover:bg-warning/25 text-link font-medium transition-colors"
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
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md bg-danger/15 text-danger dark:text-danger hover:bg-danger/25 text-link font-medium transition-colors"
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
