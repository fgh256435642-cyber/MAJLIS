import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Camera,
  Headphones,
  Loader2,
  Mic,
  RefreshCw,
  Video,
  VideoOff,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useUserSettings } from '../../hooks/useUserSettings';
import {
  runStunDiagnosticProbe,
  type VoiceDiagnosticPeer,
} from '../../hooks/useVoiceRTC';
import { t } from '../../i18n/translations';
import type { CameraQuality } from '../../types/majlis';

interface DeviceOption {
  deviceId: string;
  label: string;
}

export function VoiceVideoSection({
  voiceActive,
  getVoiceDiagnostics,
}: {
  voiceActive: boolean;
  getVoiceDiagnostics: () => Promise<VoiceDiagnosticPeer[]>;
}) {
  const { language } = useAuth();
  const { settings, updateSetting } = useUserSettings();
  const { pushToast } = useToast();

  const [audioInputs, setAudioInputs] = useState<DeviceOption[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceOption[]>([]);
  const [videoInputs, setVideoInputs] = useState<DeviceOption[]>([]);
  const [sinkIdSupported] = useState<boolean>(
    () =>
      typeof HTMLMediaElement !== 'undefined' &&
      'setSinkId' in HTMLMediaElement.prototype
  );

  // Live mic test state
  const [micTesting, setMicTesting] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);
  const micBarRef = useRef<HTMLDivElement | null>(null);
  const thresholdMarkerRef = useRef<HTMLDivElement | null>(null);

  // Live camera preview state
  const [camPreviewing, setCamPreviewing] = useState(false);
  const camStreamRef = useRef<MediaStream | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);

  // PTT keybind recording state
  const [capturingPtt, setCapturingPtt] = useState(false);

  // WebRTC diagnostics state
  const [runningDiag, setRunningDiag] = useState(false);
  const [stunResult, setStunResult] = useState<Awaited<
    ReturnType<typeof runStunDiagnosticProbe>
  > | null>(null);
  const [activePeerStats, setActivePeerStats] = useState<VoiceDiagnosticPeer[]>([]);

  const enumerateAllDevices = useCallback(async (requestPerm = false) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    try {
      if (requestPerm) {
        const temp = await navigator.mediaDevices
          .getUserMedia({ audio: true, video: true })
          .catch(() => navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null));
        temp?.getTracks().forEach((tr) => tr.stop());
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(
        list
          .filter((d) => d.kind === 'audioinput')
          .map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${idx + 1}`,
          }))
      );
      setAudioOutputs(
        list
          .filter((d) => d.kind === 'audiooutput')
          .map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${idx + 1}`,
          }))
      );
      setVideoInputs(
        list
          .filter((d) => d.kind === 'videoinput')
          .map((d, idx) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${idx + 1}`,
          }))
      );
    } catch {
      // Ignore permission decline
    }
  }, []);

  useEffect(() => {
    void enumerateAllDevices(false);
  }, [enumerateAllDevices]);

  // Keep threshold marker positioned via DOM ref (no inline JSX style)
  useEffect(() => {
    if (thresholdMarkerRef.current) {
      thresholdMarkerRef.current.style.insetInlineStart = `${settings.voiceSensitivityThreshold}%`;
    }
  }, [settings.voiceSensitivityThreshold]);

  const stopMicTest = useCallback(() => {
    if (micRafRef.current !== null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    micStreamRef.current = null;
    if (micCtxRef.current && micCtxRef.current.state !== 'closed') {
      void micCtxRef.current.close().catch(() => {});
    }
    micCtxRef.current = null;
    if (micBarRef.current) {
      micBarRef.current.style.width = '0%';
    }
    setMicTesting(false);
  }, []);

  const startMicTest = async () => {
    if (micTesting) {
      stopMicTest();
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId:
              settings.audioInputId && settings.audioInputId !== 'default'
                ? { ideal: settings.audioInputId }
                : undefined,
            noiseSuppression: settings.noiseSuppression,
            echoCancellation: settings.echoCancellation,
            autoGainControl: settings.autoGainControl,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      micStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      micCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      setMicTesting(true);
      void enumerateAllDevices(false);

      const loop = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        const avg = sum / data.length;
        const pct = Math.min(100, Math.round((avg / 90) * 100));
        if (micBarRef.current) {
          micBarRef.current.style.width = `${pct}%`;
        }
        micRafRef.current = requestAnimationFrame(loop);
      };
      micRafRef.current = requestAnimationFrame(loop);
    } catch {
      pushToast({ type: 'error', title: t(language, 'micPermissionError') });
    }
  };

  const stopCamPreview = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    camStreamRef.current = null;
    if (camVideoRef.current) {
      camVideoRef.current.srcObject = null;
    }
    setCamPreviewing(false);
  }, []);

  const toggleCamPreview = async () => {
    if (camPreviewing) {
      stopCamPreview();
      return;
    }
    const resMap: Record<CameraQuality, { width: number; height: number }> = {
      '480p': { width: 854, height: 480 },
      '720p': { width: 1280, height: 720 },
      '1080p': { width: 1920, height: 1080 },
    };
    const dims = resMap[settings.cameraQuality] || resMap['720p'];
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId:
              settings.videoInputId && settings.videoInputId !== 'default'
                ? { ideal: settings.videoInputId }
                : undefined,
            width: { ideal: dims.width },
            height: { ideal: dims.height },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      camStreamRef.current = stream;
      setCamPreviewing(true);
      void enumerateAllDevices(false);
    } catch {
      pushToast({ type: 'error', title: t(language, 'cameraPermissionError') });
    }
  };

  useEffect(() => {
    if (camPreviewing && camVideoRef.current && camStreamRef.current) {
      camVideoRef.current.srcObject = camStreamRef.current;
    }
  }, [camPreviewing]);

  useEffect(() => {
    return () => {
      stopMicTest();
      stopCamPreview();
    };
  }, [stopMicTest, stopCamPreview]);

  useEffect(() => {
    if (!capturingPtt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        setCapturingPtt(false);
        return;
      }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }
      const nextCode = (e.code || e.key || 'Space').slice(0, 32);
      void updateSetting({ pushToTalkKey: nextCode });
      setCapturingPtt(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturingPtt, updateSetting]);

  const handleRunDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const [stun, peers] = await Promise.all([
        runStunDiagnosticProbe(),
        voiceActive ? getVoiceDiagnostics() : Promise.resolve([]),
      ]);
      setStunResult(stun);
      setActivePeerStats(peers);
    } finally {
      setRunningDiag(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-link font-bold text-text dark:text-text">
            {t(language, 'voiceAndVideo')}
          </h2>
          <p className="text-link text-text-muted dark:text-text-muted mt-1">
            {t(language, 'voiceAndVideoSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void enumerateAllDevices(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated hover:bg-elevated dark:hover:bg-elevated text-link font-semibold"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{t(language, 'refreshDevices')}</span>
        </button>
      </div>

      {/* Audio Input & Output Devices */}
      <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-link font-semibold text-text dark:text-text mb-1.5">
              {t(language, 'inputDevice')}
            </label>
            <select
              value={settings.audioInputId}
              onChange={(e) => void updateSetting({ audioInputId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
            >
              <option value="default">{t(language, 'defaultDevice')}</option>
              {settings.audioInputId !== 'default' &&
                !audioInputs.some((d) => d.deviceId === settings.audioInputId) && (
                  <option value={settings.audioInputId}>
                    {settings.audioInputId.slice(0, 16)}
                  </option>
                )}
              {audioInputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-link font-semibold text-text dark:text-text mb-1.5">
              {t(language, 'outputDevice')}
            </label>
            <select
              value={settings.audioOutputId}
              disabled={!sinkIdSupported}
              onChange={(e) => void updateSetting({ audioOutputId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link disabled:opacity-60"
            >
              <option value="default">{t(language, 'defaultDevice')}</option>
              {settings.audioOutputId !== 'default' &&
                !audioOutputs.some((d) => d.deviceId === settings.audioOutputId) && (
                  <option value={settings.audioOutputId}>
                    {settings.audioOutputId.slice(0, 16)}
                  </option>
                )}
              {audioOutputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
            {!sinkIdSupported && (
              <p className="text-[11px] text-text-muted mt-1">
                {t(language, 'outputDeviceUnsupported')}
              </p>
            )}
          </div>
        </div>

        {/* Output Volume 0 - 200% */}
        <div className="space-y-1.5 pt-2 border-accent border-border dark:border-border">
          <div className="flex items-center justify-between text-link">
            <span className="font-semibold text-text dark:text-text flex items-center gap-1.5">
              <Headphones className="w-3.5 h-3.5 text-link" />
              <span>{t(language, 'outputVolume')}</span>
            </span>
            <span className="font-mono font-semibold text-link tabular-nums">
              {settings.outputVolume}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={settings.outputVolume}
            onChange={(e) =>
              void updateSetting({ outputVolume: Number(e.target.value) }, { silent: true })
            }
            className="w-full accent-accent"
          />
        </div>

        {/* Live Mic Test Meter */}
        <div className="space-y-2.5 pt-2 border-accent border-border dark:border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="text-link font-semibold text-text dark:text-text flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-link" />
              <span>{t(language, 'micTestLabel')}</span>
            </div>
            <button
              type="button"
              onClick={() => void startMicTest()}
              className={`px-3.5 py-1.5 rounded-lg text-link font-semibold transition-colors ${
                micTesting
                  ? 'bg-danger hover:bg-danger text-text'
                  : 'bg-accent hover:bg-majlis-hover text-text'
              }`}
            >
              {micTesting ? t(language, 'stopTest') : t(language, 'letsCheckMic')}
            </button>
          </div>
          <div className="relative h-3 rounded-full bg-hover dark:bg-hover overflow-hidden">
            <div
              ref={micBarRef}
              className="h-full w-0 bg-success transition-[width] duration-75"
            />
            {!settings.voiceSensitivityAuto && (
              <div
                ref={thresholdMarkerRef}
                className="absolute top-0 bottom-0 w-0.5 bg-warning"
              />
            )}
          </div>
        </div>

        {/* Voice Sensitivity */}
        <div className="space-y-2 pt-2 border-accent border-border dark:border-border">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-link font-medium text-text dark:text-text">
                {t(language, 'autoSensitivity')}
              </div>
              <div className="text-link text-text-muted dark:text-text-muted">
                {t(language, 'autoSensitivityDesc')}
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.voiceSensitivityAuto}
              onChange={(e) => void updateSetting({ voiceSensitivityAuto: e.target.checked })}
              className="w-4 h-4 accent-accent"
            />
          </label>
          {!settings.voiceSensitivityAuto && (
            <div className="flex items-center gap-3">
              <span className="text-link text-text-muted">{t(language, 'sensitivityThreshold')}</span>
              <input
                type="range"
                min={5}
                max={95}
                step={1}
                value={settings.voiceSensitivityThreshold}
                onChange={(e) =>
                  void updateSetting(
                    { voiceSensitivityThreshold: Number(e.target.value) },
                    { silent: true }
                  )
                }
                className="flex-1 accent-accent"
              />
              <span className="text-link font-mono tabular-nums w-10 text-link">
                {settings.voiceSensitivityThreshold}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Audio Processing & Push-to-Talk */}
      <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-3">
        <div className="text-link font-bold uppercase tracking-wider text-text-muted dark:text-text-muted">
          {t(language, 'voiceProcessing')}
        </div>
        {(
          [
            ['noiseSuppression', t(language, 'noiseSuppression')],
            ['echoCancellation', t(language, 'echoCancellation')],
            ['autoGainControl', t(language, 'autoGainControl')],
          ] as const
        ).map(([field, label]) => (
          <label
            key={field}
            className="flex items-center justify-between p-2.5 rounded-xl bg-elevated dark:bg-elevated cursor-pointer"
          >
            <span className="text-link font-medium">{label}</span>
            <input
              type="checkbox"
              checked={settings[field]}
              onChange={(e) => void updateSetting({ [field]: e.target.checked })}
              className="w-4 h-4 accent-accent"
            />
          </label>
        ))}

        <div className="pt-2 border-accent border-border dark:border-border flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.pushToTalkEnabled}
              onChange={(e) => void updateSetting({ pushToTalkEnabled: e.target.checked })}
              className="w-4 h-4 accent-accent"
            />
            <div>
              <div className="text-link font-semibold text-text dark:text-text">
                {t(language, 'pushToTalk')}
              </div>
              <div className="text-link text-text-muted dark:text-text-muted">
                {t(language, 'pushToTalkDesc')}
              </div>
            </div>
          </label>
          <button
            type="button"
            onClick={() => setCapturingPtt(true)}
            className={`px-3 py-1.5 rounded-lg border text-link font-mono font-semibold transition-colors ${
              capturingPtt
                ? 'border-danger bg-danger/15 text-danger animate-pulse'
                : 'border-border dark:border-border bg-elevated dark:bg-elevated'
            }`}
          >
            {capturingPtt ? t(language, 'pressAnyKey') : settings.pushToTalkKey}
          </button>
        </div>

        {/* VPN Compatibility Mode (Relay TCP/TLS) */}
        <div className="pt-3 border-accent border-border dark:border-border flex items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 cursor-pointer flex-1">
            <input
              type="checkbox"
              checked={Boolean(settings.vpnCompatibilityMode)}
              onChange={(e) => void updateSetting({ vpnCompatibilityMode: e.target.checked })}
              className="w-4 h-4 accent-accent"
            />
            <div>
              <div className="text-link font-semibold text-text dark:text-text">
                {t(language, 'vpnCompatibilityMode')}
              </div>
              <div className="text-link text-text-muted dark:text-text-muted">
                {t(language, 'vpnCompatibilityModeDesc')}
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Camera & Video Quality */}
      <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-link font-bold text-text dark:text-text flex items-center gap-2">
            <Camera className="w-4 h-4 text-link" />
            <span>{t(language, 'cameraSettings')}</span>
          </div>
          <button
            type="button"
            onClick={() => void toggleCamPreview()}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-link font-semibold transition-colors ${
              camPreviewing
                ? 'bg-danger hover:bg-danger text-text'
                : 'bg-accent hover:bg-majlis-hover text-text'
            }`}
          >
            {camPreviewing ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            <span>{camPreviewing ? t(language, 'stopCameraPreview') : t(language, 'testCamera')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-link font-semibold text-text dark:text-text mb-1.5">
              {t(language, 'cameraDevice')}
            </label>
            <select
              value={settings.videoInputId}
              onChange={(e) => void updateSetting({ videoInputId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
            >
              <option value="default">{t(language, 'defaultDevice')}</option>
              {settings.videoInputId !== 'default' &&
                !videoInputs.some((d) => d.deviceId === settings.videoInputId) && (
                  <option value={settings.videoInputId}>
                    {settings.videoInputId.slice(0, 16)}
                  </option>
                )}
              {videoInputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-link font-semibold text-text dark:text-text mb-1.5">
              {t(language, 'cameraQuality')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['480p', '720p', '1080p'] as CameraQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void updateSetting({ cameraQuality: q })}
                  className={`py-2 rounded-lg text-link font-semibold border transition-colors ${
                    settings.cameraQuality === q
                      ? 'border-accent bg-accent text-text'
                      : 'border-border dark:border-border hover:bg-elevated dark:hover:bg-elevated'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {camPreviewing && (
          <div className="rounded-xl overflow-hidden bg-rail aspect-video max-h-64 mx-auto border border-border">
            <video
              ref={camVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          </div>
        )}
      </div>

      {/* WebRTC Connection Diagnostics */}
      <div className="p-4 rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-link" />
            <div>
              <div className="text-link font-bold text-text dark:text-text">
                {t(language, 'voiceDiagnostics')}
              </div>
              <div className="text-link text-text-muted dark:text-text-muted">
                {t(language, 'voiceDiagnosticsDesc')}
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={runningDiag}
            onClick={() => void handleRunDiagnostics()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold"
          >
            {runningDiag && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{t(language, 'runDiagnostics')}</span>
          </button>
        </div>

        {stunResult && (
          <div className="p-3 rounded-xl bg-elevated dark:bg-elevated border border-border dark:border-border text-link space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t(language, 'stunStatus')}</span>
              <span
                className={`font-bold ${
                  stunResult.success ? 'text-success' : 'text-danger'
                }`}
              >
                {stunResult.success ? t(language, 'diagnosticsHealthy') : t(language, 'diagnosticsIssue')}
              </span>
            </div>
            <div className="flex items-center justify-between text-text dark:text-text">
              <span>{t(language, 'iceGatherTime')}</span>
              <span className="font-mono">{stunResult.gatherTimeMs} ms</span>
            </div>
            <div className="flex items-center justify-between text-text dark:text-text">
              <span>{t(language, 'iceCandidatesFound')}</span>
              <span className="font-mono">{stunResult.candidateTypes.join(', ') || 'none'}</span>
            </div>
            {stunResult.srflxAddress && (
              <div className="flex items-center justify-between text-text dark:text-text">
                <span>{t(language, 'publicReflexiveIp')}</span>
                <span className="font-mono">{stunResult.srflxAddress}</span>
              </div>
            )}
          </div>
        )}

        {activePeerStats.length > 0 && (
          <div className="space-y-2">
            {activePeerStats.map((p) => (
              <div
                key={p.peerUid}
                className="p-3 rounded-xl bg-elevated dark:bg-elevated border border-border dark:border-border text-link grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                <div>
                  <span className="text-text-muted block">Peer</span>
                  <span className="font-mono">{p.peerUid.slice(0, 8)}</span>
                </div>
                <div>
                  <span className="text-text-muted block">ICE</span>
                  <span className="font-semibold">{p.iceConnectionState}</span>
                </div>
                <div>
                  <span className="text-text-muted block">RTT</span>
                  <span className="font-mono">{p.rttMs !== null ? `${p.rttMs} ms` : '—'}</span>
                </div>
                <div>
                  <span className="text-text-muted block">Codec</span>
                  <span className="font-mono">{p.codec}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
