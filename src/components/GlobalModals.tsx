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
} from '../services/majlisService';
import type { Channel, GroupDm, JoinedServerRef, PublicUser, Server } from '../types/majlis';
import { getGroupDisplayName } from '../utils/validation';
import { GroupAvatar, ServerIcon, UserAvatar } from './MajlisLogo';

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
      className="fixed inset-0 z-50 bg-rail/70 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-5 py-4 border-accent border-border dark:border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-link">
            <Compass className="w-5 h-5 text-success" />
            <span>{t(language, 'discoverServers')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text dark:hover:text-text"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-accent border-border dark:border-border">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={t(language, 'searchPublicServersPlaceholder')}
              className="w-full ps-9 pe-4 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {loading ? (
            <div className="col-span-full py-12 text-link text-link text-text-muted dark:text-text-muted">
              {t(language, 'loadingPublicServers')}
            </div>
          ) : servers.length === 0 ? (
            <div className="col-span-full py-12 text-link text-link text-text-muted dark:text-text-muted">
              {t(language, 'noPublicServersFound')}
            </div>
          ) : (
            servers.map((srv) => {
              const isJoined = joinedServerIds.has(srv.id);
              return (
                <div
                  key={srv.id}
                  className="rounded-xl border border-border dark:border-border bg-elevated dark:bg-elevated p-4 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <ServerIcon src={srv.iconUrl} name={srv.name} size="md" />
                    <div className="min-w-0">
                      <div className="font-semibold text-link truncate">{srv.name}</div>
                      <div className="text-link text-text-muted dark:text-text-muted flex items-center gap-1 tabular-nums">
                        <Users className="w-3 h-3" />
                        <span>
                          {srv.memberCount} {t(language, 'membersCount')}
                        </span>
                      </div>
                      {srv.description && (
                        <p className="text-link text-text dark:text-text mt-1.5 line-clamp-2">
                          {srv.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={joiningId === srv.id}
                    onClick={() => handleJoin(srv)}
                    className={`w-full py-1.5 px-3 rounded-lg text-link font-semibold transition-colors ${
                      isJoined
                        ? 'bg-hover dark:bg-hover text-text dark:text-text'
                        : 'bg-accent hover:bg-majlis-hover text-text'
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
      className="fixed inset-0 z-50 bg-rail/70 backdrop-blur-[2px] flex items-start justify-center pt-20 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text shadow-2xl overflow-hidden"
      >
        <div className="p-3 border-accent border-border dark:border-border flex items-center gap-2">
          <Search className="w-4 h-4 text-text-muted ms-1" />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(language, 'quickSwitcherPlaceholder')}
            className="flex-1 bg-accent text-link focus:outline-accent py-1"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text dark:hover:text-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-3">
          {filteredServers.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase text-text-muted dark:text-text-muted">
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
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-main dark:hover:bg-main text-link text-link"
                >
                  <ServerIcon src={s.serverIconUrl} name={s.serverName} size="sm" />
                  <span className="truncate font-medium">{s.serverName}</span>
                </button>
              ))}
            </div>
          )}

          {filteredChannels.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase text-text-muted dark:text-text-muted">
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
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-main dark:hover:bg-main text-link text-link"
                >
                  <Hash className="w-4 h-4 text-text-muted" />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          )}

          {filteredGroups.length > 0 && onSelectGroup && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase text-text-muted dark:text-text-muted">
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
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-main dark:hover:bg-main text-link text-link"
                  >
                    <GroupAvatar src={g.iconUrl} name={gName} size="xs" />
                    <span className="truncate font-medium">{gName}</span>
                    <span className="text-link text-text-muted dark:text-text-muted ms-auto tabular-nums">
                      {g.memberIds.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {users.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[11px] font-semibold uppercase text-text-muted dark:text-text-muted">
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
                  className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg hover:bg-main dark:hover:bg-main text-link text-link"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar src={u.avatarUrl} name={u.displayName} size="xs" />
                    <span className="truncate font-medium">{u.displayName}</span>
                    <span className="text-link text-text-muted dark:text-text-muted truncate">
                      @{u.username}
                    </span>
                  </div>
                  <MessageSquare className="w-3.5 h-3.5 text-text-muted shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
