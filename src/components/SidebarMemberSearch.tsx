import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Crown,
  Loader2,
  MessageSquare,
  Search,
  Shield,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/translations';
import {
  findUserByUsername,
  searchDiscoverableUsers,
} from '../services/majlisService';
import type { PublicUser, Role, ServerMember } from '../types/majlis';
import { getEffectiveUserStatus, getRoleColorClass } from '../utils/validation';
import { UserAvatar } from './MajlisLogo';

interface SidebarMemberSearchProps {
  myUid: string;
  members?: ServerMember[];
  usersById: Record<string, PublicUser>;
  onStartDm: (targetUid: string) => void;
  onAddFriend?: (username: string) => void;
  onAfterSelect?: () => void;
  compact?: boolean;
  trailingAction?: ReactNode;
}

export function SidebarMemberSearch({
  myUid,
  members = [],
  usersById,
  onStartDm,
  onAddFriend,
  onAfterSelect,
  compact = false,
  trailingAction,
}: SidebarMemberSearchProps) {
  const { language, presenceNowMs, effectiveSelfStatus } = useAuth();
  const [queryText, setQueryText] = useState('');
  const [remoteUsers, setRemoteUsers] = useState<PublicUser[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  const normalizedTerm = useMemo(() => {
    const trimmed = queryText.trim().toLowerCase();
    return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  }, [queryText]);

  useEffect(() => {
    if (!normalizedTerm) {
      setRemoteUsers([]);
      setSearchingRemote(false);
      return;
    }

    let active = true;
    setSearchingRemote(true);

    const timer = window.setTimeout(async () => {
      try {
        const discoverable = await searchDiscoverableUsers(normalizedTerm);
        const resultsMap = new Map<string, PublicUser>();
        for (const u of discoverable) {
          resultsMap.set(u.uid, u);
        }

        // Exact username lookup fallback in case user is non-discoverable or outside limit(40)
        if (
          normalizedTerm.length >= 2 &&
          !discoverable.some((u) => u.usernameLower === normalizedTerm)
        ) {
          const exact = await findUserByUsername(normalizedTerm);
          if (exact) {
            resultsMap.set(exact.uid, exact);
          }
        }

        if (active) {
          setRemoteUsers(Array.from(resultsMap.values()));
        }
      } catch {
        if (active) setRemoteUsers([]);
      } finally {
        if (active) setSearchingRemote(false);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [normalizedTerm]);

  const matchingServerMembers = useMemo(() => {
    if (!normalizedTerm || members.length === 0) return [];
    const roleOrder: Record<Role, number> = {
      owner: 0,
      admin: 1,
      moderator: 2,
      member: 3,
    };

    return members
      .filter((m) => {
        const pub = usersById[m.uid];
        const displayName = (pub?.displayName || m.displayName).toLowerCase();
        const username = (pub?.username || m.username).toLowerCase();
        return (
          displayName.includes(normalizedTerm) ||
          username.includes(normalizedTerm)
        );
      })
      .sort(
        (a, b) =>
          roleOrder[a.role] - roleOrder[b.role] ||
          a.displayName.localeCompare(b.displayName)
      );
  }, [members, usersById, normalizedTerm]);

  const matchingOtherUsers = useMemo(() => {
    if (!normalizedTerm) return [];
    const serverMemberIds = new Set(members.map((m) => m.uid));
    const merged = new Map<string, PublicUser>();

    for (const u of Object.values(usersById)) {
      if (u.uid === myUid || serverMemberIds.has(u.uid)) continue;
      if (
        u.displayName.toLowerCase().includes(normalizedTerm) ||
        u.usernameLower.includes(normalizedTerm)
      ) {
        merged.set(u.uid, u);
      }
    }

    for (const u of remoteUsers) {
      if (u.uid === myUid || serverMemberIds.has(u.uid)) continue;
      if (
        u.displayName.toLowerCase().includes(normalizedTerm) ||
        u.usernameLower.includes(normalizedTerm)
      ) {
        merged.set(u.uid, u);
      }
    }

    return Array.from(merged.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }, [normalizedTerm, members, usersById, remoteUsers, myUid]);

  const hasQuery = normalizedTerm.length > 0;
  const totalResults = matchingServerMembers.length + matchingOtherUsers.length;

  const handleSelectUser = (uid: string) => {
    if (uid === myUid) return;
    onStartDm(uid);
    setQueryText('');
    onAfterSelect?.();
  };

  return (
    <div className="relative shrink-0">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-text-muted dark:text-text-muted absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && queryText) {
                e.stopPropagation();
                setQueryText('');
              }
            }}
            placeholder={t(language, 'searchMembersPlaceholder')}
            aria-label={t(language, 'searchMembers')}
            className={`w-full ps-8 ${
              queryText ? 'pe-7' : 'pe-2.5'
            } ${
              compact ? 'py-1.5 text-link' : 'py-1.5 text-link'
            } rounded-md border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text placeholder:text-text-muted dark:placeholder:text-text-muted focus:outline-accent focus:ring-2 focus:ring-accent transition-colors`}
          />
          {queryText && (
            <button
              type="button"
              onClick={() => setQueryText('')}
              aria-label={t(language, 'clearSearch')}
              className="absolute end-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text dark:hover:text-text transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {trailingAction}
      </div>

      {hasQuery && (
        <div className="mt-1.5 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated shadow-xl max-h-72 overflow-y-auto p-1.5 space-y-2 z-30">
          {searchingRemote && totalResults === 0 ? (
            <div className="flex items-center justify-center gap-2 py-4 text-link text-text-muted dark:text-text-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t(language, 'searchMembers')}...</span>
            </div>
          ) : totalResults === 0 ? (
            <div className="py-4 px-2 text-link space-y-1.5">
              <p className="text-link text-text-muted dark:text-text-muted">
                {t(language, 'noMatchingMembers')}
              </p>
              <button
                type="button"
                onClick={() => setQueryText('')}
                className="text-[11px] font-medium text-link hover:underline"
              >
                {t(language, 'clearSearch')}
              </button>
            </div>
          ) : (
            <>
              {matchingServerMembers.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted tabular-nums">
                    {t(language, 'serverMembers')} · {matchingServerMembers.length}
                  </div>
                  {matchingServerMembers.map((m) => {
                    const pub = usersById[m.uid];
                    const displayName = pub?.displayName || m.displayName;
                    const username = pub?.username || m.username;
                    const avatarUrl = pub?.avatarUrl ?? m.avatarUrl;
                    const isSelf = m.uid === myUid;
                    const status = isSelf
                      ? effectiveSelfStatus
                      : getEffectiveUserStatus(
                          pub?.status,
                          pub?.lastSeen?.toMillis?.(),
                          presenceNowMs
                        );

                    return (
                      <div
                        key={m.uid}
                        className="group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md hover:bg-main dark:hover:bg-main transition-colors"
                      >
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => handleSelectUser(m.uid)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-link disabled:cursor-default"
                        >
                          <UserAvatar
                            src={avatarUrl}
                            name={displayName}
                            status={status}
                            size="xs"
                            showStatus
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-link font-medium truncate ${getRoleColorClass(
                                  m.role
                                )}`}
                              >
                                {displayName}
                              </span>
                              {m.role === 'owner' && (
                                <Crown className="w-3 h-3 text-warning shrink-0" />
                              )}
                              {(m.role === 'admin' || m.role === 'moderator') && (
                                <Shield className="w-3 h-3 text-success shrink-0" />
                              )}
                            </div>
                            <div className="text-[11px] text-text-muted dark:text-text-muted truncate">
                              @{username}
                            </div>
                          </div>
                        </button>

                        {!isSelf && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSelectUser(m.uid)}
                              title={t(language, 'messageUser')}
                              className="p-1 rounded text-text-muted dark:text-text-muted hover:text-link hover:bg-hover/70 dark:hover:bg-hover/70 transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            {onAddFriend && (
                              <button
                                type="button"
                                onClick={() => {
                                  onAddFriend(username);
                                  setQueryText('');
                                  onAfterSelect?.();
                                }}
                                title={t(language, 'addFriend')}
                                className="p-1 rounded text-text-muted dark:text-text-muted hover:text-success dark:hover:text-success hover:bg-hover/70 dark:hover:bg-hover/70 transition-colors"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {matchingOtherUsers.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted tabular-nums">
                    {t(language, 'workspaceUsers')} · {matchingOtherUsers.length}
                  </div>
                  {matchingOtherUsers.slice(0, 12).map((u) => {
                    const status = getEffectiveUserStatus(
                      u.status,
                      u.lastSeen?.toMillis?.(),
                      presenceNowMs
                    );

                    return (
                      <div
                        key={u.uid}
                        className="group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md hover:bg-main dark:hover:bg-main transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectUser(u.uid)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-link"
                        >
                          <UserAvatar
                            src={u.avatarUrl}
                            name={u.displayName}
                            status={status}
                            size="xs"
                            showStatus
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-link font-medium text-text dark:text-text truncate">
                              {u.displayName}
                            </div>
                            <div className="text-[11px] text-text-muted dark:text-text-muted truncate">
                              @{u.username}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectUser(u.uid)}
                            title={t(language, 'messageUser')}
                            className="p-1 rounded text-text-muted dark:text-text-muted hover:text-link hover:bg-hover/70 dark:hover:bg-hover/70 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          {onAddFriend && (
                            <button
                              type="button"
                              onClick={() => {
                                onAddFriend(u.username);
                                setQueryText('');
                                onAfterSelect?.();
                              }}
                              title={t(language, 'addFriend')}
                              className="p-1 rounded text-text-muted dark:text-text-muted hover:text-success dark:hover:text-success hover:bg-hover/70 dark:hover:bg-hover/70 transition-colors"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
