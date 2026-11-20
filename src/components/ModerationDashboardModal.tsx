import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, Trash2, UserX, X, Users, AlertTriangle, Check } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/translations';
import type { AuditLog, Server, ServerBan, ServerMember } from '../types/nexus';
import { UserAvatar } from './NexusLogo';

interface ModerationDashboardModalProps {
  server: Server;
  members: ServerMember[];
  myRole: string;
  onClose: () => void;
  onKick: (uid: string) => Promise<void>;
  onBan: (uid: string) => Promise<void>;
  onUnban: (uid: string) => Promise<void>;
}

export function ModerationDashboardModal({
  server,
  members,
  myRole,
  onClose,
  onKick,
  onBan,
  onUnban,
}: ModerationDashboardModalProps) {
  const { language } = useAuth();
  const [tab, setTab] = useState<'audit' | 'members' | 'bans'>('audit');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [bans, setBans] = useState<ServerBan[]>([]);

  useEffect(() => {
    const unsubLogs = onSnapshot(
      query(collection(db, 'servers', server.id, 'auditLogs'), orderBy('createdAt', 'desc')),
      (snap) => {
        setAuditLogs(snap.docs.map((d) => d.data() as AuditLog));
      },
      () => {}
    );

    const unsubBans = onSnapshot(
      collection(db, 'servers', server.id, 'bans'),
      (snap) => {
        setBans(snap.docs.map((d) => d.data() as ServerBan));
      },
      () => {}
    );

    return () => {
      unsubLogs();
      unsubBans();
    };
  }, [server.id]);

  const formatTimestamp = (ts?: any) => {
    if (!ts?.toMillis) return '';
    return new Date(ts.toMillis()).toLocaleString(language === 'ar' ? 'ar' : 'en-US');
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-white dark:bg-[#313338] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 dark:border-white/10"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-[#2B2D31]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-nexus/15 text-nexus flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {t(language, 'moderationDashboard')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {server.name} — {t(language, 'moderationPanel')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#2B2D31]/50">
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'audit'
                ? 'bg-nexus text-white'
                : 'bg-slate-200 dark:bg-[#1E1F22] text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-[#35373C]'
            }`}
          >
            {t(language, 'auditLogs')} ({auditLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('members')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'members'
                ? 'bg-nexus text-white'
                : 'bg-slate-200 dark:bg-[#1E1F22] text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-[#35373C]'
            }`}
          >
            {t(language, 'members')} ({members.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('bans')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'bans'
                ? 'bg-nexus text-white'
                : 'bg-slate-200 dark:bg-[#1E1F22] text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-[#35373C]'
            }`}
          >
            {t(language, 'bans')} ({bans.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === 'audit' && (
            <div className="space-y-3">
              {auditLogs.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-zinc-400">
                  {t(language, 'noAuditLogs')}
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {log.actorName}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-nexus/15 text-nexus font-semibold">
                          {log.action}
                        </span>
                        {log.targetName && (
                          <span className="text-slate-600 dark:text-zinc-300">
                            → {log.targetName}
                          </span>
                        )}
                      </div>
                      {log.details && (
                        <p className="text-slate-600 dark:text-zinc-400">{log.details}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums shrink-0">
                      {formatTimestamp(log.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'members' && (
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.uid}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31]"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar src={m.avatarUrl} name={m.displayName} size="md" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {m.displayName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400">
                        @{m.username} · <span className="uppercase">{m.role}</span>
                      </div>
                    </div>
                  </div>
                  {m.uid !== server.ownerId && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onKick(m.uid)}
                        className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
                      >
                        {t(language, 'kick')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onBan(m.uid)}
                        className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-colors"
                      >
                        {t(language, 'ban')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'bans' && (
            <div className="space-y-2">
              {bans.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-zinc-400">
                  No banned users in this server.
                </div>
              ) : (
                bans.map((b) => (
                  <div
                    key={b.uid}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31]"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        User ID: {b.uid}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400">
                        {b.reason || 'Banned by moderator'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUnban(b.uid)}
                      className="px-3 py-1.5 rounded-lg bg-nexus hover:bg-nexus-hover text-white text-xs font-semibold transition-colors"
                    >
                      {t(language, 'unban')}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
