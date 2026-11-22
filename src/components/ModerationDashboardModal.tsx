import React, { useEffect, useState } from 'react';
import { Shield, ShieldAlert, Trash2, UserX, X, Users, AlertTriangle, Check } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { t } from '../i18n/translations';
import type { AuditLog, Server, ServerBan, ServerMember } from '../types/majlis';
import { UserAvatar } from './MajlisLogo';

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
      className="fixed inset-0 z-50 bg-rail/75 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-elevated dark:bg-elevated rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-border dark:border-border"
      >
        {/* Header */}
        <div className="px-6 py-4 border-accent border-border dark:border-border flex items-center justify-between bg-elevated dark:bg-elevated">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 text-link flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-link font-bold text-text dark:text-text">
                {t(language, 'moderationDashboard')}
              </h2>
              <p className="text-link text-text-muted dark:text-text-muted">
                {server.name} — {t(language, 'moderationPanel')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text dark:hover:text-text"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-accent border-border dark:border-border bg-elevated/50 dark:bg-elevated/50">
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`px-4 py-2 rounded-lg text-link font-semibold transition-colors ${
              tab === 'audit'
                ? 'bg-accent text-text'
                : 'bg-hover dark:bg-hover text-text dark:text-text hover:bg-hover dark:hover:bg-hover'
            }`}
          >
            {t(language, 'auditLogs')} ({auditLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('members')}
            className={`px-4 py-2 rounded-lg text-link font-semibold transition-colors ${
              tab === 'members'
                ? 'bg-accent text-text'
                : 'bg-hover dark:bg-hover text-text dark:text-text hover:bg-hover dark:hover:bg-hover'
            }`}
          >
            {t(language, 'members')} ({members.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('bans')}
            className={`px-4 py-2 rounded-lg text-link font-semibold transition-colors ${
              tab === 'bans'
                ? 'bg-accent text-text'
                : 'bg-hover dark:bg-hover text-text dark:text-text hover:bg-hover dark:hover:bg-hover'
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
                <div className="py-12 text-link text-link text-text-muted dark:text-text-muted">
                  {t(language, 'noAuditLogs')}
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between p-3.5 rounded-xl border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text dark:text-text">
                          {log.actorName}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-accent/15 text-link font-semibold">
                          {log.action}
                        </span>
                        {log.targetName && (
                          <span className="text-text dark:text-text">
                            → {log.targetName}
                          </span>
                        )}
                      </div>
                      {log.details && (
                        <p className="text-text dark:text-text">{log.details}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-text-muted dark:text-text-muted tabular-nums shrink-0">
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
                  className="flex items-center justify-between p-3 rounded-xl border border-border dark:border-border bg-elevated dark:bg-elevated"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar src={m.avatarUrl} name={m.displayName} size="md" />
                    <div>
                      <div className="text-link font-semibold text-text dark:text-text">
                        {m.displayName}
                      </div>
                      <div className="text-link text-text-muted dark:text-text-muted">
                        @{m.username} · <span className="uppercase">{m.role}</span>
                      </div>
                    </div>
                  </div>
                  {m.uid !== server.ownerId && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onKick(m.uid)}
                        className="px-3 py-1.5 rounded-lg border border-warning bg-warning/10 text-warning dark:text-warning text-link font-semibold hover:bg-warning/20 transition-colors"
                      >
                        {t(language, 'kick')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onBan(m.uid)}
                        className="px-3 py-1.5 rounded-lg border border-danger bg-danger/10 text-danger dark:text-danger text-link font-semibold hover:bg-danger/20 transition-colors"
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
                <div className="py-12 text-link text-link text-text-muted dark:text-text-muted">
                  No banned users in this server.
                </div>
              ) : (
                bans.map((b) => (
                  <div
                    key={b.uid}
                    className="flex items-center justify-between p-3 rounded-xl border border-border dark:border-border bg-elevated dark:bg-elevated"
                  >
                    <div>
                      <div className="text-link font-semibold text-text dark:text-text">
                        User ID: {b.uid}
                      </div>
                      <div className="text-link text-text-muted dark:text-text-muted">
                        {b.reason || 'Banned by moderator'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUnban(b.uid)}
                      className="px-3 py-1.5 rounded-lg bg-accent hover:bg-majlis-hover text-text text-link font-semibold transition-colors"
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
