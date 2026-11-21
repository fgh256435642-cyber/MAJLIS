import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/translations';
import type { DirectCall } from '../types/nexus';
import { playRingtone, stopRingtone } from '../utils/sound';
import { UserAvatar } from './NexusLogo';

interface IncomingCallModalProps {
  call: DirectCall;
  soundEnabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onMissed: () => void;
}

export function IncomingCallModal({
  call,
  soundEnabled,
  onAccept,
  onDecline,
  onMissed,
}: IncomingCallModalProps) {
  const { language } = useAuth();
  const [secondsRemaining, setSecondsRemaining] = useState(30);

  // Ringtone playback and 30s timeout
  useEffect(() => {
    if (soundEnabled) {
      playRingtone();
    }

    const interval = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          stopRingtone();
          onMissed();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
      stopRingtone();
    };
  }, [soundEnabled, onMissed]);

  const handleAccept = () => {
    stopRingtone();
    onAccept();
  };

  const handleDecline = () => {
    stopRingtone();
    onDecline();
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1E1F22] border border-slate-200 dark:border-white/10 shadow-2xl p-6 text-center space-y-6">
        {/* Pulsing ring indicator */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-nexus/20 animate-ping opacity-75" />
          <UserAvatar
            src={call.callerAvatar}
            name={call.callerName}
            size="xl"
            className="w-20 h-20 text-2xl"
          />
          <div className="absolute -bottom-1 -end-1 p-2 rounded-full bg-nexus text-white shadow-md">
            {call.type === 'video' ? (
              <Video className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
          </div>
        </div>

        <div className="space-y-1">
          {call.isGroup && call.groupName && (
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-nexus/15 text-nexus text-xs font-semibold mb-1 max-w-full truncate">
              {call.groupName}
            </div>
          )}
          <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate">
            {call.callerName}
          </h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            {call.type === 'video'
              ? t(language, 'incomingVideoCall')
              : t(language, 'incomingVoiceCall')}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums">
            {secondsRemaining}s
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 pt-2">
          <button
            type="button"
            onClick={handleDecline}
            className="flex flex-col items-center gap-1.5 group"
            title={t(language, 'declineCall')}
          >
            <div className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transition-colors">
              <PhoneOff className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {t(language, 'declineCall')}
            </span>
          </button>

          <button
            type="button"
            onClick={handleAccept}
            className="flex flex-col items-center gap-1.5 group"
            title={t(language, 'acceptCall')}
          >
            <div className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-lg transition-colors animate-pulse">
              <Phone className="w-6 h-6" />
            </div>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {t(language, 'acceptCall')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
