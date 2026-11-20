import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/translations';
import type { ActiveVoiceSession, VoiceConnectionStatus } from '../hooks/useVoiceRTC';
import type {
  Channel,
  ChannelType,
  DirectMessageThread,
  GroupDm,
  JoinedServerRef,
  PublicUser,
  Role,
  Server,
  ServerMember,
  SettingsCategoryId,
  VoiceParticipant,
} from '../types/nexus';
import { ChannelSidebar } from './ChannelSidebar';
import { FriendsAndDmSidebar } from './FriendsAndDmSidebar';
import { ServerRail } from './ServerRail';

interface PersistentSidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  secondaryOpen: boolean;
  onToggleSecondaryOpen: () => void;
  joinedServers: JoinedServerRef[];
  activeView: 'home' | 'server';
  activeServer: Server | null;
  activeServerId: string | null;
  channels: Channel[];
  activeChannelId: string | null;
  myRole: Role;
  unreadServerIds: Set<string>;
  unreadChannelIds: Set<string>;
  unreadCountsByConv: Record<string, number>;
  pendingFriendCount: number;
  dmThreads: DirectMessageThread[];
  groups?: GroupDm[];
  mutedGroupIds?: Set<string>;
  activeDmId: string | null;
  activeGroupId?: string | null;
  usersById: Record<string, PublicUser>;
  members?: ServerMember[];
  publicUser: PublicUser | null;
  voiceParticipantsByChannel: Record<string, VoiceParticipant[]>;
  activeVoiceSession: ActiveVoiceSession | null;
  voiceConnectionStatus?: VoiceConnectionStatus;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  localSpeaking?: boolean;
  remoteSpeaking?: Record<string, boolean>;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeaveVoice: () => void;
  onSelectHome: () => void;
  onSelectServer: (serverId: string) => void;
  onReorderServers: (
    fromServerId: string,
    toServerId: string,
    position: 'before' | 'after'
  ) => void;
  onSelectChannel: (channel: Channel) => void;
  onSelectFriends: () => void;
  onSelectDm: (dmId: string) => void;
  onSelectGroup?: (groupId: string) => void;
  onOpenCreateGroup?: () => void;
  onStartDm?: (targetUid: string) => void;
  onAddFriend?: (username: string) => void;
  onOpenCreateJoin: () => void;
  onOpenDiscover: () => void;
  onOpenQuickSwitcher: () => void;
  onOpenCreateChannel: (defaultType: ChannelType) => void;
  onEditChannel: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
  onOpenInvite: () => void;
  onOpenServerSettings: () => void;
  onOpenModerationDashboard: () => void;
  onLeaveServer: () => void;
  onOpenUserSettings: (tab?: SettingsCategoryId) => void;
}

export function PersistentSidebar({
  mobileOpen,
  onCloseMobile,
  secondaryOpen,
  onToggleSecondaryOpen,
  joinedServers,
  activeView,
  activeServer,
  activeServerId,
  channels,
  activeChannelId,
  myRole,
  unreadServerIds,
  unreadChannelIds,
  unreadCountsByConv,
  pendingFriendCount,
  dmThreads,
  groups = [],
  mutedGroupIds,
  activeDmId,
  activeGroupId = null,
  usersById,
  members = [],
  publicUser,
  voiceParticipantsByChannel,
  activeVoiceSession,
  voiceConnectionStatus,
  voiceMuted,
  voiceDeafened,
  localSpeaking = false,
  remoteSpeaking = {},
  onToggleMute,
  onToggleDeafen,
  onLeaveVoice,
  onSelectHome,
  onSelectServer,
  onReorderServers,
  onSelectChannel,
  onSelectFriends,
  onSelectDm,
  onSelectGroup,
  onOpenCreateGroup,
  onStartDm,
  onAddFriend,
  onOpenCreateJoin,
  onOpenDiscover,
  onOpenQuickSwitcher,
  onOpenCreateChannel,
  onEditChannel,
  onDeleteChannel,
  onOpenInvite,
  onOpenServerSettings,
  onOpenModerationDashboard,
  onLeaveServer,
  onOpenUserSettings,
}: PersistentSidebarProps) {
  const { language } = useAuth();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    const isRtl =
      typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    if (isRtl ? dx > 56 : dx < -56) {
      onCloseMobile();
    }
  };

  const renderUnifiedLayout = (isSecondaryVisible: boolean, showCollapseControl: boolean) => (
    <div className="flex h-full">
      {/* Unified Persistent Vertical Rail (always visible on desktop, part of drawer on mobile) */}
      <ServerRail
        joinedServers={joinedServers}
        activeView={activeView}
        activeServerId={activeServerId}
        activeDmId={activeDmId}
        activeGroupId={activeGroupId}
        unreadServerIds={unreadServerIds}
        unreadCountsByConv={unreadCountsByConv}
        pendingFriendCount={pendingFriendCount}
        dmThreads={dmThreads}
        groups={groups}
        usersById={usersById}
        publicUser={publicUser}
        onSelectHome={() => {
          onSelectHome();
          onCloseMobile();
        }}
        onSelectFriends={() => {
          onSelectHome();
          onSelectFriends();
          onCloseMobile();
        }}
        onSelectDm={(dmId) => {
          onSelectHome();
          onSelectDm(dmId);
          onCloseMobile();
        }}
        onSelectGroup={(groupId) => {
          onSelectHome();
          onSelectGroup?.(groupId);
          onCloseMobile();
        }}
        onSelectServer={(sId) => {
          onSelectServer(sId);
          onCloseMobile();
        }}
        onReorderServers={onReorderServers}
        onOpenCreateJoin={() => {
          onOpenCreateJoin();
          onCloseMobile();
        }}
        onOpenDiscover={() => {
          onOpenDiscover();
          onCloseMobile();
        }}
        onOpenQuickSwitcher={() => {
          onOpenQuickSwitcher();
          onCloseMobile();
        }}
        onOpenUserSettings={(tab) => {
          onOpenUserSettings(tab);
          onCloseMobile();
        }}
      />

      {/* Contextual Secondary Sidebar: Server Channels OR Friends/DMs/Groups */}
      <div
        aria-hidden={!isSecondaryVisible}
        className={`h-full shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out ${
          isSecondaryVisible
            ? 'w-60 opacity-100'
            : 'w-0 opacity-0 pointer-events-none'
        }`}
      >
        {activeView === 'server' && activeServer ? (
          <ChannelSidebar
            server={activeServer}
            channels={channels}
            activeChannelId={activeChannelId}
            myRole={myRole}
            unreadChannelIds={unreadChannelIds}
            voiceParticipantsByChannel={voiceParticipantsByChannel}
            activeVoiceSession={activeVoiceSession}
            voiceConnectionStatus={voiceConnectionStatus}
            voiceMuted={voiceMuted}
            voiceDeafened={voiceDeafened}
            localSpeaking={localSpeaking}
            remoteSpeaking={remoteSpeaking}
            onCollapseSidebar={showCollapseControl ? onToggleSecondaryOpen : undefined}
            onToggleMute={onToggleMute}
            onToggleDeafen={onToggleDeafen}
            onLeaveVoice={onLeaveVoice}
            onSelectChannel={(ch) => {
              onSelectChannel(ch);
              onCloseMobile();
            }}
            onOpenCreateChannel={onOpenCreateChannel}
            onEditChannel={onEditChannel}
            onDeleteChannel={onDeleteChannel}
            onOpenInvite={onOpenInvite}
            onOpenServerSettings={onOpenServerSettings}
            onOpenModerationDashboard={onOpenModerationDashboard}
            onLeaveServer={onLeaveServer}
            publicUser={publicUser}
            members={members}
            usersById={usersById}
            onStartDm={onStartDm}
            onAddFriend={onAddFriend}
            onAfterSelectMember={onCloseMobile}
          />
        ) : (
          <FriendsAndDmSidebar
            activeDmId={activeDmId}
            activeGroupId={activeGroupId}
            dmThreads={dmThreads}
            groups={groups}
            mutedGroupIds={mutedGroupIds}
            unreadCountsByConv={unreadCountsByConv}
            usersById={usersById}
            pendingFriendCount={pendingFriendCount}
            publicUser={publicUser}
            onCollapseSidebar={showCollapseControl ? onToggleSecondaryOpen : undefined}
            onSelectFriends={() => {
              onSelectFriends();
              onCloseMobile();
            }}
            onSelectDm={(dmId) => {
              onSelectDm(dmId);
              onCloseMobile();
            }}
            onSelectGroup={(groupId) => {
              onSelectGroup?.(groupId);
              onCloseMobile();
            }}
            onOpenCreateGroup={onOpenCreateGroup}
            onStartDm={onStartDm}
            onAddFriend={onAddFriend}
            onAfterSelectMember={onCloseMobile}
            onOpenQuickSwitcher={onOpenQuickSwitcher}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Layout: Unified Rail (always visible) + Collapsible Channels/DMs Panel */}
      <div className="hidden md:flex h-full shrink-0">
        {renderUnifiedLayout(secondaryOpen, true)}
      </div>

      {/* Responsive Mobile Slide-In Drawer (RTL-aware logical start edge + swipe-to-close) */}
      <div
        aria-hidden={!mobileOpen}
        className={`fixed inset-0 z-50 md:hidden flex transition-[opacity,visibility] duration-200 ${
          mobileOpen
            ? 'pointer-events-auto visible opacity-100'
            : 'pointer-events-none invisible opacity-0'
        }`}
      >
        <div
          className={`fixed inset-0 bg-black/60 backdrop-blur-[1px] transition-opacity duration-200 ease-out ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onCloseMobile}
        />
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`relative z-10 flex h-full shadow-2xl transition-transform duration-200 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
          }`}
        >
          {renderUnifiedLayout(true, false)}
          <button
            type="button"
            onClick={onCloseMobile}
            className="m-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center self-start hover:bg-black/80 transition-colors"
            aria-label={t(language, 'closeMenu')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
