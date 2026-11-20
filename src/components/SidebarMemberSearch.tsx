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
} from '../services/nexusService';
import type { PublicUser, Role, ServerMember } from '../types/nexus';
import { getEffectiveUserStatus, getRoleColorClass } from '../utils/validation';
import { UserAvatar } from './NexusLogo';

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
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
              compact ? 'py-1.5 text-xs' : 'py-1.5 text-xs'
            } rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1F22] text-slate-900 dark:text-[#F2F3F5] placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-nexus transition-colors`}
          />
          {queryText && (
            <button
              type="button"
              onClick={() => setQueryText('')}
              aria-label={t(language, 'clearSearch')}
              className="absolute end-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {trailingAction}
      </div>

      {hasQuery && (
        <div className="mt-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1F22] shadow-xl max-h-72 overflow-y-auto p-1.5 space-y-2 z-30">
          {searchingRemote && totalResults === 0 ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500 dark:text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t(language, 'searchMembers')}...</span>
            </div>
          ) : totalResults === 0 ? (
            <div className="py-4 px-2 text-center space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {t(language, 'noMatchingMembers')}
              </p>
              <button
                type="button"
                onClick={() => setQueryText('')}
                className="text-[11px] font-medium text-nexus hover:underline"
              >
                {t(language, 'clearSearch')}
              </button>
            </div>
          ) : (
            <>
              {matchingServerMembers.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 tabular-nums">
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
                        className="group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#2B2D31] transition-colors"
                      >
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => handleSelectUser(m.uid)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-start disabled:cursor-default"
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
                                className={`text-xs font-medium truncate ${getRoleColorClass(
                                  m.role
                                )}`}
                              >
                                {displayName}
                              </span>
                              {m.role === 'owner' && (
                                <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                              )}
                              {(m.role === 'admin' || m.role === 'moderator') && (
                                <Shield className="w-3 h-3 text-emerald-500 shrink-0" />
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
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
                              className="p-1 rounded text-slate-500 dark:text-zinc-400 hover:text-nexus hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
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
                                className="p-1 rounded text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
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
                  <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 tabular-nums">
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
                        className="group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#2B2D31] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectUser(u.uid)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-start"
                        >
                          <UserAvatar
                            src={u.avatarUrl}
                            name={u.displayName}
                            status={status}
                            size="xs"
                            showStatus
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-900 dark:text-[#F2F3F5] truncate">
                              {u.displayName}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                              @{u.username}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectUser(u.uid)}
                            title={t(language, 'messageUser')}
                            className="p-1 rounded text-slate-500 dark:text-zinc-400 hover:text-nexus hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
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
                              className="p-1 rounded text-slate-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
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
