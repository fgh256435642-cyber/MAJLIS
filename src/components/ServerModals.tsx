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
} from '../services/nexusService';
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
} from '../types/nexus';
import { ServerIcon, UserAvatar } from './NexusLogo';

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
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidth} rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#313338] text-slate-900 dark:text-[#F2F3F5] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col`}
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
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('create')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'create'
                ? 'bg-nexus text-white'
                : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            {t(language, 'createServer')}
          </button>
          <button
            type="button"
            onClick={() => setTab('join')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'join'
                ? 'bg-nexus text-white'
                : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            {t(language, 'joinServer')}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {tab === 'create' ? (
        <form onSubmit={handleCreate} className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-4">
            <label className="cursor-pointer group relative">
              <ServerIcon src={iconPreview} name={name || 'NX'} size="lg" />
              <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <Upload className="w-5 h-5" />
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleIconPick}
                className="hidden"
              />
            </label>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              {t(language, 'uploadIcon')} (PNG, JPG)
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
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
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              {t(language, 'serverDescription')}
            </label>
            <textarea
              rows={2}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A space to collaborate and hang out."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
            />
          </div>

          <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] cursor-pointer">
            <span className="text-xs font-medium">{t(language, 'publicServer')}</span>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 accent-nexus"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/10"
            >
              {t(language, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{t(language, 'create')}</span>
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              {t(language, 'inviteCode')}
            </label>
            <input
              type="text"
              required
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="e.g. aB3x9K2m or https://.../?invite=aB3x9K2m"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/10"
            >
              {t(language, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !inviteInput.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-sm font-semibold transition-colors"
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
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <h3 className="font-bold text-base">
          {editingChannel ? t(language, 'rename') : t(language, 'createChannel')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                type === 'text'
                  ? 'border-nexus bg-nexus/15 text-nexus'
                  : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
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
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                type === 'voice'
                  ? 'border-nexus bg-nexus/15 text-nexus'
                  : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>{t(language, 'voiceChannel')}</span>
            </button>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
            {t(language, 'channelName')}
          </label>
          <input
            type="text"
            required
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'text' ? 'announcements' : 'Gaming Voice'}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
            {t(language, 'channelCategory')}
          </label>
          <input
            type="text"
            required
            maxLength={48}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
            {t(language, 'channelTopic')}
          </label>
          <input
            type="text"
            maxLength={256}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/10"
          >
            {t(language, 'cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-sm font-semibold transition-colors"
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
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <h3 className="font-bold text-base truncate">
          {t(language, 'invitePeople')} — {server.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto">
        <button
          type="button"
          disabled={creating}
          onClick={handleGenerate}
          className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-nexus hover:bg-nexus-hover text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Invite Link</span>
        </button>

        {invites.length === 0 ? (
          <p className="text-xs text-center text-slate-500 dark:text-zinc-400 py-4">
            Click above to generate a shareable invite link.
          </p>
        ) : (
          <div className="space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.code}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22]"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                    {inv.code}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                    {inv.uses} uses
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyLink(inv.code)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-nexus hover:bg-nexus-hover text-white text-xs font-medium transition-colors"
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
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-500"
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
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <h3 className="font-bold text-base truncate">
          {t(language, 'serverSettings')} — {server.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-40 shrink-0 border-e border-slate-200 dark:border-white/10 p-2 space-y-1 bg-slate-50 dark:bg-[#2B2D31]">
          {(['overview', 'roles', 'bans'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`w-full text-start px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                tab === k
                  ? 'bg-slate-200 dark:bg-[#404249] text-slate-950 dark:text-white'
                  : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5'
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
                    <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
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
                  <div className="text-xs text-slate-500 dark:text-zinc-400">
                    {t(language, 'uploadIcon')}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    {t(language, 'serverName')}
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    {t(language, 'serverDescription')}
                  </label>
                  <textarea
                    rows={2}
                    maxLength={400}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm"
                  />
                </div>

                <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] cursor-pointer">
                  <span className="text-xs font-medium">{t(language, 'publicServer')}</span>
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="w-4 h-4 accent-nexus"
                  />
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover text-white text-sm font-semibold transition-colors"
                >
                  {t(language, 'save')}
                </button>
              </form>

              {myRole === 'owner' && (
                <div className="pt-5 border-t border-slate-200 dark:border-white/10 space-y-3">
                  <h4 className="text-sm font-bold text-rose-600 dark:text-rose-400">
                    {t(language, 'deleteServer')}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    {t(language, 'deleteServerConfirm')}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={server.name}
                      className="flex-1 px-3 py-2 rounded-lg border border-rose-500/30 bg-slate-50 dark:bg-[#1E1F22] text-sm"
                    />
                    <button
                      type="button"
                      disabled={saving || deleteConfirm.trim() !== server.name}
                      onClick={handleDelete}
                      className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-sm font-semibold"
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
                    className="flex items-center justify-between gap-3 py-2 border-b border-slate-200 dark:border-white/10"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        src={pub?.avatarUrl ?? m.avatarUrl}
                        name={pub?.displayName || m.displayName}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {pub?.displayName || m.displayName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
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
                        className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-xs"
                      >
                        {myRole === 'owner' && <option value="admin">Admin</option>}
                        <option value="moderator">Moderator</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <span className="text-xs font-semibold capitalize text-slate-500 dark:text-zinc-400">
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
                <p className="text-xs text-slate-500 dark:text-zinc-400 py-8 text-center">
                  No banned users in this server.
                </p>
              ) : (
                bans.map((b) => (
                  <div
                    key={b.uid}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-white/10"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {usersById[b.uid]?.displayName || b.uid}
                      </div>
                      {b.reason && (
                        <div className="text-xs text-slate-500 dark:text-zinc-400">
                          {b.reason}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => unbanMember(server.id, b.uid)}
                      className="px-3 py-1.5 rounded-md bg-slate-200 dark:bg-white/10 hover:bg-emerald-600 hover:text-white text-xs font-medium transition-colors"
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
