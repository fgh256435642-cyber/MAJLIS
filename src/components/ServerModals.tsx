import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Hash,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n/translations';
import { db } from '../services/firebase';
import {
  createChannel,
  createInvite,
  createServer,
  deleteServer,
  joinServerByInvite,
  revokeInvite,
  unbanMember,
  updateChannel,
  updateMemberRole,
  updateServer,
} from '../services/majlisService';
import { uploadFileToStorage } from '../services/storageService';
import type {
  Channel,
  ChannelType,
  Invite,
  PublicUser,
  Role,
  Server,
  ServerBan,
  ServerMember,
} from '../types/majlis';
import { ServerIcon, UserAvatar } from './MajlisLogo';

function ModalBackdrop({
  onClose,
  children,
  maxWidth = 'max-w-lg',
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-rail/70 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidth} rounded-2xl border border-border dark:border-border bg-elevated dark:bg-elevated text-text dark:text-text shadow-2xl overflow-hidden max-h-[90vh] flex flex-col`}
      >
        {children}
      </div>
    </div>
  );
}

export function CreateJoinServerModal({
  publicUser,
  onClose,
  onSuccess,
}: {
  publicUser: PublicUser;
  onClose: () => void;
  onSuccess: (serverId: string) => void;
}) {
  const { language } = useAuth();
  const { pushToast } = useToast();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string>('');
  const [inviteInput, setInviteInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleIconPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let iconUrl = '';
      if (iconFile) {
        iconUrl = await uploadFileToStorage(`servers/icons_${publicUser.uid}`, iconFile);
      }
      const { serverId } = await createServer(publicUser.uid, publicUser, {
        name,
        description,
        iconUrl,
        isPublic,
      });
      pushToast({ type: 'success', title: `Created ${name}` });
      onSuccess(serverId);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Failed to create server',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const serverId = await joinServerByInvite(publicUser.uid, publicUser, inviteInput);
      pushToast({ type: 'success', title: 'Joined server!' });
      onSuccess(serverId);
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Could not join server',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-md">
      <div className="px-5 py-4 border-accent border-border dark:border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('create')}
            className={`px-3 py-1.5 rounded-lg text-link font-semibold transition-colors ${
              tab === 'create'
                ? 'bg-accent text-text'
                : 'text-text dark:text-text hover:bg-main dark:hover:bg-main'
            }`}
          >
            {t(language, 'createServer')}
          </button>
          <button
            type="button"
            onClick={() => setTab('join')}
            className={`px-3 py-1.5 rounded-lg text-link font-semibold transition-colors ${
              tab === 'join'
                ? 'bg-accent text-text'
                : 'text-text dark:text-text hover:bg-main dark:hover:bg-main'
            }`}
          >
            {t(language, 'joinServer')}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-text-muted hover:text-text dark:hover:text-text"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {tab === 'create' ? (
        <form onSubmit={handleCreate} className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-4">
            <label className="cursor-pointer group relative">
              <ServerIcon src={iconPreview} name={name || 'NX'} size="lg" />
              <div className="absolute inset-0 rounded-2xl bg-rail/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-text transition-opacity">
                <Upload className="w-5 h-5" />
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleIconPick}
                className="hidden"
              />
            </label>
            <div className="text-link text-text-muted dark:text-text-muted">
              {t(language, 'uploadIcon')} (PNG, JPG)
            </div>
          </div>

          <div>
            <label className="block text-link font-semibold text-text dark:text-text mb-1">
              {t(language, 'serverName')}
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Design Builders"
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-link font-semibold text-text dark:text-text mb-1">
              {t(language, 'serverDescription')}
            </label>
            <textarea
              rows={2}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A space to collaborate and hang out."
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
            />
          </div>

          <label className="flex items-center justify-between p-3 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated cursor-pointer">
            <span className="text-link font-medium">{t(language, 'publicServer')}</span>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-link font-medium hover:bg-main dark:hover:bg-main"
            >
              {t(language, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{t(language, 'create')}</span>
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="p-5 space-y-4">
          <div>
            <label className="block text-link font-semibold text-text dark:text-text mb-1">
              {t(language, 'inviteCode')}
            </label>
            <input
              type="text"
              required
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="e.g. aB3x9K2m or https://.../?invite=aB3x9K2m"
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-link font-medium hover:bg-main dark:hover:bg-main"
            >
              {t(language, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !inviteInput.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{t(language, 'join')}</span>
            </button>
          </div>
        </form>
      )}
    </ModalBackdrop>
  );
}

export function ChannelModal({
  serverId,
  myUid,
  channelCount,
  editingChannel,
  defaultType,
  onClose,
  onCreated,
}: {
  serverId: string;
  myUid: string;
  channelCount: number;
  editingChannel: Channel | null;
  defaultType: ChannelType;
  onClose: () => void;
  onCreated: (ch: Channel) => void;
}) {
  const { language } = useAuth();
  const { pushToast } = useToast();
  const [type, setType] = useState<ChannelType>(editingChannel?.type ?? defaultType);
  const [name, setName] = useState(editingChannel?.name ?? '');
  const [topic, setTopic] = useState(editingChannel?.topic ?? '');
  const [category, setCategory] = useState(
    editingChannel?.category ??
      (defaultType === 'text' ? 'Text Channels' : 'Voice Channels')
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (editingChannel) {
        await updateChannel(serverId, editingChannel.id, editingChannel.type, {
          name,
          topic,
          category,
        });
        pushToast({ type: 'success', title: 'Channel updated' });
        onClose();
      } else {
        const ch = await createChannel(myUid, serverId, {
          name,
          topic,
          type,
          category,
          position: channelCount,
        });
        pushToast({ type: 'success', title: `Created #${ch.name}` });
        onCreated(ch);
      }
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Channel action failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-md">
      <div className="px-5 py-4 border-accent border-border dark:border-border flex items-center justify-between">
        <h3 className="font-bold text-link">
          {editingChannel ? t(language, 'rename') : t(language, 'createChannel')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-text-muted hover:text-text dark:hover:text-text"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {!editingChannel && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setType('text');
                setCategory('Text Channels');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-link font-medium transition-colors ${
                type === 'text'
                  ? 'border-accent bg-accent/15 text-link'
                  : 'border-border dark:border-border hover:bg-elevated dark:hover:bg-elevated'
              }`}
            >
              <Hash className="w-4 h-4" />
              <span>{t(language, 'textChannel')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setType('voice');
                setCategory('Voice Channels');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-link font-medium transition-colors ${
                type === 'voice'
                  ? 'border-accent bg-accent/15 text-link'
                  : 'border-border dark:border-border hover:bg-elevated dark:hover:bg-elevated'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>{t(language, 'voiceChannel')}</span>
            </button>
          </div>
        )}

        <div>
          <label className="block text-link font-semibold text-text dark:text-text mb-1">
            {t(language, 'channelName')}
          </label>
          <input
            type="text"
            required
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'text' ? 'announcements' : 'Gaming Voice'}
            className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="block text-link font-semibold text-text dark:text-text mb-1">
            {t(language, 'channelCategory')}
          </label>
          <input
            type="text"
            required
            maxLength={48}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="block text-link font-semibold text-text dark:text-text mb-1">
            {t(language, 'channelTopic')}
          </label>
          <input
            type="text"
            maxLength={256}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link focus:outline-accent focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-link font-medium hover:bg-main dark:hover:bg-main"
          >
            {t(language, 'cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-accent hover:bg-majlis-hover disabled:opacity-50 text-text text-link font-semibold transition-colors"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{editingChannel ? t(language, 'save') : t(language, 'create')}</span>
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

export function InviteModal({
  server,
  myUid,
  onClose,
}: {
  server: Server;
  myUid: string;
  onClose: () => void;
}) {
  const { language } = useAuth();
  const { pushToast } = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'invites'), where('createdBy', '==', myUid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => d.data() as Invite)
        .filter((inv) => inv.serverId === server.id);
      setInvites(list);
    });
  }, [myUid, server.id]);

  const handleGenerate = async () => {
    setCreating(true);
    try {
      await createInvite(myUid, server, 0);
      pushToast({ type: 'success', title: 'New invite created' });
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Failed to create invite',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/?invite=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    pushToast({ type: 'success', title: t(language, 'copied') });
    setTimeout(() => setCopiedCode(null), 1800);
  };

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-md">
      <div className="px-5 py-4 border-accent border-border dark:border-border flex items-center justify-between">
        <h3 className="font-bold text-link truncate">
          {t(language, 'invitePeople')} — {server.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-text-muted hover:text-text dark:hover:text-text"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto">
        <button
          type="button"
          disabled={creating}
          onClick={handleGenerate}
          className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-accent hover:bg-majlis-hover text-text text-link font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Invite Link</span>
        </button>

        {invites.length === 0 ? (
          <p className="text-link text-link text-text-muted dark:text-text-muted py-4">
            Click above to generate a shareable invite link.
          </p>
        ) : (
          <div className="space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.code}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated"
              >
                <div className="min-w-0">
                  <div className="font-mono text-link font-semibold text-text dark:text-text">
                    {inv.code}
                  </div>
                  <div className="text-[11px] text-text-muted dark:text-text-muted tabular-nums">
                    {inv.uses} uses
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyLink(inv.code)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-accent hover:bg-majlis-hover text-text text-link font-medium transition-colors"
                  >
                    {copiedCode === inv.code ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{t(language, 'copy')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeInvite(inv.code)}
                    className="p-1.5 rounded-md text-text-muted hover:text-danger"
                    title="Revoke"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}

export function ServerSettingsModal({
  server,
  members,
  usersById,
  myUid,
  myRole,
  onClose,
  onDeleted,
}: {
  server: Server;
  members: ServerMember[];
  usersById: Record<string, PublicUser>;
  myUid: string;
  myRole: Role;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { language } = useAuth();
  const { pushToast } = useToast();
  const [tab, setTab] = useState<'overview' | 'roles' | 'bans'>('overview');
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [isPublic, setIsPublic] = useState(server.isPublic);
  const [iconUrl, setIconUrl] = useState(server.iconUrl || '');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'servers', server.id, 'bans'), (snap) => {
      setBans(snap.docs.map((d) => d.data() as ServerBan));
    });
    return unsub;
  }, [server.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let nextIcon = iconUrl;
      if (iconFile) {
        nextIcon = await uploadFileToStorage(`servers/${server.id}/icons`, iconFile);
      }
      await updateServer(server.id, { name, description, iconUrl: nextIcon, isPublic });
      pushToast({ type: 'success', title: 'Server settings saved' });
      onClose();
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm.trim() !== server.name) return;
    setSaving(true);
    try {
      await deleteServer(myUid, server.id);
      pushToast({ type: 'info', title: `Deleted ${server.name}` });
      onDeleted();
    } catch (err) {
      pushToast({
        type: 'error',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-2xl">
      <div className="px-5 py-4 border-accent border-border dark:border-border flex items-center justify-between">
        <h3 className="font-bold text-link truncate">
          {t(language, 'serverSettings')} — {server.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-text-muted hover:text-text dark:hover:text-text"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-40 shrink-0 border-accent border-border dark:border-border p-2 space-y-1 bg-elevated dark:bg-elevated">
          {(['overview', 'roles', 'bans'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`w-full text-link px-3 py-2 rounded-md text-link font-medium transition-colors ${
                tab === k
                  ? 'bg-hover dark:bg-hover text-text dark:text-text'
                  : 'text-text dark:text-text hover:bg-main dark:hover:bg-main'
              }`}
            >
              {t(language, k)}
            </button>
          ))}
        </div>

        <div className="flex-1 p-5 overflow-y-auto">
          {tab === 'overview' && (
            <div className="space-y-6">
              <form onSubmit={handleSave} className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="cursor-pointer group relative">
                    <ServerIcon
                      src={iconFile ? URL.createObjectURL(iconFile) : iconUrl}
                      name={name || server.name}
                      size="lg"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-rail/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-text transition-opacity">
                      <Upload className="w-5 h-5" />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setIconFile(f);
                      }}
                      className="hidden"
                    />
                  </label>
                  <div className="text-link text-text-muted dark:text-text-muted">
                    {t(language, 'uploadIcon')}
                  </div>
                </div>

                <div>
                  <label className="block text-link font-semibold mb-1">
                    {t(language, 'serverName')}
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
                  />
                </div>

                <div>
                  <label className="block text-link font-semibold mb-1">
                    {t(language, 'serverDescription')}
                  </label>
                  <textarea
                    rows={2}
                    maxLength={400}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
                  />
                </div>

                <label className="flex items-center justify-between p-3 rounded-lg border border-border dark:border-border bg-elevated dark:bg-elevated cursor-pointer">
                  <span className="text-link font-medium">{t(language, 'publicServer')}</span>
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-majlis-hover text-text text-link font-semibold transition-colors"
                >
                  {t(language, 'save')}
                </button>
              </form>

              {myRole === 'owner' && (
                <div className="pt-5 border-accent border-border dark:border-border space-y-3">
                  <h4 className="text-link font-bold text-danger dark:text-danger">
                    {t(language, 'deleteServer')}
                  </h4>
                  <p className="text-link text-text-muted dark:text-text-muted">
                    {t(language, 'deleteServerConfirm')}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={server.name}
                      className="flex-1 px-3 py-2 rounded-lg border border-danger bg-elevated dark:bg-elevated text-link"
                    />
                    <button
                      type="button"
                      disabled={saving || deleteConfirm.trim() !== server.name}
                      onClick={handleDelete}
                      className="px-4 py-2 rounded-lg bg-danger hover:bg-danger disabled:opacity-40 text-text text-link font-semibold"
                    >
                      {t(language, 'delete')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'roles' && (
            <div className="space-y-3">
              {members.map((m) => {
                const pub = usersById[m.uid];
                const canChange =
                  m.uid !== myUid &&
                  m.role !== 'owner' &&
                  (myRole === 'owner' || (myRole === 'admin' && m.role !== 'admin'));

                return (
                  <div
                    key={m.uid}
                    className="flex items-center justify-between gap-3 py-2 border-accent border-border dark:border-border"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        src={pub?.avatarUrl ?? m.avatarUrl}
                        name={pub?.displayName || m.displayName}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="text-link font-medium truncate">
                          {pub?.displayName || m.displayName}
                        </div>
                        <div className="text-link text-text-muted dark:text-text-muted truncate">
                          @{pub?.username || m.username}
                        </div>
                      </div>
                    </div>

                    {canChange ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          updateMemberRole(
                            server.id,
                            m.uid,
                            e.target.value as Exclude<Role, 'owner'>
                          )
                        }
                        className="px-2.5 py-1.5 rounded-md border border-border dark:border-border bg-elevated dark:bg-elevated text-link"
                      >
                        {myRole === 'owner' && <option value="admin">Admin</option>}
                        <option value="moderator">Moderator</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <span className="text-link font-semibold capitalize text-text-muted dark:text-text-muted">
                        {m.role}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'bans' && (
            <div className="space-y-3">
              {bans.length === 0 ? (
                <p className="text-link text-text-muted dark:text-text-muted py-8 text-link">
                  No banned users in this server.
                </p>
              ) : (
                bans.map((b) => (
                  <div
                    key={b.uid}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border dark:border-border"
                  >
                    <div>
                      <div className="text-link font-semibold">
                        {usersById[b.uid]?.displayName || b.uid}
                      </div>
                      {b.reason && (
                        <div className="text-link text-text-muted dark:text-text-muted">
                          {b.reason}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => unbanMember(server.id, b.uid)}
                      className="px-3 py-1.5 rounded-md bg-hover dark:bg-hover hover:bg-success hover:text-text text-link font-medium transition-colors"
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
    </ModalBackdrop>
  );
}
