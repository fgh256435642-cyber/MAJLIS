import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import type {
  CameraQuality,
  NotificationSoundId,
  PublicUser,
  VoiceParticipant,
  VoiceSignal,
} from '../types/majlis';
import { playChime } from '../utils/sound';
import { matchesShortcutEvent } from '../utils/validation';

const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function getConfiguredTurnServers(): RTCIceServer[] {
  const urls = (import.meta.env.VITE_TURN_URL || '')
    .split(',')
    .map((url: string) => url.trim())
    .filter((url: string) => /^turns?:/i.test(url));
  const username = import.meta.env.VITE_TURN_USERNAME || '';
  const credential = import.meta.env.VITE_TURN_CREDENTIAL || '';

  if (urls.length === 0) return [];
  if (!username || !credential) {
    console.warn(
      '[VoiceRTC] VITE_TURN_URL is set, but VITE_TURN_USERNAME or VITE_TURN_CREDENTIAL is missing.'
    );
    return [];
  }

  return [{ urls, username, credential }];
}

function hasTurnServer(iceServers: RTCIceServer[]): boolean {
  return iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => /^turns?:/i.test(url));
  });
}

function addTurnFallback(iceServers: RTCIceServer[]): RTCIceServer[] {
  if (hasTurnServer(iceServers)) return iceServers;
  const turnServers = getConfiguredTurnServers();
  if (turnServers.length === 0) {
    console.warn(
      '[VoiceRTC] No TURN server configured; using STUN only. Configure VITE_TURN_URL, VITE_TURN_USERNAME, and VITE_TURN_CREDENTIAL.'
    );
  }
  return [...iceServers, ...turnServers];
}

function getLocalAudioTrackDiagnostics(stream: MediaStream | null) {
  return (stream?.getAudioTracks() ?? []).map((track) => ({
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
  }));
}

const RECONNECT_BACKOFF_MS = [1200, 2500, 4000, 6000, 8000, 10000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;

export type VoiceConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export interface VoiceSettingsConfig {
  audioInputId?: string;
  audioOutputId?: string;
  videoInputId?: string;
  voiceSensitivityAuto?: boolean;
  voiceSensitivityThreshold?: number;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
  autoGainControl?: boolean;
  outputVolume?: number;
  cameraQuality?: CameraQuality;
  pushToTalkEnabled?: boolean;
  pushToTalkKey?: string;
  soundPreset?: NotificationSoundId;
  soundVolume?: number;
  vpnCompatibilityMode?: boolean;
}

export interface VoiceDiagnosticPeer {
  peerUid: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  localCandidateType: string;
  remoteCandidateType: string;
  rttMs: number | null;
  packetsLost: number;
  bytesReceived: number;
  codec: string;
}

export async function runStunDiagnosticProbe(): Promise<{
  success: boolean;
  candidateTypes: string[];
  srflxAddress: string | null;
  gatherTimeMs: number;
  error?: string;
}> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    let settled = false;
    const types = new Set<string>();
    let srflxAddress: string | null = null;
    let pc: RTCPeerConnection | null = null;

    const finish = (success: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      try {
        pc?.close();
      } catch {
        // ignore
      }
      resolve({
        success,
        candidateTypes: Array.from(types),
        srflxAddress,
        gatherTimeMs: Math.round(performance.now() - startedAt),
        error,
      });
    };

    try {
      pc = new RTCPeerConnection(DEFAULT_ICE_SERVERS);
      pc.createDataChannel('probe');
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          if (e.candidate.type) types.add(e.candidate.type);
          if ((e.candidate.type === 'srflx' || e.candidate.type === 'relay') && e.candidate.address) {
            srflxAddress = e.candidate.address;
          }
        } else {
          finish(types.size > 0);
        }
      };
      pc.createOffer()
        .then((offer) => pc!.setLocalDescription(offer))
        .catch((err) => finish(false, err instanceof Error ? err.message : 'Offer failed'));
      window.setTimeout(() => finish(types.size > 0), 4500);
    } catch (err) {
      finish(false, err instanceof Error ? err.message : 'WebRTC unavailable');
    }
  });
}

function getCameraConstraints(quality: CameraQuality = '720p', deviceId?: string): MediaTrackConstraints {
  const dims =
    quality === '1080p'
      ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
      : quality === '480p'
      ? { width: { ideal: 640 }, height: { ideal: 480 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };
  return {
    ...dims,
    frameRate: 30,
    ...(deviceId && deviceId !== 'default' ? { deviceId: { ideal: deviceId } } : {}),
  };
}

export type ActiveVoiceSession =
  | {
      kind: 'channel';
      serverId: string;
      serverName: string;
      channelId: string;
      channelName: string;
    }
  | {
      kind: 'call';
      callId: string;
      callName: string;
      dmId: string;
      callType: 'audio' | 'video';
    };

function getSessionKey(session: ActiveVoiceSession | null): string | null {
  if (!session) return null;
  return session.kind === 'channel'
    ? `ch:${session.serverId}:${session.channelId}`
    : `call:${session.callId}`;
}

function getVoicePaths(session: ActiveVoiceSession) {
  if (session.kind === 'call') {
    return {
      participantsCol: collection(db, 'calls', session.callId, 'participants'),
      participantDoc: (uid: string) => doc(db, 'calls', session.callId, 'participants', uid),
      signalsCol: collection(db, 'calls', session.callId, 'signals'),
    };
  }
  return {
    participantsCol: collection(
      db,
      'servers',
      session.serverId,
      'channels',
      session.channelId,
      'voiceParticipants'
    ),
    participantDoc: (uid: string) =>
      doc(
        db,
        'servers',
        session.serverId,
        'channels',
        session.channelId,
        'voiceParticipants',
        uid
      ),
    signalsCol: collection(
      db,
      'servers',
      session.serverId,
      'channels',
      session.channelId,
      'voiceSignals'
    ),
  };
}

function applyMaxBitrate(sender: RTCRtpSender, maxBitrate: number) {
  try {
    const params = sender.getParameters();
    if (params.encodings && params.encodings.length > 0) {
      params.encodings[0].maxBitrate = maxBitrate;
      sender.setParameters(params).catch(() => {});
    }
  } catch {
    // Ignore unsupported browser parameter modifications
  }
}

function addLocalStreamTracks(pc: RTCPeerConnection, stream: MediaStream) {
  const senderTracks = pc.getSenders().map((sender) => sender.track);
  stream.getTracks().forEach((track) => {
    if (senderTracks.includes(track)) return;
    const sender = pc.addTrack(track, stream);
    senderTracks.push(track);
    if (track.kind === 'video') {
      applyMaxBitrate(sender, 2000000);
    }
  });
}

export function useVoiceRTC(
  currentUser: PublicUser | null,
  soundEnabled: boolean,
  voiceConfig?: VoiceSettingsConfig
) {
  const [activeSession, setActiveSession] = useState<ActiveVoiceSession | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<VoiceConnectionStatus>('idle');
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState<Record<string, boolean>>({});
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Record<string, MediaStream>>({});
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [pttTransmitting, setPttTransmitting] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerCreationsRef = useRef<Map<string, Promise<RTCPeerConnection>>>(new Map());
  const remoteAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const remoteGainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const remoteTimersRef = useRef<Map<string, number>>(new Map());
  const peerDiagnosticsTimersRef = useRef<Map<string, number>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const reconnectingPeersRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const speakingTimerRef = useRef<number | null>(null);
  const lastSpeakingSyncRef = useRef<boolean>(false);
  const iceConfigCacheRef = useRef<RTCConfiguration | null>(null);

  const activeSessionRef = useRef<ActiveVoiceSession | null>(null);
  const currentUserRef = useRef<PublicUser | null>(currentUser);
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const participantsRef = useRef<VoiceParticipant[]>(participants);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const cameraActiveRef = useRef(false);
  const screenShareActiveRef = useRef(false);
  const pttTransmittingRef = useRef(false);
  const voiceConfigRef = useRef<VoiceSettingsConfig>(voiceConfig || {});
  const leavingRef = useRef(false);
  const joiningKeyRef = useRef<string | null>(null);

  currentUserRef.current = currentUser;
  soundEnabledRef.current = soundEnabled;
  participantsRef.current = participants;
  mutedRef.current = muted;
  deafenedRef.current = deafened;
  cameraActiveRef.current = cameraActive;
  screenShareActiveRef.current = screenShareActive;
  pttTransmittingRef.current = pttTransmitting;
  voiceConfigRef.current = voiceConfig || {};

  const currentUid = currentUser?.uid ?? null;
  const sessionKey = getSessionKey(activeSession);

  const logPeerDiagnostics = useCallback(
    (remoteUid: string, pc: RTCPeerConnection, event: string) => {
      const senders = pc.getSenders();
      console.info('[VoiceRTC Diagnostic]', {
        event,
        peerUid: remoteUid,
        iceConnectionState: pc.iceConnectionState,
        connectionState: pc.connectionState,
        signalingState: pc.signalingState,
        localAudioTracks: getLocalAudioTrackDiagnostics(localStreamRef.current),
        senderCount: senders.length,
        senders: senders.map((sender) => ({
          kind: sender.track?.kind ?? 'none',
          enabled: sender.track?.enabled ?? false,
          muted: sender.track?.muted ?? false,
          readyState: sender.track?.readyState ?? 'ended',
        })),
      });

      void pc
        .getStats()
        .then((stats) => {
          const outboundRtp: Array<{ kind: string; bytesSent: number }> = [];
          stats.forEach((report) => {
            if (report.type !== 'outbound-rtp') return;
            const rtp = report as RTCStats & {
              kind?: string;
              mediaType?: string;
              bytesSent?: number;
            };
            outboundRtp.push({
              kind: rtp.kind ?? rtp.mediaType ?? 'unknown',
              bytesSent: rtp.bytesSent ?? 0,
            });
          });
          console.info('[VoiceRTC Diagnostic] outbound-rtp', {
            peerUid: remoteUid,
            outboundRtp,
          });
        })
        .catch((err) => {
          console.warn('[VoiceRTC Diagnostic] getStats failed:', remoteUid, err);
        });
    },
    []
  );

  const clearPeerDiagnosticsTimer = useCallback((remoteUid: string) => {
    const timer = peerDiagnosticsTimersRef.current.get(remoteUid);
    if (timer !== undefined) {
      window.clearInterval(timer);
      peerDiagnosticsTimersRef.current.delete(remoteUid);
    }
  }, []);

  const fetchIceConfiguration = async (): Promise<RTCConfiguration> => {
    if (iceConfigCacheRef.current) return iceConfigCacheRef.current;
    try {
      let res = await fetch('/api/ice-servers');
      if (!res.ok) {
        res = await fetch('/api/turn-credentials');
      }
      if (res.ok) {
        const data = (await res.json()) as { iceServers: RTCIceServer[] };
        if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          const iceServers = addTurnFallback(data.iceServers);
          iceConfigCacheRef.current = { iceServers };
          console.info('[VoiceRTC] ICE server configuration loaded:', {
            urls: iceServers.flatMap((server) =>
              Array.isArray(server.urls) ? server.urls : [server.urls]
            ),
            hasTurnServer: hasTurnServer(iceServers),
          });
          return iceConfigCacheRef.current;
        }
      }
    } catch (err) {
      console.warn('[VoiceRTC] Could not fetch dynamic ICE servers, falling back to STUN:', err);
    }
    const iceServers = addTurnFallback(DEFAULT_ICE_SERVERS.iceServers ?? []);
    iceConfigCacheRef.current = { iceServers };
    return iceConfigCacheRef.current;
  };

  const syncConnectionStatus = useCallback(() => {
    if (joiningKeyRef.current) {
      setConnectionStatus('connecting');
      return;
    }
    if (!activeSessionRef.current) {
      setConnectionStatus('idle');
      return;
    }
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline || reconnectingPeersRef.current.size > 0) {
      setConnectionStatus('reconnecting');
    } else {
      setConnectionStatus('connected');
    }
  }, []);

  const clearPeerReconnect = useCallback(
    (remoteUid: string) => {
      const timer = reconnectTimersRef.current.get(remoteUid);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        reconnectTimersRef.current.delete(remoteUid);
      }
      reconnectAttemptsRef.current.delete(remoteUid);
      if (reconnectingPeersRef.current.delete(remoteUid)) {
        syncConnectionStatus();
      }
    },
    [syncConnectionStatus]
  );

  const sendSignal = useCallback(
    async (
      session: ActiveVoiceSession,
      toUid: string,
      type: VoiceSignal['type'],
      payloadObj: unknown
    ) => {
      const me = currentUserRef.current;
      if (!me) return;
      const { signalsCol } = getVoicePaths(session);
      const sigRef = doc(signalsCol);
      try {
        await setDoc(sigRef, {
          id: sigRef.id,
          fromUid: me.uid,
          toUid,
          type,
          payload: JSON.stringify(payloadObj).slice(0, 16384),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('[VoiceRTC] Signal send error:', type, toUid, err);
      }
    },
    []
  );

  const triggerRenegotiation = useCallback(
    async (
      session: ActiveVoiceSession,
      remoteUid: string,
      pc: RTCPeerConnection,
      options?: { iceRestart?: boolean }
    ) => {
      try {
        const localStream = localStreamRef.current;
        const liveAudioTrack = localStream
          ?.getAudioTracks()
          .find((track) => track.readyState === 'live');
        if (!localStream || !liveAudioTrack) {
          console.error('[VoiceRTC] Refusing to create an offer without a live local audio track:', {
            peerUid: remoteUid,
            localAudioTracks: getLocalAudioTrackDiagnostics(localStream),
          });
          return;
        }
        addLocalStreamTracks(pc, localStream);
        makingOfferRef.current.set(remoteUid, true);
        logPeerDiagnostics(remoteUid, pc, 'before-create-offer');
        const offer = await pc.createOffer(
          options?.iceRestart ? { iceRestart: true } : undefined
        );
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          await sendSignal(session, remoteUid, 'offer', pc.localDescription.toJSON());
        }
      } catch (err) {
        console.warn('[VoiceRTC] Renegotiation error:', remoteUid, err);
      } finally {
        makingOfferRef.current.set(remoteUid, false);
      }
    },
    [logPeerDiagnostics, sendSignal]
  );

  const closePeer = useCallback(
    (remoteUid: string, reason = 'peer-closed') => {
      const timer = remoteTimersRef.current.get(remoteUid);
      if (timer) {
        window.clearInterval(timer);
        remoteTimersRef.current.delete(remoteUid);
      }
      clearPeerReconnect(remoteUid);
      clearPeerDiagnosticsTimer(remoteUid);
      makingOfferRef.current.delete(remoteUid);
      ignoreOfferRef.current.delete(remoteUid);
      setRemoteSpeaking((prev) => {
        if (!(remoteUid in prev)) return prev;
        const next = { ...prev };
        delete next[remoteUid];
        return next;
      });
      setRemoteVideoStreams((prev) => {
        if (!(remoteUid in prev)) return prev;
        const next = { ...prev };
        delete next[remoteUid];
        return next;
      });
      const pc = peersRef.current.get(remoteUid);
      if (pc) {
        console.info('[VoiceRTC Diagnostic]', {
          event: 'peer-closed',
          reason,
          peerUid: remoteUid,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState,
          signalingState: pc.signalingState,
        });
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onicegatheringstatechange = null;
        pc.onsignalingstatechange = null;
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.close();
        peersRef.current.delete(remoteUid);
      }
      const audioEl = remoteAudioElsRef.current.get(remoteUid);
      if (audioEl) {
        audioEl.srcObject = null;
        audioEl.remove();
        remoteAudioElsRef.current.delete(remoteUid);
      }
      remoteGainNodesRef.current.delete(remoteUid);
      pendingIceRef.current.delete(remoteUid);
    },
    [clearPeerDiagnosticsTimer, clearPeerReconnect]
  );

  const scheduleReconnectRef = useRef<
    (session: ActiveVoiceSession, remoteUid: string, reason: string) => void
  >(() => {});

  const createPeerConnection = useCallback(
    (session: ActiveVoiceSession, remoteUid: string): Promise<RTCPeerConnection> => {
      const existing = peersRef.current.get(remoteUid);
      if (existing && existing.connectionState !== 'closed') {
        return Promise.resolve(existing);
      }
      const pending = peerCreationsRef.current.get(remoteUid);
      if (pending) return pending;

      const creation = fetchIceConfiguration().then((baseCfg) => {
        const vpnMode = Boolean(voiceConfigRef.current.vpnCompatibilityMode);
        const iceTransportPolicy: RTCIceTransportPolicy = vpnMode ? 'relay' : 'all';

        const pc = new RTCPeerConnection({
          ...baseCfg,
          iceTransportPolicy,
        });
        peersRef.current.set(remoteUid, pc);

        if (localStreamRef.current) {
          addLocalStreamTracks(pc, localStreamRef.current);
        }

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const cType = event.candidate.type || 'unknown';
            console.info(
              `[VoiceRTC Candidate] Type: ${cType.toUpperCase()} | Protocol: ${event.candidate.protocol} | Peer: ${remoteUid}`
            );
            void sendSignal(session, remoteUid, 'candidate', event.candidate.toJSON());
          }
        };

        pc.onicegatheringstatechange = () => {
          console.info('[VoiceRTC Diagnostic]', {
            event: 'ice-gathering-state-change',
            peerUid: remoteUid,
            iceGatheringState: pc.iceGatheringState,
          });
        };

        pc.ontrack = (event) => {
          const stream = event.streams[0] ?? new MediaStream([event.track]);

          if (event.track.kind === 'audio') {
            let audioEl = remoteAudioElsRef.current.get(remoteUid);
            if (!audioEl) {
              audioEl = document.createElement('audio');
              audioEl.autoplay = true;
              audioEl.setAttribute('playsinline', '');
              audioEl.style.display = 'none';
              document.body.appendChild(audioEl);
              remoteAudioElsRef.current.set(remoteUid, audioEl);
            }
            audioEl.srcObject = stream;
            const volRatio = Math.max(
              0,
              Math.min(2, (voiceConfigRef.current.outputVolume ?? 100) / 100)
            );
            audioEl.volume = Math.min(1, volRatio);
            audioEl.muted = deafenedRef.current;

            const sinkId = voiceConfigRef.current.audioOutputId;
            if (sinkId && sinkId !== 'default') {
              const sinkEl = audioEl as HTMLAudioElement & {
                setSinkId?: (id: string) => Promise<void>;
              };
              sinkEl.setSinkId?.(sinkId).catch(() => {});
            }
            void audioEl.play().catch((err) => {
              console.warn('[VoiceRTC] Remote audio playback failed:', remoteUid, err);
            });

            if (audioCtxRef.current && !remoteTimersRef.current.has(remoteUid)) {
              try {
                const rSource = audioCtxRef.current.createMediaStreamSource(stream);
                const rAnalyser = audioCtxRef.current.createAnalyser();
                rAnalyser.fftSize = 256;
                rSource.connect(rAnalyser);

                const boostGain = audioCtxRef.current.createGain();
                boostGain.gain.value = volRatio > 1 ? volRatio - 1 : 0;
                rSource.connect(boostGain);
                boostGain.connect(audioCtxRef.current.destination);
                remoteGainNodesRef.current.set(remoteUid, boostGain);

                const rData = new Uint8Array(rAnalyser.frequencyBinCount);
                const timerId = window.setInterval(() => {
                  rAnalyser.getByteFrequencyData(rData);
                  let sum = 0;
                  for (let i = 0; i < rData.length; i++) sum += rData[i];
                  const isRemoteNow = sum / rData.length > 14;
                  setRemoteSpeaking((prev) =>
                    prev[remoteUid] === isRemoteNow ? prev : { ...prev, [remoteUid]: isRemoteNow }
                  );
                }, 140);
                remoteTimersRef.current.set(remoteUid, timerId);
              } catch {
                // Ignore remote stream analyser errors
              }
            }
          } else if (event.track.kind === 'video') {
            setRemoteVideoStreams((prev) => ({ ...prev, [remoteUid]: stream }));
          }
        };

        const handleStateTransition = (source: 'ice' | 'connection') => {
          if (leavingRef.current || peersRef.current.get(remoteUid) !== pc) return;
          const connState = pc.connectionState;
          const iceState = pc.iceConnectionState;

          logPeerDiagnostics(remoteUid, pc, `${source}-state-change`);

          if (connState === 'connected' || iceState === 'connected' || iceState === 'completed') {
            clearPeerReconnect(remoteUid);
            return;
          }

          if (connState === 'disconnected' || iceState === 'disconnected') {
            scheduleReconnectRef.current(session, remoteUid, 'ice-disconnected');
            return;
          }

          if (connState === 'failed' || iceState === 'failed' || connState === 'closed') {
            const disconnectReason =
              connState === 'closed'
                ? 'peer-connection-closed'
                : iceState === 'failed'
                ? 'ice-failed'
                : 'peer-connection-failed';

            const stillInRoom =
              Boolean(activeSessionRef.current) &&
              getSessionKey(activeSessionRef.current) === getSessionKey(session) &&
              participantsRef.current.some((p) => p.userId === remoteUid);

            if (stillInRoom) {
              scheduleReconnectRef.current(session, remoteUid, disconnectReason);
            } else {
              closePeer(remoteUid, disconnectReason);
            }
          }
        };

        pc.oniceconnectionstatechange = () => handleStateTransition('ice');
        pc.onconnectionstatechange = () => handleStateTransition('connection');
        pc.onsignalingstatechange = () =>
          logPeerDiagnostics(remoteUid, pc, 'signaling-state-change');
        logPeerDiagnostics(remoteUid, pc, 'peer-created');
        const diagnosticsTimer = window.setInterval(() => {
          if (peersRef.current.get(remoteUid) === pc) {
            logPeerDiagnostics(remoteUid, pc, 'periodic');
          }
        }, 5000);
        peerDiagnosticsTimersRef.current.set(remoteUid, diagnosticsTimer);

        window.setTimeout(() => {
          if (
            peersRef.current.get(remoteUid) === pc &&
            pc.connectionState !== 'connected' &&
            pc.connectionState !== 'failed' &&
            pc.connectionState !== 'closed'
          ) {
            console.warn(
              '[VoiceRTC Diagnostic] ICE connection timeout (8s), restarting with relay/TCP fallback',
              { peerUid: remoteUid }
            );
            scheduleReconnectRef.current(session, remoteUid, 'ice-timeout-fallback-relay');
          }
        }, 8000);

        return pc;
      });
      let trackedCreation: Promise<RTCPeerConnection>;
      trackedCreation = creation.finally(() => {
        if (peerCreationsRef.current.get(remoteUid) === trackedCreation) {
          peerCreationsRef.current.delete(remoteUid);
        }
      });
      peerCreationsRef.current.set(remoteUid, trackedCreation);
      return trackedCreation;
    },
    [clearPeerReconnect, closePeer, logPeerDiagnostics, sendSignal]
  );

  const scheduleReconnect = useCallback(
    (session: ActiveVoiceSession, remoteUid: string, reason: string) => {
      const targetKey = getSessionKey(session);
      if (leavingRef.current || !activeSessionRef.current) return;
      if (getSessionKey(activeSessionRef.current) !== targetKey) return;
      if (!participantsRef.current.some((p) => p.userId === remoteUid)) return;
      if (reconnectTimersRef.current.has(remoteUid)) return;

      const attempt = reconnectAttemptsRef.current.get(remoteUid) ?? 0;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[VoiceRTC Diagnostic] Auto-reconnect exhausted max attempts', {
          peerUid: remoteUid,
          reason,
          attempts: attempt,
        });
        reconnectingPeersRef.current.delete(remoteUid);
        syncConnectionStatus();
        return;
      }

      reconnectingPeersRef.current.add(remoteUid);
      syncConnectionStatus();

      const delayMs = RECONNECT_BACKOFF_MS[attempt] ?? 8000;
      const timerId = window.setTimeout(async () => {
        reconnectTimersRef.current.delete(remoteUid);

        if (
          leavingRef.current ||
          !activeSessionRef.current ||
          getSessionKey(activeSessionRef.current) !== targetKey ||
          !participantsRef.current.some((p) => p.userId === remoteUid)
        ) {
          reconnectingPeersRef.current.delete(remoteUid);
          syncConnectionStatus();
          return;
        }

        reconnectAttemptsRef.current.set(remoteUid, attempt + 1);
        console.info('[VoiceRTC Diagnostic] Executing auto-reconnect / ICE restart', {
          attempt: attempt + 1,
          peerUid: remoteUid,
          reason,
        });

        const me = currentUserRef.current;
        const canInitiate = Boolean(me && (me.uid < remoteUid || attempt >= 1));

        const oldPc = peersRef.current.get(remoteUid);
        clearPeerDiagnosticsTimer(remoteUid);
        if (oldPc) {
          oldPc.onconnectionstatechange = null;
          oldPc.oniceconnectionstatechange = null;
          oldPc.onicegatheringstatechange = null;
          oldPc.onsignalingstatechange = null;
          oldPc.onicecandidate = null;
          oldPc.ontrack = null;
          oldPc.close();
          peersRef.current.delete(remoteUid);
        }
        pendingIceRef.current.delete(remoteUid);
        makingOfferRef.current.delete(remoteUid);
        ignoreOfferRef.current.delete(remoteUid);

        const freshPc = await createPeerConnection(session, remoteUid);
        if (canInitiate) {
          await triggerRenegotiation(session, remoteUid, freshPc, { iceRestart: true });
        }
      }, delayMs);

      reconnectTimersRef.current.set(remoteUid, timerId);
    },
    [clearPeerDiagnosticsTimer, createPeerConnection, syncConnectionStatus, triggerRenegotiation]
  );

  scheduleReconnectRef.current = scheduleReconnect;

  const leaveVoice = useCallback(
    async (reasonInput?: unknown) => {
      const reason = typeof reasonInput === 'string' ? reasonInput : 'manual-leave';
      const session = activeSessionRef.current;
      const me = currentUserRef.current;
      const prevKey = getSessionKey(session);

      if (session || peersRef.current.size > 0 || localStreamRef.current) {
        console.info('[VoiceRTC Diagnostic]', {
          event: 'leave-voice',
          reason,
          sessionKey: prevKey,
          activePeers: peersRef.current.size,
        });
      }

      leavingRef.current = true;
      joiningKeyRef.current = null;
      activeSessionRef.current = null;

      try {
        if (speakingTimerRef.current) {
          window.clearInterval(speakingTimerRef.current);
          speakingTimerRef.current = null;
        }
        for (const timer of reconnectTimersRef.current.values()) {
          window.clearTimeout(timer);
        }
        reconnectTimersRef.current.clear();
        reconnectAttemptsRef.current.clear();
        reconnectingPeersRef.current.clear();

        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        if (videoStreamRef.current) {
          videoStreamRef.current.getTracks().forEach((t) => t.stop());
          videoStreamRef.current = null;
        }
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((t) => t.stop());
          screenStreamRef.current = null;
        }
        // NOTE: We do not stop localStream tracks permanently if we want to retain audio stream across network reconnects,
        // but on explicit leaveVoice we stop them.
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
        }
        Array.from(peersRef.current.keys()).forEach((peerUid) => closePeer(peerUid, reason));
        lastSpeakingSyncRef.current = false;

        setActiveSession(null);
        setConnectionStatus('idle');
        setParticipants([]);
        setLocalSpeaking(false);
        setRemoteSpeaking({});
        setRemoteVideoStreams({});
        setCameraActive(false);
        setScreenShareActive(false);
        setLocalVideoStream(null);
        setPinnedUserId(null);
        setVoiceError(null);

        if (session && me) {
          if (soundEnabledRef.current) {
            playChime('leave', {
              preset: voiceConfigRef.current.soundPreset || 'classic',
              volume: voiceConfigRef.current.soundVolume ?? 80,
            });
          }
          try {
            const { participantDoc } = getVoicePaths(session);
            await deleteDoc(participantDoc(me.uid));
          } catch (err) {
            console.warn('[VoiceRTC] Failed removing voiceParticipant doc on leave:', err);
          }
        }
      } finally {
        leavingRef.current = false;
      }
    },
    [closePeer]
  );

  const joinVoice = useCallback(
    async (session: ActiveVoiceSession) => {
      const me = currentUserRef.current;
      if (!me) return;
      const nextKey = getSessionKey(session);
      if (getSessionKey(activeSessionRef.current) === nextKey || joiningKeyRef.current === nextKey) {
        return;
      }

      await leaveVoice('switching-session');
      joiningKeyRef.current = nextKey;
      setConnectionStatus('connecting');
      setVoiceError(null);

      try {
        const cfg = voiceConfigRef.current;
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: cfg.echoCancellation ?? true,
              noiseSuppression: cfg.noiseSuppression ?? true,
              autoGainControl: cfg.autoGainControl ?? true,
              ...(cfg.audioInputId && cfg.audioInputId !== 'default'
                ? { deviceId: { ideal: cfg.audioInputId } }
                : {}),
            },
          });
        } catch (mediaErr) {
          const errName = mediaErr instanceof Error ? mediaErr.name : '';
          let friendlyMsg = 'Microphone permission denied or unavailable.';
          if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
            friendlyMsg = 'Microphone permission denied (NotAllowedError). Please allow microphone access in your browser settings.';
          } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
            friendlyMsg = 'No microphone device found (NotFoundError). Please connect a microphone.';
          } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
            friendlyMsg = 'Microphone is busy or locked by another application (NotReadableError).';
          } else if (errName === 'OverconstrainedError') {
            friendlyMsg = 'Requested microphone constraints cannot be satisfied (OverconstrainedError).';
          }
          console.error('[VoiceRTC getUserMedia Error]:', errName, mediaErr);
          setVoiceError(friendlyMsg);
          joiningKeyRef.current = null;
          setConnectionStatus('idle');
          return;
        }

        if (joiningKeyRef.current !== nextKey) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        const canTransmitInitially =
          !mutedRef.current &&
          !deafenedRef.current &&
          (!cfg.pushToTalkEnabled || pttTransmittingRef.current);
        stream.getAudioTracks().forEach((track) => {
          track.enabled = canTransmitInitially;
        });
        console.info('[VoiceRTC Diagnostic]', {
          event: 'local-microphone-captured',
          localAudioTracks: getLocalAudioTrackDiagnostics(stream),
        });

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);

          speakingTimerRef.current = window.setInterval(() => {
            const currentSession = activeSessionRef.current;
            const liveUser = currentUserRef.current;
            if (!currentSession || !liveUser || leavingRef.current) return;
            const { participantDoc } = getVoicePaths(currentSession);
            const liveCfg = voiceConfigRef.current;

            const isSuppressed =
              mutedRef.current ||
              deafenedRef.current ||
              (Boolean(liveCfg.pushToTalkEnabled) && !pttTransmittingRef.current);

            if (isSuppressed) {
              if (lastSpeakingSyncRef.current) {
                lastSpeakingSyncRef.current = false;
                setLocalSpeaking(false);
                updateDoc(participantDoc(liveUser.uid), {
                  speaking: false,
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              }
              return;
            }
            analyser.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            const avg = sum / data.length;
            const threshold =
              liveCfg.voiceSensitivityAuto !== false
                ? 16
                : Math.max(
                    4,
                    Math.min(60, Math.round(((100 - (liveCfg.voiceSensitivityThreshold ?? 40)) / 100) * 50))
                  );
            const isSpeakingNow = avg > threshold;
            setLocalSpeaking(isSpeakingNow);
            if (isSpeakingNow !== lastSpeakingSyncRef.current) {
              lastSpeakingSyncRef.current = isSpeakingNow;
              updateDoc(participantDoc(liveUser.uid), {
                speaking: isSpeakingNow,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          }, 220);
        }

        const { participantDoc } = getVoicePaths(session);
        const myParticipantRef = participantDoc(me.uid);
        const existingSnap = await getDoc(myParticipantRef).catch(() => null);
        if (existingSnap?.exists()) {
          await deleteDoc(myParticipantRef).catch(() => {});
        }

        await setDoc(myParticipantRef, {
          userId: me.uid,
          displayName: me.displayName || 'User',
          avatarUrl: me.avatarUrl || '',
          muted: mutedRef.current,
          deafened: deafenedRef.current,
          speaking: false,
          hasCamera: false,
          hasScreenShare: false,
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        activeSessionRef.current = session;
        joiningKeyRef.current = null;
        setActiveSession(session);
        setConnectionStatus(
          typeof navigator !== 'undefined' && !navigator.onLine ? 'reconnecting' : 'connected'
        );
        console.info('[VoiceRTC] Joined voice session successfully', { sessionKey: nextKey, uid: me.uid });

        if (soundEnabledRef.current) {
          playChime('join', {
            preset: cfg.soundPreset || 'classic',
            volume: cfg.soundVolume ?? 80,
          });
        }

        if (session.kind === 'call' && session.callType === 'video') {
          try {
            const vStream = await navigator.mediaDevices.getUserMedia({
              video: getCameraConstraints(cfg.cameraQuality, cfg.videoInputId),
            });
            videoStreamRef.current = vStream;
            const vTrack = vStream.getVideoTracks()[0];
            localStreamRef.current.addTrack(vTrack);
            setCameraActive(true);
            setLocalVideoStream(vStream);
            updateDoc(myParticipantRef, {
              hasCamera: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          } catch {
            // Video camera optional fallback
          }
        }
      } catch (err) {
        joiningKeyRef.current = null;
        const msg =
          err instanceof Error ? err.message : 'Microphone permission denied or unavailable.';
        console.warn('[VoiceRTC] Failed to join voice session:', msg, err);
        setVoiceError(msg);
        await leaveVoice('join-failed');
      }
    },
    [leaveVoice]
  );

  const toggleCamera = useCallback(async () => {
    const session = activeSessionRef.current;
    const me = currentUserRef.current;
    if (!session || !me) return;
    const { participantDoc } = getVoicePaths(session);

    if (cameraActiveRef.current) {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
      }
      setCameraActive(false);
      setLocalVideoStream(screenStreamRef.current);

      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          t.stop();
          localStreamRef.current?.removeTrack(t);
        });
      }

      for (const [remoteUid, pc] of peersRef.current.entries()) {
        const senders = pc.getSenders();
        for (const sender of senders) {
          if (sender.track?.kind === 'video') {
            pc.removeTrack(sender);
          }
        }
        void triggerRenegotiation(session, remoteUid, pc);
      }

      await updateDoc(participantDoc(me.uid), {
        hasCamera: false,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } else {
      try {
        const cfg = voiceConfigRef.current;
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: getCameraConstraints(cfg.cameraQuality, cfg.videoInputId),
        });
        videoStreamRef.current = vStream;
        const videoTrack = vStream.getVideoTracks()[0];

        if (localStreamRef.current) {
          localStreamRef.current.addTrack(videoTrack);
        } else {
          localStreamRef.current = vStream;
        }

        setCameraActive(true);
        setLocalVideoStream(vStream);

        for (const [remoteUid, pc] of peersRef.current.entries()) {
          const sender = pc.addTrack(videoTrack, localStreamRef.current!);
          applyMaxBitrate(sender, 1500000);
          void triggerRenegotiation(session, remoteUid, pc);
        }

        await updateDoc(participantDoc(me.uid), {
          hasCamera: true,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : 'Could not access camera.');
      }
    }
  }, [triggerRenegotiation]);

  const toggleScreenShare = useCallback(async () => {
    const session = activeSessionRef.current;
    const me = currentUserRef.current;
    if (!session || !me) return;
    const { participantDoc } = getVoicePaths(session);

    if (screenShareActiveRef.current) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setScreenShareActive(false);
      setLocalVideoStream(videoStreamRef.current);

      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          t.stop();
          localStreamRef.current?.removeTrack(t);
        });
      }

      for (const [remoteUid, pc] of peersRef.current.entries()) {
        const senders = pc.getSenders();
        for (const sender of senders) {
          if (sender.track?.kind === 'video') {
            pc.removeTrack(sender);
          }
        }
        void triggerRenegotiation(session, remoteUid, pc);
      }

      await updateDoc(participantDoc(me.uid), {
        hasScreenShare: false,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } else {
      const someoneElseSharing = participantsRef.current.some(
        (p) => p.hasScreenShare && p.userId !== me.uid
      );
      if (someoneElseSharing) {
        setVoiceError('Another user is already sharing their screen in this channel.');
        return;
      }

      try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: 30 },
          audio: true,
        });
        screenStreamRef.current = sStream;
        const screenTrack = sStream.getVideoTracks()[0];

        screenTrack.onended = () => {
          void toggleScreenShare();
        };

        if (localStreamRef.current) {
          localStreamRef.current.addTrack(screenTrack);
        } else {
          localStreamRef.current = sStream;
        }

        setScreenShareActive(true);
        setLocalVideoStream(sStream);

        for (const [remoteUid, pc] of peersRef.current.entries()) {
          const sender = pc.addTrack(screenTrack, localStreamRef.current!);
          applyMaxBitrate(sender, 3000000);
          void triggerRenegotiation(session, remoteUid, pc);
        }

        await updateDoc(participantDoc(me.uid), {
          hasScreenShare: true,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : 'Could not start screen sharing.');
      }
    }
  }, [triggerRenegotiation]);

  // Sync voice participants & WebRTC signaling strictly keyed by (sessionKey, currentUid)
  useEffect(() => {
    const session = activeSessionRef.current;
    if (!sessionKey || !session || !currentUid) return;
    const { participantsCol, signalsCol } = getVoicePaths(session);
    const applyPendingIceCandidates = async (pc: RTCPeerConnection, remoteUid: string) => {
      const queued = pendingIceRef.current.get(remoteUid) || [];
      pendingIceRef.current.delete(remoteUid);
      if (queued.length > 0) {
        console.info('[VoiceRTC Diagnostic] Applying queued ICE candidates:', {
          peerUid: remoteUid,
          count: queued.length,
        });
      }
      for (const candidate of queued) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const unsubParticipants = onSnapshot(
      participantsCol,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as VoiceParticipant);
        participantsRef.current = list;
        setParticipants(list);

        const activeUids = new Set(list.map((p) => p.userId));
        for (const existingUid of peersRef.current.keys()) {
          if (!activeUids.has(existingUid)) {
            closePeer(existingUid, 'remote-participant-left');
          }
        }

        for (const p of list) {
          if (p.userId === currentUid) continue;
          if (!peersRef.current.has(p.userId) && currentUid < p.userId) {
            void createPeerConnection(session, p.userId).then((pc) => {
              void triggerRenegotiation(session, p.userId, pc);
            });
          }
        }
      },
      (err) => {
        console.warn('[VoiceRTC] Participants listener error:', err);
      }
    );

    const signalsQ = query(signalsCol, where('toUid', '==', currentUid));

    const unsubSignals = onSnapshot(
      signalsQ,
      (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type !== 'added') return;
          const sig = change.doc.data() as VoiceSignal;
          try {
            const data = JSON.parse(sig.payload);
            const pc = await createPeerConnection(session, sig.fromUid);
            const polite = currentUid > sig.fromUid;

            if (sig.type === 'offer') {
              const offerCollision =
                Boolean(makingOfferRef.current.get(sig.fromUid)) ||
                pc.signalingState !== 'stable';
              const ignoreOffer = !polite && offerCollision;
              ignoreOfferRef.current.set(sig.fromUid, ignoreOffer);
              if (ignoreOffer) {
                return;
              }

              await pc.setRemoteDescription(new RTCSessionDescription(data));
              await applyPendingIceCandidates(pc, sig.fromUid);

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (pc.localDescription) {
                await sendSignal(session, sig.fromUid, 'answer', pc.localDescription.toJSON());
              }
            } else if (sig.type === 'answer') {
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                await applyPendingIceCandidates(pc, sig.fromUid);
              }
            } else if (sig.type === 'candidate') {
              if (ignoreOfferRef.current.get(sig.fromUid)) {
                return;
              }
              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(data));
                console.info('[VoiceRTC Diagnostic] Added ICE candidate:', sig.fromUid);
              } else {
                const list = pendingIceRef.current.get(sig.fromUid) || [];
                list.push(data);
                pendingIceRef.current.set(sig.fromUid, list);
                console.info('[VoiceRTC Diagnostic] Queued ICE candidate before remote description:', {
                  peerUid: sig.fromUid,
                  queuedCount: list.length,
                });
              }
            }
          } catch (err) {
            if (!ignoreOfferRef.current.get(sig.fromUid)) {
              console.warn('[VoiceRTC] Signal processing error:', sig.type, err);
            }
          } finally {
            deleteDoc(change.doc.ref).catch(() => {});
          }
        });
      },
      (err) => {
        console.warn('[VoiceRTC] Signaling listener error:', err);
      }
    );

    return () => {
      unsubParticipants();
      unsubSignals();
    };
  }, [sessionKey, currentUid, closePeer, createPeerConnection, sendSignal, triggerRenegotiation]);

  // Network & Device change event handlers
  useEffect(() => {
    const session = activeSessionRef.current;
    if (!sessionKey || !session) return;

    const handleOffline = () => {
      setConnectionStatus('reconnecting');
    };

    const handleOnline = async () => {
      const liveSession = activeSessionRef.current;
      const me = currentUserRef.current;
      if (!liveSession || !me || leavingRef.current) return;

      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      try {
        const { participantDoc } = getVoicePaths(liveSession);
        const myRef = participantDoc(me.uid);
        await updateDoc(myRef, {
          muted: mutedRef.current,
          deafened: deafenedRef.current,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } catch {
        // Ignore
      }

      for (const [peerUid, pc] of peersRef.current.entries()) {
        if (
          pc.connectionState !== 'connected' ||
          (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed')
        ) {
          reconnectAttemptsRef.current.delete(peerUid);
          scheduleReconnect(liveSession, peerUid, 'network-restored');
        }
      }
    };

    const handleDeviceChange = async () => {
      const cfg = voiceConfigRef.current;
      if (!localStreamRef.current || !cfg.audioInputId || cfg.audioInputId === 'default') return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const exists = devices.some(
          (d) => d.kind === 'audioinput' && d.deviceId === cfg.audioInputId
        );
        if (!exists) return;

        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: cfg.audioInputId } },
        });
        const newTrack = newStream.getAudioTracks()[0];
        if (!newTrack) return;

        const oldTrack = localStreamRef.current.getAudioTracks()[0];
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStreamRef.current.addTrack(newTrack);

        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) {
            await sender.replaceTrack(newTrack);
          }
        }
      } catch (err) {
        console.warn('[VoiceRTC] Device change track switch error:', err);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [sessionKey, scheduleReconnect]);

  const toggleMute = useCallback(async () => {
    const nextMuted = !mutedRef.current;
    setMuted(nextMuted);
    if (soundEnabledRef.current) {
      playChime('mute', {
        preset: voiceConfigRef.current.soundPreset || 'classic',
        volume: voiceConfigRef.current.soundVolume ?? 80,
      });
    }
    if (localStreamRef.current) {
      const pttBlocked =
        Boolean(voiceConfigRef.current.pushToTalkEnabled) && !pttTransmittingRef.current;
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted && !deafenedRef.current && !pttBlocked;
      });
    }
    const session = activeSessionRef.current;
    const me = currentUserRef.current;
    if (session && me) {
      const { participantDoc } = getVoicePaths(session);
      await updateDoc(participantDoc(me.uid), {
        muted: nextMuted,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }, []);

  const toggleDeafen = useCallback(async () => {
    const nextDeafened = !deafenedRef.current;
    setDeafened(nextDeafened);
    if (soundEnabledRef.current) {
      playChime('mute', {
        preset: voiceConfigRef.current.soundPreset || 'classic',
        volume: voiceConfigRef.current.soundVolume ?? 80,
      });
    }
    for (const audioEl of remoteAudioElsRef.current.values()) {
      audioEl.muted = nextDeafened;
    }
    if (localStreamRef.current) {
      const pttBlocked =
        Boolean(voiceConfigRef.current.pushToTalkEnabled) && !pttTransmittingRef.current;
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !mutedRef.current && !nextDeafened && !pttBlocked;
      });
    }
    const session = activeSessionRef.current;
    const me = currentUserRef.current;
    if (session && me) {
      const { participantDoc } = getVoicePaths(session);
      await updateDoc(participantDoc(me.uid), {
        deafened: nextDeafened,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const volRatio = Math.max(0, Math.min(2, (voiceConfig?.outputVolume ?? 100) / 100));
    for (const audioEl of remoteAudioElsRef.current.values()) {
      audioEl.volume = Math.min(1, volRatio);
      if (voiceConfig?.audioOutputId && voiceConfig.audioOutputId !== 'default') {
        const sinkEl = audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
        sinkEl.setSinkId?.(voiceConfig.audioOutputId).catch(() => {});
      }
    }
    for (const gainNode of remoteGainNodesRef.current.values()) {
      gainNode.gain.value = volRatio > 1 ? volRatio - 1 : 0;
    }
  }, [voiceConfig?.outputVolume, voiceConfig?.audioOutputId]);

  useEffect(() => {
    const enabled = Boolean(voiceConfig?.pushToTalkEnabled);
    const pttKey = voiceConfig?.pushToTalkKey || 'Space';

    const syncTracks = (transmitting: boolean) => {
      if (!localStreamRef.current) return;
      const shouldEnable =
        !mutedRef.current && !deafenedRef.current && (!enabled || transmitting);
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = shouldEnable;
      });
    };

    if (!enabled || !sessionKey) {
      setPttTransmitting(false);
      syncTracks(true);
      return;
    }

    syncTracks(false);

    const isInputFocused = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      if (matchesShortcutEvent(e, pttKey)) {
        if (!pttTransmittingRef.current) {
          setPttTransmitting(true);
          syncTracks(true);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (matchesShortcutEvent(e, pttKey)) {
        setPttTransmitting(false);
        syncTracks(false);
      }
    };

    const onBlur = () => {
      setPttTransmitting(false);
      syncTracks(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [sessionKey, voiceConfig?.pushToTalkEnabled, voiceConfig?.pushToTalkKey]);

  const getVoiceDiagnostics = useCallback(async (): Promise<VoiceDiagnosticPeer[]> => {
    const results: VoiceDiagnosticPeer[] = [];
    for (const [peerUid, pc] of peersRef.current.entries()) {
      let localCandidateType = '—';
      let remoteCandidateType = '—';
      let rttMs: number | null = null;
      let packetsLost = 0;
      let bytesReceived = 0;
      let codec = '—';

      try {
        const stats = await pc.getStats();
        let selectedPairId: string | null = null;
        const candidates = new Map<string, { candidateType?: string }>();
        const codecs = new Map<string, string>();

        stats.forEach((report) => {
          if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
            candidates.set(report.id, report as { candidateType?: string });
          } else if (report.type === 'codec') {
            codecs.set(report.id, (report as { mimeType?: string }).mimeType || 'opus');
          } else if (report.type === 'transport') {
            selectedPairId =
              (report as { selectedCandidatePairId?: string }).selectedCandidatePairId || null;
          } else if (
            report.type === 'inbound-rtp' &&
            (report as { kind?: string }).kind === 'audio'
          ) {
            packetsLost += (report as { packetsLost?: number }).packetsLost || 0;
            bytesReceived += (report as { bytesReceived?: number }).bytesReceived || 0;
            const codecId = (report as { codecId?: string }).codecId;
            if (codecId && codecs.has(codecId)) {
              codec = codecs.get(codecId) || codec;
            }
          }
        });

        stats.forEach((report) => {
          if (report.type === 'candidate-pair') {
            const pair = report as {
              id: string;
              state?: string;
              localCandidateId?: string;
              remoteCandidateId?: string;
              currentRoundTripTime?: number;
            };
            if (pair.id === selectedPairId || pair.state === 'succeeded') {
              if (pair.localCandidateId && candidates.has(pair.localCandidateId)) {
                localCandidateType = candidates.get(pair.localCandidateId)?.candidateType || '—';
              }
              if (pair.remoteCandidateId && candidates.has(pair.remoteCandidateId)) {
                remoteCandidateType = candidates.get(pair.remoteCandidateId)?.candidateType || '—';
              }
              if (typeof pair.currentRoundTripTime === 'number') {
                rttMs = Math.round(pair.currentRoundTripTime * 1000);
              }
            }
          }
        });
      } catch {
        // Ignore stats fetch error
      }

      results.push({
        peerUid,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        localCandidateType,
        remoteCandidateType,
        rttMs,
        packetsLost,
        bytesReceived,
        codec,
      });
    }
    return results;
  }, []);

  const leaveVoiceRef = useRef(leaveVoice);
  leaveVoiceRef.current = leaveVoice;

  useEffect(() => {
    const handleUnload = () => {
      if (activeSessionRef.current) {
        void leaveVoiceRef.current('page-unload');
      }
    };
    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
      if (activeSessionRef.current) {
        void leaveVoiceRef.current('workspace-unmount');
      }
    };
  }, []);

  return useMemo(
    () => ({
      activeSession,
      connectionStatus,
      participants,
      muted,
      deafened,
      localSpeaking,
      remoteSpeaking,
      voiceError,
      cameraActive,
      screenShareActive,
      localVideoStream,
      remoteVideoStreams,
      pinnedUserId,
      pttTransmitting,
      setPinnedUserId,
      joinVoice,
      leaveVoice,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
      getVoiceDiagnostics,
    }),
    [
      activeSession,
      connectionStatus,
      participants,
      muted,
      deafened,
      localSpeaking,
      remoteSpeaking,
      voiceError,
      cameraActive,
      screenShareActive,
      localVideoStream,
      remoteVideoStreams,
      pinnedUserId,
      pttTransmitting,
      joinVoice,
      leaveVoice,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
      getVoiceDiagnostics,
    ]
  );
}
