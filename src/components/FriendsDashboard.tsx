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
} from '../services/majlisService';
import type { Friendship, PublicUser } from '../types/majlis';
import {
  getActiveCustomStatus,
  getEffectiveUserStatus,
  isUserEffectivelyOnline,
} from '../utils/validation';
import { CollapseChevron, CollapsibleBody } from './CollapsibleSection';
import { UserAvatar } from './MajlisLogo';
import { MajlisTooltip } from './ui/MajlisUI';

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
    'majlis_collapsed_friends_groups'
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
        className={`w-full px-4 py-3 flex items-center justify-start gap-3 border-b border-border/70 last:border-b-0 ${
          f.status === 'accepted' && !effectiveOnline ? 'opacity-75' : ''
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 max-w-[70%]">
          <UserAvatar
            src={otherUser?.avatarUrl}
            name={otherUser?.displayName || 'User'}
            status={friendStatus}
            size="md"
            showStatus
          />
          <div className="min-w-0">
            <div className="text-link font-semibold text-text dark:text-text truncate">
              {otherUser?.displayName || 'User'}
            </div>
            <div className="text-link text-text-muted dark:text-text-muted truncate">
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
                <div className="text-[11px] text-text-muted dark:text-text-muted truncate">
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
              <MajlisTooltip content={t(language, 'messageUser')} side="top">
                <button
                  type="button"
                  onClick={() => onStartDm(otherUid)}
                  aria-label={t(language, 'messageUser')}
                  className="p-2 rounded-lg bg-main dark:bg-main hover:bg-accent-hover hover:text-text text-text dark:text-text transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </MajlisTooltip>
              <MajlisTooltip content={t(language, 'removeFriend')} side="top">
                <button
                  type="button"
                  onClick={() => handleRemove(f.id)}
                  aria-label={t(language, 'removeFriend')}
                  className="p-2 rounded-lg bg-main dark:bg-main hover:bg-danger hover:text-text text-text dark:text-text transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </MajlisTooltip>
            </>
          ) : isIncoming ? (
            <>
              <MajlisTooltip content={t(language, 'accept')} side="top">
                <button
                  type="button"
                  onClick={() => handleRespond(f.id, true)}
                  aria-label={t(language, 'accept')}
                  className="p-2 rounded-lg bg-success/15 text-success dark:text-success hover:bg-success hover:text-text transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </MajlisTooltip>
              <MajlisTooltip content={t(language, 'decline')} side="top">
                <button
                  type="button"
                  onClick={() => handleRespond(f.id, false)}
                  aria-label={t(language, 'decline')}
                  className="p-2 rounded-lg bg-danger/15 text-danger dark:text-danger hover:bg-danger hover:text-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </MajlisTooltip>
            </>
          ) : (
            <MajlisTooltip content={t(language, 'cancel')} side="top">
              <button
                type="button"
                onClick={() => handleRemove(f.id)}
                aria-label={t(language, 'cancel')}
                className="p-2 rounded-lg bg-main dark:bg-main hover:bg-danger hover:text-text text-text dark:text-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </MajlisTooltip>
          )}
        </div>

      </div>
    );
  };

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-elevated dark:bg-elevated">
      {/* Top Bar */}
      <header className="h-12 px-4 border-accent border-border dark:border-border flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="md:hidden p-1.5 rounded-md text-text dark:text-text hover:bg-main dark:hover:bg-main shrink-0"
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
            className="hidden md:inline-flex p-1.5 rounded-md border border-border dark:border-border bg-main/80 dark:bg-main/80 text-text dark:text-text hover:bg-hover dark:hover:bg-hover hover:text-text dark:hover:text-text transition-colors shrink-0"
          >
            <PanelLeftOpen className="w-4 h-4 rtl:rotate-180" />
          </button>
        )}
        <div className="flex items-center gap-2 font-semibold text-link text-text dark:text-text shrink-0">
          <Users className="w-4 h-4 text-text-muted dark:text-text-muted" />
          <span>{t(language, 'friends')}</span>
        </div>

        <div className="h-4 w-px bg-hover dark:bg-hover shrink-0" />

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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-link font-medium whitespace-nowrap transition-colors ${
                  tab === key
                    ? 'bg-hover dark:bg-hover text-text dark:text-text'
                    : 'text-text dark:text-text hover:bg-main dark:hover:bg-main'
                }`}
              >
                <span>{label}</span>
                {key === 'pending' && pending.length > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-danger text-text text-[10px] font-bold inline-flex items-center justify-center tabular-nums">
                    {pending.length}
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setTab('add')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-link font-semibold whitespace-nowrap transition-colors ${
              tab === 'add'
                ? 'bg-accent text-text'
                : 'bg-accent hover:bg-majlis-hover text-text'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t(language, 'addFriend')}</span>
          </button>

          {onOpenCreateGroup && (
            <MajlisTooltip content={t(language, 'createGroup')} side="bottom">
              <button
                type="button"
                onClick={onOpenCreateGroup}
                aria-label={t(language, 'createGroup')}
                className="w-8 h-8 rounded-lg border border-border dark:border-border text-text-muted dark:text-text-muted hover:bg-accent/10 hover:text-link flex items-center justify-center transition-colors"
              >
                <Users className="w-4 h-4" />
              </button>
            </MajlisTooltip>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 overflow-y-auto p-5">
        {tab === 'add' ? (
          <form onSubmit={handleSendRequest} className="space-y-4">
            <div>
              <h3 className="text-link font-bold text-text dark:text-text">
                {t(language, 'addFriend')}
              </h3>
              <p className="text-link text-text-muted dark:text-text-muted mt-1">
                {t(language, 'addFriendPlaceholder')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder={t(language, 'addFriendPlaceholder')}
                className="flex-1 px-3.5 py-2.5 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={submitting || !usernameInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                <span>{t(language, 'sendFriendRequest')}</span>
              </button>
            </div>
          </form>
        ) : listToRender.length === 0 ? (
          <div className="py-16 px-4 space-y-3 max-w-md mx-auto text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
              {tab === 'pending' ? (
                <Clock className="w-7 h-7" />
              ) : tab === 'all' || accepted.length === 0 ? (
                <UserPlus className="w-7 h-7" />
              ) : (
                <Users className="w-7 h-7" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-text">
                {tab === 'online'
                  ? accepted.length === 0
                    ? t(language, 'noFriendsAllTitle')
                    : t(language, 'noFriendsOnlineTitle')
                  : tab === 'all'
                  ? t(language, 'noFriendsAllTitle')
                  : t(language, 'noPendingRequestsTitle')}
              </h3>
              <p className="text-text-muted">
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
                <button
                  type="button"
                  onClick={() => setTab('all')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast font-semibold transition-colors"
                >
                  <Users className="w-4 h-4" />
                  <span>{t(language, 'viewAllFriends')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTab('add')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast font-semibold transition-colors"
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
          <div className="mx-auto w-full max-w-3xl max-h-[70vh] overflow-y-auto rounded-xl border border-border dark:border-border bg-main/50 dark:bg-main/50 p-3 space-y-4">
            {onlineAccepted.length > 0 && (
              <div>
                <MajlisTooltip
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
                    className="w-full pb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted hover:text-text dark:hover:text-text rounded focus-visible:outline-accent focus-visible:ring-2 focus-visible:ring-accent transition-colors tabular-nums"
                  >
                    <CollapseChevron collapsed={isCollapsed('online')} />
                    <span>
                      {t(language, 'online')} — {onlineAccepted.length}
                    </span>
                  </button>
                </MajlisTooltip>
                <CollapsibleBody isOpen={!isCollapsed('online')}>
                  <div className="divide-accent border-border dark:border-border">
                    {onlineAccepted.map(renderFriendshipRow)}
                  </div>
                </CollapsibleBody>
              </div>
            )}
            {offlineAccepted.length > 0 && (
              <div>
                <MajlisTooltip
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
                    className="w-full pb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted hover:text-text dark:hover:text-text rounded focus-visible:outline-accent focus-visible:ring-2 focus-visible:ring-accent transition-colors tabular-nums"
                  >
                    <CollapseChevron collapsed={isCollapsed('offline')} />
                    <span>
                      {t(language, 'offline')} — {offlineAccepted.length}
                    </span>
                  </button>
                </MajlisTooltip>
                <CollapsibleBody isOpen={!isCollapsed('offline')}>
                  <div className="divide-accent border-border dark:border-border">
                    {offlineAccepted.map(renderFriendshipRow)}
                  </div>
                </CollapsibleBody>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl max-h-[70vh] overflow-y-auto rounded-xl border border-border dark:border-border bg-main/50 dark:bg-main/50">
            {listToRender.map(renderFriendshipRow)}
          </div>
        )}
      </div>

      {onlineAccepted.length > 0 && (
        <aside className="hidden lg:flex w-64 shrink-0 h-full flex-col border-accent border-border dark:border-border bg-elevated/70 dark:bg-elevated/70 px-3 py-4">
          <h3 className="text-link font-bold uppercase tracking-wider text-text-muted dark:text-text-muted px-1 mb-3">
            {language === 'ar' ? 'نشط الآن' : 'Active Now'}
          </h3>
          <div className="space-y-1">
            {onlineAccepted.map((friendship) => {
              const uid = friendship.participants.find((id) => id !== myUid) || '';
              const friend = usersById[uid];
              const status = getEffectiveUserStatus(
                friend?.status,
                friend?.lastSeen?.toMillis?.(),
                presenceNowMs
              );
              const statusLabel =
                status === 'online'
                  ? t(language, 'online')
                  : status === 'idle'
                  ? t(language, 'idle')
                  : status === 'dnd'
                  ? t(language, 'dnd')
                  : t(language, 'offline');
              return (
                <button
                  key={friendship.id}
                  type="button"
                  onClick={() => onStartDm(uid)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-link hover:bg-hover/70 dark:hover:bg-hover/70 transition-colors"
                >
                  <UserAvatar
                    src={friend?.avatarUrl}
                    name={friend?.displayName || 'User'}
                    status={status}
                    size="sm"
                    showStatus
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-link font-semibold text-text dark:text-text truncate">
                      {friend?.displayName || 'User'}
                    </div>
                    <div className="text-[10px] text-text-muted dark:text-text-muted truncate">
                      {statusLabel}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      )}
      </div>
    </div>
  );
}
