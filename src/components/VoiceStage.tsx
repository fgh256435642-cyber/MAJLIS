import {
  Camera,
  CameraOff,
  Headphones,
  HeadphoneOff,
  Loader2,
  Maximize2,
  Menu,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PanelLeftOpen,
  PhoneCall,
  PhoneOff,
  Pin,
  Volume2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { VoiceConnectionStatus } from '../hooks/useVoiceRTC';
import { t } from '../i18n/translations';
import type { Channel, Server, VoiceParticipant } from '../types/nexus';
import { UserAvatar } from './NexusLogo';

interface VoiceStageProps {
  server: Server;
  channel: Channel;
  participants: VoiceParticipant[];
  isConnectedHere: boolean;
  muted: boolean;
  deafened: boolean;
  localSpeaking: boolean;
  remoteSpeaking?: Record<string, boolean>;
  myUid: string;
  voiceError: string | null;
  connectionStatus?: VoiceConnectionStatus;
  cameraActive: boolean;
  screenShareActive: boolean;
  remoteVideoStreams: Record<string, MediaStream>;
  pinnedUserId: string | null;
  setPinnedUserId: (uid: string | null) => void;
  videoStreamRef: MediaStream | null;
  screenStreamRef: MediaStream | null;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  onOpenMobileSidebar: () => void;
}

export function VoiceStage({
  channel,
  participants,
  isConnectedHere,
  muted,
  deafened,
  localSpeaking,
  remoteSpeaking = {},
  myUid,
  voiceError,
  connectionStatus = 'connected',
  cameraActive,
  screenShareActive,
  remoteVideoStreams,
  pinnedUserId,
  setPinnedUserId,
  videoStreamRef,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  sidebarCollapsed = false,
  onExpandSidebar,
  onOpenMobileSidebar,
}: VoiceStageProps) {
  const { language } = useAuth();
  const [fullscreenParticipantId, setFullscreenParticipantId] = useState<string | null>(null);
  const activePinnedId = pinnedUserId || participants.find((p) => p.hasScreenShare)?.userId || null;

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-white dark:bg-[#1E1F22]">
      <header className="h-12 px-4 border-b border-slate-200 dark:border-black/25 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-[#313338]">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 rounded-md text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <Menu className="w-5 h-5" />
          </button>
          {sidebarCollapsed && onExpandSidebar && (
            <button
              type="button"
              onClick={onExpandSidebar}
              title={`${t(language, 'expandChannels')} (Ctrl+B)`}
              aria-label={t(language, 'expandChannels')}
              aria-keyshortcuts="Control+b"
              className="hidden md:inline-flex p-1.5 rounded-md border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-[#2B2D31] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
            >
              <PanelLeftOpen className="w-4 h-4 rtl:rotate-180" />
            </button>
          )}
          <Volume2 className="w-5 h-5 text-slate-400 dark:text-zinc-400 shrink-0" />
          <h2 className="font-semibold text-base text-slate-900 dark:text-white truncate">
            {channel.name}
          </h2>
          {participants.length > 0 && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium tabular-nums shrink-0">
              · {participants.length}
            </span>
          )}
          {isConnectedHere && connectionStatus === 'reconnecting' && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0 animate-pulse">
              · {t(language, 'voiceReconnecting')}
            </span>
          )}
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-zinc-400 border-s border-slate-200 dark:border-white/10 ps-3">
            {t(language, 'voiceStageSubtitle')}
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        {isConnectedHere && connectionStatus === 'reconnecting' && (
          <div className="mb-4 max-w-md w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-600 dark:text-amber-300 flex items-center justify-center gap-2 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>{t(language, 'voiceReconnecting')}</span>
          </div>
        )}

        {voiceError && (
          <div className="mb-6 max-w-md w-full rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-300 text-center">
            {voiceError}
          </div>
        )}

        {participants.length === 0 ? (
          <div className="text-center space-y-4 max-w-md">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-nexus/15 text-nexus flex items-center justify-center">
              <Volume2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{channel.name}</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              {t(language, 'voiceEmpty')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl w-full mb-8">
            {participants.map((p) => {
              const speaking =
                p.userId === myUid
                  ? localSpeaking && !muted && !deafened
                  : (remoteSpeaking[p.userId] || p.speaking) && !p.muted && !p.deafened;

              const isMe = p.userId === myUid;
              const hasVideoOrScreen = p.hasCamera || p.hasScreenShare;
              const streamToAttach = isMe ? videoStreamRef : remoteVideoStreams[p.userId];

              return (
                <div
                  key={p.userId}
                  className={`relative rounded-2xl border overflow-hidden flex flex-col items-center justify-center transition-all duration-150 ${
                    speaking
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#2B2D31]'
                  } ${hasVideoOrScreen ? 'aspect-video' : 'p-6'}`}
                >
                  {/* Video / Screen Share Stream */}
                  {hasVideoOrScreen ? (
                    <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center">
                      <video
                        autoPlay
                        playsInline
                        muted={isMe}
                        ref={(el) => {
                          if (el && streamToAttach && el.srcObject !== streamToAttach) {
                            el.srcObject = streamToAttach;
                          }
                        }}
                        className="w-full h-full object-contain"
                      />
                      {p.hasScreenShare && (
                        <span className="absolute top-3 start-3 px-2.5 py-1 rounded-md bg-rose-600 text-white text-[10px] font-bold tracking-wider uppercase animate-pulse">
                          {t(language, 'live')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <UserAvatar
                      src={p.avatarUrl}
                      name={p.displayName}
                      size="xl"
                      speaking={speaking}
                    />
                  )}

                  {/* Participant Name & Status Overlay */}
                  <div className="absolute bottom-3 start-3 end-3 flex items-center justify-between bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-xl">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-xs font-semibold text-white truncate">
                        {p.displayName} {isMe ? '(You)' : ''}
                      </span>
                      {p.muted && <MicOff className="w-3 h-3 text-rose-400 shrink-0" />}
                      {p.deafened && <HeadphoneOff className="w-3 h-3 text-rose-400 shrink-0" />}
                    </div>
                    {hasVideoOrScreen && (
                      <div className="flex items-center gap-1">
                        {p.hasScreenShare && (
                          <button
                            type="button"
                            onClick={() => setFullscreenParticipantId(p.userId)}
                            className="p-1 rounded hover:bg-white/20 text-white"
                            title={t(language, 'fullscreen')}
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setPinnedUserId(activePinnedId === p.userId ? null : p.userId)
                          }
                          className="p-1 rounded hover:bg-white/20 text-white"
                          title={t(language, 'pinScreen')}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {fullscreenParticipantId && (() => {
          const participant = participants.find((p) => p.userId === fullscreenParticipantId);
          if (!participant) return null;
          const stream =
            participant.userId === myUid
              ? videoStreamRef
              : remoteVideoStreams[participant.userId];
          return (
            <div
              className="fixed inset-0 z-[80] bg-black/95 flex flex-col"
              onClick={() => setFullscreenParticipantId(null)}
            >
              <div className="h-12 px-4 flex items-center justify-between text-white shrink-0">
                <span className="text-sm font-semibold truncate">
                  {participant.displayName} · {t(language, 'screenShare')}
                </span>
                <button
                  type="button"
                  onClick={() => setFullscreenParticipantId(null)}
                  className="p-2 rounded-xl hover:bg-white/10"
                  title={t(language, 'cancel')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 p-3" onClick={(e) => e.stopPropagation()}>
                <video
                  autoPlay
                  playsInline
                  muted={participant.userId === myUid}
                  ref={(el) => {
                    if (el && stream && el.srcObject !== stream) el.srcObject = stream;
                  }}
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>
            </div>
          );
        })()}

        {/* Controls Bar */}
        <div className="mt-6 flex items-center flex-wrap justify-center gap-3">
          {isConnectedHere ? (
            <>
              <button
                type="button"
                onClick={onToggleMute}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  muted
                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                    : 'bg-slate-200 dark:bg-[#2B2D31] text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-[#35373C]'
                }`}
              >
                {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{muted ? t(language, 'unmute') : t(language, 'mute')}</span>
              </button>

              <button
                type="button"
                onClick={onToggleDeafen}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  deafened
                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                    : 'bg-slate-200 dark:bg-[#2B2D31] text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-[#35373C]'
                }`}
              >
                {deafened ? <HeadphoneOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
                <span>{deafened ? t(language, 'undeafen') : t(language, 'deafen')}</span>
              </button>

              <button
                type="button"
                onClick={onToggleCamera}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  cameraActive
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-200 dark:bg-[#2B2D31] text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-[#35373C]'
                }`}
              >
                {cameraActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                <span>{cameraActive ? t(language, 'stopCamera') : t(language, 'camera')}</span>
              </button>

              <button
                type="button"
                onClick={onToggleScreenShare}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  screenShareActive
                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30'
                    : 'bg-slate-200 dark:bg-[#2B2D31] text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-[#35373C]'
                }`}
              >
                {screenShareActive ? (
                  <MonitorOff className="w-4 h-4" />
                ) : (
                  <Monitor className="w-4 h-4" />
                )}
                <span>
                  {screenShareActive ? t(language, 'stopScreenShare') : t(language, 'screenShare')}
                </span>
              </button>

              <button
                type="button"
                onClick={onLeaveVoice}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                <span>{t(language, 'leaveVoice')}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onJoinVoice}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-lg"
            >
              <PhoneCall className="w-4 h-4" />
              <span>{t(language, 'joinVoice')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
