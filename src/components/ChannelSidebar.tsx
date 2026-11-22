import { useState } from 'react';
import {
  Bell,
  BellOff,
  ChevronDown,
  Hash,
  Headphones,
  HeadphoneOff,
  LogOut,
  Mic,
  MicOff,
  PanelLeftClose,
  Pencil,
  PhoneOff,
  Plus,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePersistentCollapseMap } from '../hooks/useCollapsibleState';
import { useUserSettings } from '../hooks/useUserSettings';
import { t } from '../i18n/translations';
import type { ActiveVoiceSession, VoiceConnectionStatus } from '../hooks/useVoiceRTC';
import type {
  Channel,
  PublicUser,
  Role,
  Server,
  ServerMember,
  VoiceParticipant,
} from '../types/majlis';
import { hasPermission } from '../utils/validation';
import { CollapseChevron, CollapsibleBody } from './CollapsibleSection';
import { UserAvatar } from './MajlisLogo';
import { SidebarMemberSearch } from './SidebarMemberSearch';
import { MajlisTooltip } from './ui/MajlisUI';

interface ChannelSidebarProps {
  server: Server;
  channels: Channel[];
  activeChannelId: string | null;
  myRole: Role;
  unreadChannelIds: Set<string>;
  voiceParticipantsByChannel: Record<string, VoiceParticipant[]>;
  activeVoiceSession: ActiveVoiceSession | null;
  voiceConnectionStatus?: VoiceConnectionStatus;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  localSpeaking?: boolean;
  remoteSpeaking?: Record<string, boolean>;
  onCollapseSidebar?: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeaveVoice: () => void;
  onSelectChannel: (channel: Channel) => void;
  onOpenCreateChannel: (defaultType: 'text' | 'voice') => void;
  onEditChannel: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
  onOpenInvite: () => void;
  onOpenServerSettings: () => void;
  onOpenModerationDashboard: () => void;
  onLeaveServer: () => void;
  publicUser: PublicUser | null;
  members?: ServerMember[];
  usersById?: Record<string, PublicUser>;
  onStartDm?: (targetUid: string) => void;
  onAddFriend?: (username: string) => void;
  onAfterSelectMember?: () => void;
}

export function ChannelSidebar({
  server,
  channels,
  activeChannelId,
  myRole,
  unreadChannelIds,
  voiceParticipantsByChannel,
  activeVoiceSession,
  voiceConnectionStatus = 'connected',
  voiceMuted,
  voiceDeafened,
  localSpeaking = false,
  remoteSpeaking = {},
  onCollapseSidebar,
  onToggleMute,
  onToggleDeafen,
  onLeaveVoice,
  onSelectChannel,
  onOpenCreateChannel,
  onEditChannel,
  onDeleteChannel,
  onOpenInvite,
  onOpenServerSettings,
  onOpenModerationDashboard,
  onLeaveServer,
  publicUser,
  members = [],
  usersById = {},
  onStartDm,
  onAddFriend,
  onAfterSelectMember,
}: ChannelSidebarProps) {
  const { language } = useAuth();
  const {
    getServerNotificationMode,
    isServerMuted,
    isChannelMuted,
    muteServer,
    setServerNotificationMode,
    muteChannel,
  } = useUserSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const { isCollapsed: isCatCollapsed, toggleSection: toggleCategory } =
    usePersistentCollapseMap(`majlis_collapsed_cats_${server.id}`);
  const serverMuted = isServerMuted(server.id);
  const serverNotifMode = getServerNotificationMode(server.id);

  const canManageChannels = hasPermission(myRole, 'manage_channels');
  const canManageServer = hasPermission(myRole, 'manage_server');
  const isOwner = myRole === 'owner';

  // Group channels by category preserving order and stable persistence key
  const categories: {
    rawKey: string;
    name: string;
    type: 'text' | 'voice';
    items: Channel[];
  }[] = [];
  const categoryMap = new Map<string, Channel[]>();

  for (const ch of channels) {
    const rawCat =
      ch.category || (ch.type === 'text' ? '__default_text__' : '__default_voice__');
    const catName =
      rawCat === 'Text Channels' || rawCat === '__default_text__'
        ? t(language, 'textChannels')
        : rawCat === 'Voice Channels' || rawCat === '__default_voice__'
        ? t(language, 'voiceChannels')
        : rawCat;
    const mapKey = `${ch.type}:${rawCat}`;
    if (!categoryMap.has(mapKey)) {
      categoryMap.set(mapKey, []);
      categories.push({
        rawKey: mapKey,
        name: catName,
        type: ch.type,
        items: categoryMap.get(mapKey)!,
      });
    }
    categoryMap.get(mapKey)!.push(ch);
  }

  return (
    <aside className="w-60 shrink-0 h-full bg-main dark:bg-main flex flex-col border-accent border-border dark:border-border select-none">
      {/* Server Header */}
      <div className="relative h-12 px-3 flex items-center justify-between gap-1 border-accent border-border dark:border-border shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center justify-between flex-1 min-w-0 text-link font-semibold text-link text-text dark:text-text hover:opacity-80 transition-opacity"
        >
          <span className="truncate">{server.name}</span>
          <ChevronDown className="w-4 h-4 shrink-0 ms-1.5 opacity-70" />
        </button>

        {onCollapseSidebar && (
          <MajlisTooltip
            content={`${t(language, 'collapseChannels')} (Ctrl+B)`}
            side="bottom"
          >
            <button
              type="button"
              onClick={onCollapseSidebar}
              aria-label={t(language, 'collapseChannels')}
              aria-expanded={true}
              aria-keyshortcuts="Control+b"
              className="p-1.5 rounded-md border border-border bg-elevated text-text hover:bg-hover hover:text-text shadow-xs transition-colors shrink-0"
            >
              <PanelLeftClose className="w-4 h-4 rtl:rotate-180" />
            </button>
          </MajlisTooltip>
        )}

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute top-12 start-2 end-2 z-40 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated shadow-xl py-1.5 text-link">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenInvite();
                }}
                className="w-full px-3 py-2 flex items-center justify-between text-link hover:bg-accent-hover hover:text-text transition-colors"
              >
                <span>{t(language, 'invitePeople')}</span>
                <UserPlus className="w-4 h-4" />
              </button>

              {canManageServer && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenServerSettings();
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between text-text dark:text-text hover:bg-main dark:hover:bg-main dark:hover:text-text transition-colors"
                >
                  <span>{t(language, 'serverSettings')}</span>
                  <Settings className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenModerationDashboard();
                }}
                className="w-full px-3 py-2 flex items-center justify-between text-text dark:text-text hover:bg-main dark:hover:bg-main dark:hover:text-text transition-colors"
              >
                <span>{t(language, 'moderationDashboard')}</span>
                <Shield className="w-4 h-4" />
              </button>

              {canManageChannels && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenCreateChannel('text');
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between text-text dark:text-text hover:bg-main dark:hover:bg-main dark:hover:text-text transition-colors"
                >
                  <span>{t(language, 'createChannel')}</span>
                  <Plus className="w-4 h-4" />
                </button>
              )}

              <div className="my-1 border-accent border-border dark:border-border" />
              <div className="px-3 py-1.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-text-muted dark:text-text-muted">
                  <span className="flex items-center gap-1.5">
                    {serverMuted ? (
                      <BellOff className="w-3.5 h-3.5 text-warning" />
                    ) : (
                      <Bell className="w-3.5 h-3.5" />
                    )}
                    <span>{t(language, 'serverNotificationsLabel')}</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['all', 'mentions', 'none'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => void setServerNotificationMode(server.id, mode)}
                      className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        serverNotifMode === mode
                          ? 'bg-accent text-text'
                          : 'bg-main dark:bg-main text-text dark:text-text hover:bg-hover dark:hover:bg-hover'
                      }`}
                    >
                      {mode === 'all'
                        ? t(language, 'notifModeAllShort')
                        : mode === 'mentions'
                        ? t(language, 'notifModeMentionsShort')
                        : t(language, 'notifModeNoneShort')}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {serverMuted ? (
                    <button
                      type="button"
                      onClick={() => {
                        void muteServer(server.id, 'unmute');
                        setMenuOpen(false);
                      }}
                      className="w-full px-2 py-1 rounded bg-success/15 text-success dark:text-success hover:bg-success hover:text-text text-[11px] font-semibold transition-colors"
                    >
                      {t(language, 'unmuteServer')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void muteServer(server.id, 3_600_000);
                          setMenuOpen(false);
                        }}
                        className="flex-1 px-1.5 py-1 rounded bg-main dark:bg-main text-[10px] text-text dark:text-text hover:bg-hover dark:hover:bg-hover"
                      >
                        {t(language, 'mute1h')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void muteServer(server.id, 28_800_000);
                          setMenuOpen(false);
                        }}
                        className="flex-1 px-1.5 py-1 rounded bg-main dark:bg-main text-[10px] text-text dark:text-text hover:bg-hover dark:hover:bg-hover"
                      >
                        {t(language, 'mute8h')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void muteServer(server.id, 'forever');
                          setMenuOpen(false);
                        }}
                        className="flex-1 px-1.5 py-1 rounded bg-main dark:bg-main text-[10px] text-text dark:text-text hover:bg-hover dark:hover:bg-hover"
                      >
                        {t(language, 'muteUntilUnmuted')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!isOwner && (
                <>
                  <div className="my-1 border-accent border-border dark:border-border" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onLeaveServer();
                    }}
                    className="w-full px-3 py-2 flex items-center justify-between text-danger dark:text-danger hover:bg-danger hover:text-text transition-colors"
                  >
                    <span>{t(language, 'leaveServer')}</span>
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Server Member Search */}
      {onStartDm && (
        <div className="px-2 pt-2.5 pb-1 shrink-0">
          <SidebarMemberSearch
            myUid={publicUser?.uid || ''}
            members={members}
            usersById={usersById}
            onStartDm={onStartDm}
            onAddFriend={onAddFriend}
            onAfterSelect={onAfterSelectMember}
            compact
          />
        </div>
      )}

      {/* Channels Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {categories.map((cat) => {
          const categoryCollapsed = isCatCollapsed(cat.rawKey);
          return (
            <div key={cat.rawKey} className="space-y-0.5">
              <div className="flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted dark:text-text-muted">
                <button
                  type="button"
                  aria-expanded={!categoryCollapsed}
                  onClick={() => toggleCategory(cat.rawKey)}
                  className="flex items-center gap-1 hover:text-text dark:hover:text-text transition-colors min-w-0 flex-1 text-link focus:outline-accent focus-visible:ring-2 focus-visible:ring-accent rounded"
                >
                  <CollapseChevron collapsed={categoryCollapsed} className="w-3 h-3" />
                  <span className="truncate">{cat.name}</span>
                </button>
                {canManageChannels && (
                  <button
                    type="button"
                    onClick={() => onOpenCreateChannel(cat.type)}
                    title={t(language, 'createChannel')}
                    className="p-0.5 rounded hover:text-text dark:hover:text-text transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-0.5">
                {cat.items.map((ch) => {
                  const isActive = activeChannelId === ch.id;
                  const isUnread = !isActive && unreadChannelIds.has(ch.id);
                  const voiceUsers = voiceParticipantsByChannel[ch.id] || [];
                  const isItemVisible = !categoryCollapsed || isActive;

                  return (
                    <CollapsibleBody key={ch.id} isOpen={isItemVisible}>
                      <div className="space-y-0.5">
                        <div
                          className={`group relative flex items-center justify-between rounded-md px-2 py-1.5 text-link transition-colors ${
                            isActive
                              ? 'bg-hover/90 dark:bg-hover/90 text-text dark:text-text font-medium'
                              : isUnread
                              ? 'text-text dark:text-text font-semibold hover:bg-hover/60 dark:hover:bg-hover/60'
                              : 'text-text dark:text-text hover:bg-hover/60 dark:hover:bg-hover/60 hover:text-text dark:hover:text-text'
                          }`}
                        >
                          {isUnread && (
                            <span className="absolute -start-1.5 top-1/2 -translate-y-1/2 w-1 h-2 rounded-e-full bg-rail dark:bg-rail" />
                          )}

                          <button
                            type="button"
                            onClick={() => onSelectChannel(ch)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-link"
                          >
                            {ch.type === 'text' ? (
                              <Hash className="w-4 h-4 shrink-0 opacity-70" />
                            ) : (
                              <Volume2 className="w-4 h-4 shrink-0 opacity-70" />
                            )}
                            <span className="truncate">{ch.name}</span>
                            {ch.type === 'voice' && voiceUsers.length > 0 && (
                              <span className="ms-auto text-[11px] font-medium text-success dark:text-success tabular-nums shrink-0">
                                {voiceUsers.length}
                              </span>
                            )}
                          </button>

                          <div className="flex items-center gap-0.5 shrink-0">
                            {ch.type === 'text' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void muteChannel(
                                    ch.id,
                                    isChannelMuted(ch.id) ? 'unmute' : 'forever'
                                  );
                                }}
                                title={
                                  isChannelMuted(ch.id)
                                    ? t(language, 'unmuteChannel')
                                    : t(language, 'muteChannel')
                                }
                                className={`p-1 rounded transition-colors ${
                                  isChannelMuted(ch.id)
                                    ? 'text-warning hover:text-warning'
                                    : 'hidden group-hover:inline-flex text-text-muted hover:text-text dark:hover:text-text'
                                }`}
                              >
                                <BellOff className="w-3 h-3" />
                              </button>
                            )}
                            {canManageChannels && (
                              <div className="hidden group-hover:flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditChannel(ch);
                                  }}
                                  title={t(language, 'rename')}
                                  className="p-1 rounded hover:text-text dark:hover:text-text"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                {channels.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteChannel(ch);
                                    }}
                                    title={t(language, 'delete')}
                                    className="p-1 rounded hover:text-danger"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Voice channel connected participants */}
                        {ch.type === 'voice' && voiceUsers.length > 0 && (
                          <div className="ps-7 pe-1 py-0.5 space-y-1">
                            {voiceUsers.map((vp) => {
                              const isSelf = vp.userId === publicUser?.uid;
                              const isSpeakingNow =
                                !vp.muted &&
                                !vp.deafened &&
                                (isSelf
                                  ? activeVoiceSession?.kind === 'channel' &&
                                    activeVoiceSession.channelId === ch.id
                                    ? localSpeaking
                                    : vp.speaking
                                  : remoteSpeaking[vp.userId] || vp.speaking);

                              return (
                                <div
                                  key={vp.userId}
                                  className="flex items-center justify-between gap-2 py-0.5 text-link text-text dark:text-text"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <UserAvatar
                                      src={vp.avatarUrl}
                                      name={vp.displayName}
                                      size="xs"
                                      speaking={isSpeakingNow}
                                    />
                                    <span
                                      className={`truncate transition-colors ${
                                        isSpeakingNow
                                          ? 'text-success dark:text-success font-semibold'
                                          : ''
                                      }`}
                                    >
                                      {vp.displayName}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 text-danger">
                                    {vp.muted && <MicOff className="w-3 h-3" />}
                                    {vp.deafened && <HeadphoneOff className="w-3 h-3" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </CollapsibleBody>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connected Voice Bar */}
      {activeVoiceSession && (
        <div className="px-2.5 py-2 items-center justify-between gap-2 border-accent border-border dark:border-border bg-hover/70 dark:bg-hover/70 flex shrink-0">
          <div className="min-w-0">
            <div
              className={`text-link font-semibold ${
                voiceConnectionStatus === 'reconnecting'
                  ? 'text-warning dark:text-warning animate-pulse'
                  : voiceConnectionStatus === 'connecting'
                  ? 'text-link dark:text-link'
                  : 'text-success dark:text-success'
              }`}
            >
              {voiceConnectionStatus === 'reconnecting'
                ? t(language, 'voiceReconnecting')
                : voiceConnectionStatus === 'connecting'
                ? t(language, 'voiceConnecting')
                : t(language, 'voiceConnected')}
            </div>
            <div className="text-[11px] text-text dark:text-text truncate">
              {activeVoiceSession.kind === 'channel'
                ? `${activeVoiceSession.channelName} / ${activeVoiceSession.serverName}`
                : activeVoiceSession.callName}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleMute}
              title={voiceMuted ? t(language, 'unmute') : t(language, 'mute')}
              className={`p-1.5 rounded-md transition-colors ${
                voiceMuted
                  ? 'text-danger bg-danger/10'
                  : 'text-text dark:text-text hover:bg-hover/60 dark:hover:bg-hover/60'
              }`}
            >
              {voiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onToggleDeafen}
              title={voiceDeafened ? t(language, 'undeafen') : t(language, 'deafen')}
              className={`p-1.5 rounded-md transition-colors ${
                voiceDeafened
                  ? 'text-danger bg-danger/10'
                  : 'text-text dark:text-text hover:bg-hover/60 dark:hover:bg-hover/60'
              }`}
            >
              {voiceDeafened ? (
                <HeadphoneOff className="w-4 h-4" />
              ) : (
                <Headphones className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onLeaveVoice}
              title={t(language, 'leaveVoice')}
              className="p-1.5 rounded-md text-text dark:text-text hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
