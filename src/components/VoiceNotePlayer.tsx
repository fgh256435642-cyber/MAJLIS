import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/translations';

export function VoiceNotePlayer({ audioUrl }: { audioUrl: string }) {
  const { language } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress(audio.currentTime / audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      audio.currentTime = 0;
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] max-w-xs sm:max-w-sm w-full">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        title={isPlaying ? t(language, 'pauseVoiceNote') : t(language, 'playVoiceNote')}
        aria-label={isPlaying ? t(language, 'pauseVoiceNote') : t(language, 'playVoiceNote')}
        className="w-9 h-9 rounded-full bg-nexus hover:bg-nexus-hover text-white flex items-center justify-center transition-transform hover:scale-105 shrink-0 shadow-sm"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ms-0.5" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        {/* Animated Audio Waveform representation */}
        <div className="flex items-center gap-0.5 h-6">
          {Array.from({ length: 24 }).map((_, idx) => {
            const barPct = Math.sin(idx * 0.5) * 40 + 50;
            const isPassed = progress * 24 >= idx;
            return (
              <span
                key={idx}
                style={{ height: `${Math.max(20, barPct)}%` }}
                className={`flex-1 rounded-full transition-colors duration-150 ${
                  isPassed
                    ? 'bg-nexus'
                    : 'bg-slate-300 dark:bg-zinc-600'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 tabular-nums">
          <span className="flex items-center gap-1 font-medium">
            <Volume2 className="w-3 h-3 text-nexus" />
            <span>{t(language, 'voiceNote')}</span>
          </span>
          <span>
            {formatTime(audioRef.current ? audioRef.current.currentTime : 0)} /{' '}
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
