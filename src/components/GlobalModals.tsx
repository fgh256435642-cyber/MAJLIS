import { useEffect, useState } from 'react';
import {
  Compass,
  Hash,
  MessageSquare,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n/translations';
import {
  joinPublicServer,
  searchDiscoverableUsers,
  searchPublicServers,
} from '../services/nexusService';
import type { Channel, GroupDm, JoinedServerRef, PublicUser, Server } from '../types/nexus';
import { getGroupDisplayName } from '../utils/validation';
import { GroupAvatar, ServerIcon, UserAvatar } from './NexusLogo';

export function DiscoverServersModal({
  publicUser,
  joinedServerIds,
  onClose,
  onJoined,
}: {
  publicUser: PublicUser;
  joinedServerIds: Set<string>;
  onClose: () => void;
  onJoined: (serverId: string) => void;
}) {
  const { language } = useAuth();
  const { pushToast } = useToast();
  const [queryText, setQueryText] = useState('');
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    searchPublicServers(queryText)
      .then((res) => {
        if (active) setServers(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [queryText]);

  const handleJoin = async (srv: Server) => {
    if (joinedServerIds.has(srv.id)) {
      onJoined(srv.id);
      return;
    }
    setJoiningId(srv.id);
    try {
      await joinPublicServer(publicUser.uid, publicUser, srv);
      pushToast({ type: 'success', title: `Joined ${srv.name}` });
      onJoined(srv.id);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Could not join server',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#313338] text-slate-900 dark:text-[#F2F3F5] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-base">
            <Compass className="w-5 h-5 text-emerald-500" />
            <span>{t(language, 'discoverServers')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-white/10">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={t(language, 'searchPublicServersPlaceholder')}
              className="w-full ps-9 pe-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {loading ? (
            <div className="col-span-full py-12 text-center text-sm text-slate-500 dark:text-zinc-400">
              {t(language, 'loadingPublicServers')}
            </div>
          ) : servers.length === 0 ? (
            <div className="col-span-full py-12 text-center text-sm text-slate-500 dark:text-zinc-400">
              {t(language, 'noPublicServersFound')}
            </div>
          ) : (
            servers.map((srv) => {
              const isJoined = joinedServerIds.has(srv.id);
              return (
                <div
                  key={srv.id}
                  className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] p-4 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <ServerIcon src={srv.iconUrl} name={srv.name} size="md" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{srv.name}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1 tabular-nums">
                        <Users className="w-3 h-3" />
                        <span>
                          {srv.memberCount} {t(language, 'membersCount')}
                        </span>
                      </div>
                      {srv.description && (
                        <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1.5 line-clamp-2">
                          {srv.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={joiningId === srv.id}
                    onClick={() => handleJoin(srv)}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                      isJoined
                        ? 'bg-slate-200 dark:bg-[#404249] text-slate-800 dark:text-white'
                        : 'bg-nexus hover:bg-nexus-hover text-white'
                    }`}
                  >
                    {joiningId === srv.id
                      ? t(language, 'joining')
                      : isJoined
                      ? t(language, 'openServer')
                      : t(language, 'join')}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function QuickSwitcherModal({
  joinedServers,
  channels,
  groups = [],
  usersById = {},
  myUid,
  onClose,
  onSelectServer,
  onSelectChannel,
  onSelectGroup,
  onStartDm,
}: {
  joinedServers: JoinedServerRef[];
  channels: Channel[];
  groups?: GroupDm[];
  usersById?: Record<string, PublicUser>;
  myUid: string;
  onClose: () => void;
  onSelectServer: (serverId: string) => void;
  onSelectChannel: (channel: Channel) => void;
  onSelectGroup?: (groupId: string) => void;
  onStartDm: (uid: string) => void;
}) {
  const { language } = useAuth();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    searchDiscoverableUsers(search).then((res) => {
      if (active) setUsers(res.filter((u) => u.uid !== myUid));
    });
    return () => {
      active = false;
    };
  }, [search, myUid]);

  const term = search.trim().toLowerCase();
  const filteredServers = joinedServers.filter((s) =>
    s.serverName.toLowerCase().includes(term)
  );
  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(term)
  );
  const filteredGroups = groups.filter((g) =>
    getGroupDisplayName(g, usersById, myUid, language).toLowerCase().includes(term)
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-start justify-center pt-20 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#2B2D31] text-slate-900 dark:text-[#F2F3F5] shadow-2xl overflow-hidden"
      >
        <div className="p-3 border-b border-slate-200 dark:border-white/10 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 ms-1" />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(language, 'quickSwitcherPlaceholder')}
            className="flex-1 bg-transparent text-sm focus:outline-none py-1"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-3">
          {filteredServers.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-zinc-400">
                {t(language, 'serversLabel')}
              </div>
              {filteredServers.map((s) => (
                <button
                  key={s.serverId}
                  type="button"
                  onClick={() => {
                    onSelectServer(s.serverId);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#404249] text-start text-sm"
                >
                  <ServerIcon src={s.serverIconUrl} name={s.serverName} size="sm" />
                  <span className="truncate font-medium">{s.serverName}</span>
                </button>
              ))}
            </div>
          )}

          {filteredChannels.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-zinc-400">
                {t(language, 'channelsLabel')}
              </div>
              {filteredChannels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectChannel(c);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#404249] text-start text-sm"
                >
                  <Hash className="w-4 h-4 text-slate-400" />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          )}

          {filteredGroups.length > 0 && onSelectGroup && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-zinc-400">
                {t(language, 'groupChat')}
              </div>
              {filteredGroups.map((g) => {
                const gName = getGroupDisplayName(g, usersById, myUid, language);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      onSelectGroup(g.id);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#404249] text-start text-sm"
                  >
                    <GroupAvatar src={g.iconUrl} name={gName} size="xs" />
                    <span className="truncate font-medium">{gName}</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400 ms-auto tabular-nums">
                      {g.memberIds.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {users.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-zinc-400">
                {t(language, 'usersLabel')}
              </div>
              {users.slice(0, 8).map((u) => (
                <button
                  key={u.uid}
                  type="button"
                  onClick={() => {
                    onStartDm(u.uid);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#404249] text-start text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar src={u.avatarUrl} name={u.displayName} size="xs" />
                    <span className="truncate font-medium">{u.displayName}</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                      @{u.username}
                    </span>
                  </div>
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
