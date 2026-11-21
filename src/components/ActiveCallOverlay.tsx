import React, { useEffect, useState } from 'react';
import {
  Camera,
  CameraOff,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  PhoneOff,
  Pin,
  Plus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { VoiceConnectionStatus } from '../hooks/useVoiceRTC';
import { t } from '../i18n/translations';
import type { DirectCall, Friendship, PublicUser, VoiceParticipant } from '../types/nexus';
import { UserAvatar } from './NexusLogo';

interface ActiveCallOverlayProps {
  call: DirectCall;
  participants: VoiceParticipant[];
  usersById: Record<string, PublicUser>;
  friendships: Friendship[];
  myUid: string;
  connectionStatus?: VoiceConnectionStatus;
  muted: boolean;
  deafened: boolean;
  localSpeaking: boolean;
  remoteSpeaking?: Record<string, boolean>;
  cameraActive: boolean;
  screenShareActive: boolean;
  localVideoStream: MediaStream | null;
  remoteVideoStreams: Record<string, MediaStream>;
  pinnedUserId: string | null;
  setPinnedUserId: (uid: string | null) => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onEndCall: (durationSeconds: number) => void;
  onAddParticipant: (targetUid: string) => void;
}

export function ActiveCallOverlay({
  call,
  participants,
  usersById,
  friendships,
  myUid,
  connectionStatus = 'connected',
  muted,
  deafened,
  localSpeaking,
  remoteSpeaking = {},
  cameraActive,
  screenShareActive,
  localVideoStream,
  remoteVideoStreams,
  pinnedUserId,
  setPinnedUserId,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onEndCall,
  onAddParticipant,
}: ActiveCallOverlayProps) {
  const { language } = useAuth();
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  // Call duration timer
  useEffect(() => {
    const timer = window.setInterval(() => {
      setDurationSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const activePinnedId =
    pinnedUserId || participants.find((p) => p.hasScreenShare)?.userId || null;

  // Available friends to invite (not already in call, max 6 total)
  const availableFriends = friendships
    .filter((f) => f.status === 'accepted')
    .map((f) => {
      const friendUid = f.participants.find((id) => id !== myUid) || '';
      return usersById[friendUid];
    })
    .filter((u): u is PublicUser => Boolean(u && !call.participants.includes(u.uid)));

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 end-4 z-50 rounded-2xl bg-slate-900/90 text-white border border-white/20 shadow-2xl p-3 flex items-center gap-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full animate-pulse ${
              connectionStatus === 'reconnecting' ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          <span className="text-xs font-semibold tabular-nums">
            {connectionStatus === 'reconnecting'
              ? t(language, 'voiceReconnecting')
              : formatDuration(durationSeconds)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleMute}
            className={`p-1.5 rounded-lg ${muted ? 'text-rose-400 bg-rose-500/20' : 'text-zinc-300 hover:bg-white/10'}`}
          >
            {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="p-1.5 rounded-lg text-zinc-300 hover:bg-white/10"
            title="Maximize"
          >
            <Users className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onEndCall(durationSeconds)}
            className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
            title={t(language, 'endCall')}
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 text-white select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-nexus/20 text-nexus">
            {call.type === 'video' ? <Video className="w-5 h-5" /> : <Users className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="font-bold text-base sm:text-lg truncate">
              {call.isGroup
                ? `${call.groupName || t(language, 'groupCall')} (${call.participants.length})`
                : call.participants.length > 2
                ? `${t(language, 'directMessages')} (${call.participants.length})`
                : call.callerId === myUid
                ? usersById[call.participants.find((id) => id !== myUid) || '']?.displayName ||
                  t(language, 'directMessage')
                : call.callerName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  connectionStatus === 'reconnecting' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              <span className="tabular-nums font-medium">{formatDuration(durationSeconds)}</span>
              <span>· {participants.length} {t(language, 'members')}</span>
              {connectionStatus === 'reconnecting' && (
                <span className="text-amber-400 font-semibold">
                  · {t(language, 'voiceReconnecting')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {call.participants.length < 10 && (
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-white/15 bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t(language, 'inviteToCall')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-2 rounded-2xl border border-white/10 bg-white/10 hover:bg-white/20 text-zinc-300"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Participant Grid */}
      <main className="flex-1 flex items-center justify-center py-4 overflow-y-auto">
        {participants.length === 0 ? (
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-nexus/20 flex items-center justify-center animate-ping">
              <Users className="w-8 h-8 text-nexus" />
            </div>
            <p className="text-sm text-zinc-400">{t(language, 'calling')}</p>
          </div>
        ) : (
          <div
            className={`grid gap-4 w-full max-w-5xl ${
              participants.length === 1
                ? 'grid-cols-1 max-w-md'
                : participants.length === 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-2 sm:grid-cols-3'
            }`}
          >
            {participants.map((p) => {
              const isMe = p.userId === myUid;
              const isSpeaking =
                isMe
                  ? localSpeaking && !muted && !deafened
                  : (remoteSpeaking[p.userId] || p.speaking) && !p.muted && !p.deafened;

              const hasVideo = p.hasCamera || p.hasScreenShare;
              const streamToAttach = isMe ? localVideoStream : remoteVideoStreams[p.userId];

              return (
                <div
                  key={p.userId}
                  className={`relative rounded-2xl border overflow-hidden flex flex-col items-center justify-center transition-all aspect-video bg-zinc-900 ${
                    isSpeaking
                      ? 'border-emerald-500 shadow-lg shadow-emerald-500/20'
                      : 'border-white/10'
                  }`}
                >
                  {hasVideo ? (
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
                  ) : (
                    <UserAvatar
                      src={p.avatarUrl}
                      name={p.displayName}
                      size="xl"
                      speaking={isSpeaking}
                    />
                  )}

                  {/* Name and State Bar */}
                  <div className="absolute bottom-2.5 start-2.5 end-2.5 flex items-center justify-between bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs">
                    <span className="font-semibold truncate">
                      {p.displayName} {isMe ? '(You)' : ''}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {p.muted && <MicOff className="w-3.5 h-3.5 text-rose-400" />}
                      {p.deafened && <HeadphoneOff className="w-3.5 h-3.5 text-rose-400" />}
                      {hasVideo && (
                        <button
                          type="button"
                          onClick={() =>
                            setPinnedUserId(activePinnedId === p.userId ? null : p.userId)
                          }
                          className="p-1 rounded hover:bg-white/20 text-white"
                          title={t(language, 'pinScreen')}
                        >
                          <Pin className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Control Dock */}
      <footer className="flex items-center justify-center gap-3 py-2 flex-wrap">
        <button
          type="button"
          onClick={onToggleMute}
          className={`p-3.5 rounded-2xl transition-colors ${
            muted ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={muted ? t(language, 'unmute') : t(language, 'mute')}
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={onToggleDeafen}
          className={`p-3.5 rounded-2xl transition-colors ${
            deafened ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={deafened ? t(language, 'undeafen') : t(language, 'deafen')}
        >
          {deafened ? <HeadphoneOff className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={onToggleCamera}
          className={`p-3.5 rounded-2xl transition-colors ${
            cameraActive ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={cameraActive ? t(language, 'stopCamera') : t(language, 'camera')}
        >
          {cameraActive ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={onToggleScreenShare}
          className={`p-3.5 rounded-2xl transition-colors ${
            screenShareActive ? 'bg-nexus/40 text-nexus border border-nexus/50' : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
          title={screenShareActive ? t(language, 'stopScreenShare') : t(language, 'screenShare')}
        >
          {screenShareActive ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={() => onEndCall(durationSeconds)}
          className="px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-2 shadow-lg transition-colors"
        >
          <PhoneOff className="w-5 h-5" />
          <span>{t(language, 'endCall')}</span>
        </button>
      </footer>

      {/* Add Friend Dialog */}
      {showAddMember && (
        <div
          onClick={() => setShowAddMember(false)}
          className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-[#1E1F22] border border-white/10 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">
                {t(language, 'inviteToCall')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddMember(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              {t(language, 'groupCallLimit')}
            </p>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {availableFriends.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">
                  {t(language, 'noFriendsOnline')}
                </div>
              ) : (
                availableFriends.map((f) => (
                  <button
                    key={f.uid}
                    type="button"
                    onClick={() => {
                      onAddParticipant(f.uid);
                      setShowAddMember(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <UserAvatar src={f.avatarUrl} name={f.displayName} size="sm" />
                      <div className="text-start truncate">
                        <div className="text-xs font-semibold text-white truncate">
                          {f.displayName}
                        </div>
                        <div className="text-[10px] text-zinc-400">@{f.username}</div>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-nexus shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
