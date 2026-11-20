import { useState } from 'react';
import {
  Crown,
  LogOut,
  MessageSquare,
  PanelRightClose,
  Search,
  Settings,
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
import type { GroupDm, PublicUser } from '../types/nexus';
import {
  getActiveCustomStatus,
  getEffectiveUserStatus,
  isUserEffectivelyOnline,
} from '../utils/validation';
import { CollapseChevron, CollapsibleBody } from './CollapsibleSection';
import { StatusIndicator, UserAvatar } from './NexusLogo';
import { ProfileBanner } from './ProfileBanner';

interface GroupMembersSidebarProps {
  group: GroupDm;
  usersById: Record<string, PublicUser>;
  myUid: string;
  onClosePanel?: () => void;
  onStartDm: (targetUid: string) => void;
  onAddFriend: (username: string) => void;
  onKickMember: (targetUid: string, targetName: string) => void;
  onTransferOwnership: (targetUid: string, targetName: string) => void;
  onOpenGroupSettings: (tab?: 'overview' | 'members' | 'add') => void;
  onLeaveGroup: () => void;
}

export function GroupMembersSidebar({
  group,
  usersById,
  myUid,
  onClosePanel,
  onStartDm,
  onAddFriend,
  onKickMember,
  onTransferOwnership,
  onOpenGroupSettings,
  onLeaveGroup,
}: GroupMembersSidebarProps) {
  const { language, presenceNowMs, effectiveSelfStatus } = useAuth();
  const { blockedUserIds } = useUserSettings();
  const { pushToast } = useToast();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmTransferUid, setConfirmTransferUid] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const { isCollapsed: isSectionCollapsed, toggleSection } =
    usePersistentCollapseMap(`nexus_collapsed_group_members_${group.id}`);

  const isOwner = group.ownerId === myUid;
  const rawTerm = searchQuery.trim().toLowerCase();
  const normalizedTerm = rawTerm.startsWith('@') ? rawTerm.slice(1) : rawTerm;

  const filteredMemberIds = normalizedTerm
    ? group.memberIds.filter((memberId) => {
        const pub = usersById[memberId];
        const displayName = (pub?.displayName || memberId).toLowerCase();
        const username = (pub?.username || '').toLowerCase();
        return displayName.includes(normalizedTerm) || username.includes(normalizedTerm);
      })
    : group.memberIds;

  const onlineIds: string[] = [];
  const offlineIds: string[] = [];

  for (const memberId of filteredMemberIds) {
    const pub = usersById[memberId];
    const effectiveOnline =
      memberId === myUid
        ? effectiveSelfStatus !== 'offline'
        : isUserEffectivelyOnline(pub?.status, pub?.lastSeen?.toMillis?.(), presenceNowMs);

    if (effectiveOnline) onlineIds.push(memberId);
    else offlineIds.push(memberId);
  }

  const sortIds = (a: string, b: string) => {
    if (a === group.ownerId) return -1;
    if (b === group.ownerId) return 1;
    const nameA = usersById[a]?.displayName || a;
    const nameB = usersById[b]?.displayName || b;
    return nameA.localeCompare(nameB);
  };

  onlineIds.sort(sortIds);
  offlineIds.sort(sortIds);

  const onlineCollapsed = !normalizedTerm && isSectionCollapsed('online');
  const offlineCollapsed = !normalizedTerm && isSectionCollapsed('offline');

  const renderMemberRow = (memberId: string, isOffline: boolean) => {
    const pub = usersById[memberId];
    const displayName = pub?.displayName || memberId.slice(0, 8);
    const username = pub?.username || memberId.slice(0, 8);
    const status =
      memberId === myUid
        ? effectiveSelfStatus
        : isOffline
        ? 'offline'
        : getEffectiveUserStatus(pub?.status, pub?.lastSeen?.toMillis?.(), presenceNowMs);
    const isMemberOwner = memberId === group.ownerId;

    return (
      <button
        key={memberId}
        type="button"
        onClick={() => {
          setConfirmTransferUid(null);
          setSelectedUid(selectedUid === memberId ? null : memberId);
        }}
        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-start hover:bg-slate-200/70 dark:hover:bg-[#35373C] transition-colors ${
          isOffline ? 'opacity-55 hover:opacity-100' : ''
        }`}
      >
        <UserAvatar
          src={pub?.avatarUrl}
          name={displayName}
          status={status}
          size="sm"
          showStatus
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-medium truncate ${
                isMemberOwner
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-900 dark:text-[#F2F3F5]'
              }`}
            >
              {displayName}
            </span>
            {isMemberOwner && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
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

  const selectedPub = selectedUid ? usersById[selectedUid] : null;
  const selectedStatus = selectedUid
    ? selectedUid === myUid
      ? effectiveSelfStatus
      : getEffectiveUserStatus(
          selectedPub?.status,
          selectedPub?.lastSeen?.toMillis?.(),
          presenceNowMs
        )
    : 'offline';

  return (
    <aside className="relative w-60 shrink-0 h-full bg-slate-100 dark:bg-[#2B2D31] border-s border-slate-200 dark:border-black/25 flex flex-col select-none">
      {/* Search Bar & Close Toggle */}
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
        {onlineIds.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              aria-expanded={!onlineCollapsed}
              onClick={() => toggleSection('online')}
              className="w-full px-2 py-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors tabular-nums text-start rounded"
            >
              <CollapseChevron collapsed={onlineCollapsed} className="w-3 h-3" />
              <span>
                {t(language, 'online')} — {onlineIds.length}
              </span>
            </button>
            <CollapsibleBody isOpen={!onlineCollapsed}>
              <div className="space-y-0.5">
                {onlineIds.map((id) => renderMemberRow(id, false))}
              </div>
            </CollapsibleBody>
          </div>
        )}

        {offlineIds.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              aria-expanded={!offlineCollapsed}
              onClick={() => toggleSection('offline')}
              className="w-full px-2 py-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors tabular-nums text-start rounded"
            >
              <CollapseChevron collapsed={offlineCollapsed} className="w-3 h-3" />
              <span>
                {t(language, 'offline')} — {offlineIds.length}
              </span>
            </button>
            <CollapsibleBody isOpen={!offlineCollapsed}>
              <div className="space-y-0.5">
                {offlineIds.map((id) => renderMemberRow(id, true))}
              </div>
            </CollapsibleBody>
          </div>
        )}

        {filteredMemberIds.length === 0 && (
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

      {/* Group Actions Footer */}
      <div className="p-2.5 border-t border-slate-200 dark:border-black/25 space-y-1.5 shrink-0">
        {isOwner && group.memberIds.length < 10 && (
          <button
            type="button"
            onClick={() => onOpenGroupSettings('add')}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-200/70 dark:hover:bg-[#35373C] transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 text-nexus" />
            <span>{t(language, 'addMembers')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onOpenGroupSettings('overview')}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-200/70 dark:hover:bg-[#35373C] transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
          <span>{t(language, 'groupSettings')}</span>
        </button>

        {!confirmLeave ? (
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t(language, 'leaveGroup')}</span>
          </button>
        ) : (
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 space-y-1.5">
            <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium">
              {t(language, 'leaveGroupConfirm')}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirmLeave(false);
                  onLeaveGroup();
                }}
                className="flex-1 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold"
              >
                {t(language, 'leaveGroup')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-white/10 text-[11px]"
              >
                {t(language, 'cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Member Quick Profile Popover */}
      {selectedUid && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => {
              setSelectedUid(null);
              setConfirmTransferUid(null);
            }}
          />
          <div className="fixed bottom-4 end-4 sm:absolute sm:top-4 sm:bottom-auto sm:end-64 z-40 w-68 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111214] shadow-2xl overflow-hidden">
            <ProfileBanner
              bannerUrl={selectedPub?.bannerUrl}
              profileColor={selectedPub?.profileColor}
              className="h-14"
            />
            <div className="p-4 pt-0 space-y-3">
              <div className="-mt-7 flex items-end">
                <div className="rounded-full bg-transparent">
                  <UserAvatar
                    src={selectedPub?.avatarUrl}
                    name={selectedPub?.displayName || selectedUid.slice(0, 8)}
                    status={selectedStatus}
                    size="lg"
                    showStatus
                  />
                </div>
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                  {selectedPub?.displayName || selectedUid.slice(0, 8)}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                  @{selectedPub?.username || selectedUid.slice(0, 6)} ·{' '}
                  <span
                    className={
                      selectedUid === group.ownerId
                        ? 'text-amber-600 dark:text-amber-400'
                        : ''
                    }
                  >
                    {selectedUid === group.ownerId
                      ? t(language, 'roleOwner')
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

            {selectedPub?.bio && (
              <p className="text-xs text-slate-600 dark:text-zinc-300 break-words">
                {selectedPub.bio}
              </p>
            )}

            {selectedUid !== myUid && (
              <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-white/10">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onStartDm(selectedUid);
                      setSelectedUid(null);
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md bg-nexus hover:bg-nexus-hover text-white text-xs font-medium transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{t(language, 'messageUser')}</span>
                  </button>
                  {selectedPub?.username && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddFriend(selectedPub.username);
                        setSelectedUid(null);
                      }}
                      className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-medium transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{t(language, 'addFriend')}</span>
                    </button>
                  )}
                </div>

                {(() => {
                  const isBlocked = blockedUserIds.has(selectedUid);
                  const targetProfile: PublicUser = selectedPub || ({
                    uid: selectedUid,
                    username: selectedUid.slice(0, 8),
                    usernameLower: selectedUid.slice(0, 8).toLowerCase(),
                    displayName: selectedUid.slice(0, 8),
                    status: 'offline',
                    isDiscoverable: true,
                  } as PublicUser);
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        if (isBlocked) {
                          await unblockUser(myUid, selectedUid);
                          pushToast({ type: 'info', title: t(language, 'userUnblockedToast') });
                        } else {
                          await blockUser(myUid, targetProfile);
                          pushToast({ type: 'info', title: t(language, 'userBlockedToast') });
                        }
                        setSelectedUid(null);
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

                {isOwner && (
                  <div className="space-y-1.5 pt-1">
                    {confirmTransferUid === selectedUid ? (
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                          {t(language, 'transferOwnershipConfirm')}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onTransferOwnership(
                                selectedUid,
                                selectedPub?.displayName || selectedUid.slice(0, 8)
                              );
                              setConfirmTransferUid(null);
                              setSelectedUid(null);
                            }}
                            className="flex-1 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold"
                          >
                            {t(language, 'accept')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmTransferUid(null)}
                            className="px-2 py-1 rounded border border-slate-200 dark:border-white/10 text-[11px]"
                          >
                            {t(language, 'cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmTransferUid(selectedUid)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 text-xs font-medium transition-colors"
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span>{t(language, 'transferOwnership')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onKickMember(
                              selectedUid,
                              selectedPub?.displayName || selectedUid.slice(0, 8)
                            );
                            setSelectedUid(null);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25 text-xs font-medium transition-colors"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          <span>{t(language, 'kick')}</span>
                        </button>
                      </div>
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
