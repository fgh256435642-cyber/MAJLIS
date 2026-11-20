import React, { useState } from 'react';
import { Check, Clock, Menu, MessageSquare, PanelLeftOpen, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePersistentCollapseMap } from '../hooks/useCollapsibleState';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n/translations';
import {
  removeFriendship,
  respondFriendRequest,
  sendFriendRequest,
} from '../services/nexusService';
import type { Friendship, PublicUser } from '../types/nexus';
import {
  getActiveCustomStatus,
  getEffectiveUserStatus,
  isUserEffectivelyOnline,
} from '../utils/validation';
import { CollapseChevron, CollapsibleBody } from './CollapsibleSection';
import { UserAvatar } from './NexusLogo';
import { NexusTooltip } from './ui/NexusUI';

interface FriendsDashboardProps {
  myUid: string;
  friendships: Friendship[];
  usersById: Record<string, PublicUser>;
  onOpenMobileSidebar: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  onStartDm: (targetUid: string) => void;
  onOpenCreateGroup?: () => void;
}

export function FriendsDashboard({
  myUid,
  friendships,
  usersById,
  onOpenMobileSidebar,
  sidebarCollapsed = false,
  onExpandSidebar,
  onStartDm,
  onOpenCreateGroup,
}: FriendsDashboardProps) {
  const { language, presenceNowMs } = useAuth();
  const { pushToast } = useToast();
  const [tab, setTab] = useState<'online' | 'all' | 'pending' | 'add'>('online');
  const [usernameInput, setUsernameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { isCollapsed, toggleSection } = usePersistentCollapseMap(
    'nexus_collapsed_friends_groups'
  );

  const accepted = friendships.filter((f) => f.status === 'accepted');
  const pending = friendships.filter((f) => f.status === 'pending');

  const isFriendOnline = (f: Friendship) => {
    const otherUid = f.participants.find((id) => id !== myUid) || '';
    const user = usersById[otherUid];
    return isUserEffectivelyOnline(
      user?.status,
      user?.lastSeen?.toMillis?.(),
      presenceNowMs
    );
  };

  const onlineAccepted = accepted.filter(isFriendOnline);
  const offlineAccepted = accepted.filter((f) => !isFriendOnline(f));
  const listToRender =
    tab === 'online' ? onlineAccepted : tab === 'all' ? accepted : pending;

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setSubmitting(true);
    try {
      await sendFriendRequest(myUid, usernameInput.trim());
      pushToast({
        type: 'success',
        title: t(language, 'friendRequestSent'),
        description: `@${usernameInput.trim().replace(/^@/, '')}`,
      });
      setUsernameInput('');
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (fId: string, accept: boolean) => {
    try {
      await respondFriendRequest(fId, accept);
      pushToast({
        type: accept ? 'success' : 'info',
        title: accept
          ? t(language, 'friendRequestAccepted')
          : t(language, 'friendRequestDeclined'),
      });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleRemove = async (fId: string) => {
    try {
      await removeFriendship(fId);
      pushToast({ type: 'info', title: t(language, 'removed') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const renderFriendshipRow = (f: Friendship) => {
    const otherUid = f.participants.find((id) => id !== myUid) || '';
    const otherUser = usersById[otherUid];
    const isIncoming = f.status === 'pending' && f.recipientId === myUid;
    const friendStatus = getEffectiveUserStatus(
      otherUser?.status,
      otherUser?.lastSeen?.toMillis?.(),
      presenceNowMs
    );
    const effectiveOnline = friendStatus !== 'offline';
    const friendStatusLabel =
      friendStatus === 'online'
        ? t(language, 'online')
        : friendStatus === 'idle'
        ? t(language, 'idle')
        : friendStatus === 'dnd'
        ? t(language, 'dnd')
        : t(language, 'offline');

    return (
      <div
        key={f.id}
        className={`py-3 flex items-center justify-between gap-3 ${
          f.status === 'accepted' && !effectiveOnline ? 'opacity-75' : ''
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar
            src={otherUser?.avatarUrl}
            name={otherUser?.displayName || 'User'}
            status={friendStatus}
            size="md"
            showStatus
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {otherUser?.displayName || 'User'}
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
              @{otherUser?.username || otherUid.slice(0, 8)}
              {f.status === 'accepted' && ` · ${friendStatusLabel}`}
              {f.status === 'pending' &&
                ` · ${
                  isIncoming
                    ? t(language, 'incomingRequest')
                    : t(language, 'outgoingRequest')
                }`}
            </div>
            {(() => {
              const cs = getActiveCustomStatus(otherUser, presenceNowMs);
              if (!cs || f.status !== 'accepted') return null;
              return (
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  {cs.emoji ? `${cs.emoji} ` : ''}
                  {cs.text}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {f.status === 'accepted' ? (
            <>
              <NexusTooltip content={t(language, 'messageUser')} side="top">
                <button
                  type="button"
                  onClick={() => onStartDm(otherUid)}
                  aria-label={t(language, 'messageUser')}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-[#2B2D31] hover:bg-nexus hover:text-white text-slate-700 dark:text-zinc-200 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </NexusTooltip>
              <NexusTooltip content={t(language, 'removeFriend')} side="top">
                <button
                  type="button"
                  onClick={() => handleRemove(f.id)}
                  aria-label={t(language, 'removeFriend')}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-[#2B2D31] hover:bg-rose-600 hover:text-white text-slate-700 dark:text-zinc-200 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </NexusTooltip>
            </>
          ) : isIncoming ? (
            <>
              <NexusTooltip content={t(language, 'accept')} side="top">
                <button
                  type="button"
                  onClick={() => handleRespond(f.id, true)}
                  aria-label={t(language, 'accept')}
                  className="p-2 rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </NexusTooltip>
              <NexusTooltip content={t(language, 'decline')} side="top">
                <button
                  type="button"
                  onClick={() => handleRespond(f.id, false)}
                  aria-label={t(language, 'decline')}
                  className="p-2 rounded-lg bg-rose-600/15 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </NexusTooltip>
            </>
          ) : (
            <NexusTooltip content={t(language, 'cancel')} side="top">
              <button
                type="button"
                onClick={() => handleRemove(f.id)}
                aria-label={t(language, 'cancel')}
                className="p-2 rounded-lg bg-slate-100 dark:bg-[#2B2D31] hover:bg-rose-600 hover:text-white text-slate-700 dark:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </NexusTooltip>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-white dark:bg-[#313338]">
      {/* Top Bar */}
      <header className="h-12 px-4 border-b border-slate-200 dark:border-black/25 flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="md:hidden p-1.5 rounded-md text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 shrink-0"
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
        <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white shrink-0">
          <Users className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
          <span>{t(language, 'friends')}</span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-white/10 shrink-0" />

        <div className="flex items-center gap-1.5 shrink-0">
          {(['online', 'all', 'pending'] as const).map((key) => {
            const label =
              key === 'online'
                ? t(language, 'online')
                : key === 'all'
                ? t(language, 'allFriends')
                : t(language, 'pending');

            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === key
                    ? 'bg-slate-200 dark:bg-[#404249] text-slate-950 dark:text-white'
                    : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#35373C]'
                }`}
              >
                <span>{label}</span>
                {key === 'pending' && pending.length > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold inline-flex items-center justify-center tabular-nums">
                    {pending.length}
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setTab('add')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === 'add'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white'
            }`}
          >
            {t(language, 'addFriend')}
          </button>

          {onOpenCreateGroup && (
            <button
              type="button"
              onClick={onOpenCreateGroup}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap bg-nexus/15 text-nexus hover:bg-nexus hover:text-white transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{t(language, 'createGroup')}</span>
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 max-w-3xl w-full">
        {tab === 'add' ? (
          <form onSubmit={handleSendRequest} className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t(language, 'addFriend')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                {t(language, 'addFriendPlaceholder')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder={t(language, 'addFriendPlaceholder')}
                className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
              />
              <button
                type="submit"
                disabled={submitting || !usernameInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                <span>{t(language, 'sendFriendRequest')}</span>
              </button>
            </div>
          </form>
        ) : listToRender.length === 0 ? (
          <div className="py-16 px-4 text-center space-y-3 max-w-md mx-auto">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-nexus/10 text-nexus flex items-center justify-center">
              {tab === 'pending' ? (
                <Clock className="w-7 h-7" />
              ) : tab === 'all' || accepted.length === 0 ? (
                <UserPlus className="w-7 h-7" />
              ) : (
                <Users className="w-7 h-7" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {tab === 'online'
                  ? accepted.length === 0
                    ? t(language, 'noFriendsAllTitle')
                    : t(language, 'noFriendsOnlineTitle')
                  : tab === 'all'
                  ? t(language, 'noFriendsAllTitle')
                  : t(language, 'noPendingRequestsTitle')}
              </h3>
              <p className="text-sm text-slate-600 dark:text-zinc-400">
                {tab === 'online'
                  ? accepted.length === 0
                    ? t(language, 'noFriendsAll')
                    : t(language, 'noFriendsOnline')
                  : tab === 'all'
                  ? t(language, 'noFriendsAll')
                  : t(language, 'noPendingRequestsDesc')}
              </p>
            </div>
            <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
              {tab === 'online' && accepted.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setTab('all')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover text-white text-xs font-semibold transition-colors"
                  >
                    <Users className="w-4 h-4" />
                    <span>{t(language, 'viewAllFriends')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('add')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{t(language, 'addFriend')}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setTab('add')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover text-white text-xs font-semibold transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>
                    {accepted.length === 0
                      ? t(language, 'addFirstFriend')
                      : t(language, 'addFriend')}
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : tab === 'all' ? (
          <div className="space-y-6">
            {onlineAccepted.length > 0 && (
              <div>
                <NexusTooltip
                  content={
                    isCollapsed('online')
                      ? t(language, 'expandSection')
                      : t(language, 'collapseSection')
                  }
                  side="top"
                  align="start"
                >
                  <button
                    type="button"
                    aria-expanded={!isCollapsed('online')}
                    onClick={() => toggleSection('online')}
                    className="w-full pb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus transition-colors tabular-nums"
                  >
                    <CollapseChevron collapsed={isCollapsed('online')} />
                    <span>
                      {t(language, 'online')} — {onlineAccepted.length}
                    </span>
                  </button>
                </NexusTooltip>
                <CollapsibleBody isOpen={!isCollapsed('online')}>
                  <div className="divide-y divide-slate-200 dark:divide-white/10">
                    {onlineAccepted.map(renderFriendshipRow)}
                  </div>
                </CollapsibleBody>
              </div>
            )}
            {offlineAccepted.length > 0 && (
              <div>
                <NexusTooltip
                  content={
                    isCollapsed('offline')
                      ? t(language, 'expandSection')
                      : t(language, 'collapseSection')
                  }
                  side="top"
                  align="start"
                >
                  <button
                    type="button"
                    aria-expanded={!isCollapsed('offline')}
                    onClick={() => toggleSection('offline')}
                    className="w-full pb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus transition-colors tabular-nums"
                  >
                    <CollapseChevron collapsed={isCollapsed('offline')} />
                    <span>
                      {t(language, 'offline')} — {offlineAccepted.length}
                    </span>
                  </button>
                </NexusTooltip>
                <CollapsibleBody isOpen={!isCollapsed('offline')}>
                  <div className="divide-y divide-slate-200 dark:divide-white/10">
                    {offlineAccepted.map(renderFriendshipRow)}
                  </div>
                </CollapsibleBody>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {listToRender.map(renderFriendshipRow)}
          </div>
        )}
      </div>
    </div>
  );
}
