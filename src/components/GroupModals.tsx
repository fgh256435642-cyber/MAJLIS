import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Crown,
  Loader2,
  LogOut,
  Search,
  Settings,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { t } from '../i18n/translations';
import {
  addGroupMembers,
  createGroupDm,
  kickGroupMember,
  leaveGroupDm,
  transferGroupOwnership,
  updateGroupSettings,
} from '../services/nexusService';
import { uploadFileToStorage } from '../services/storageService';
import type { Friendship, GroupDm, PublicUser } from '../types/nexus';
import { getEffectiveUserStatus, getGroupDisplayName, LIMITS } from '../utils/validation';
import { GroupAvatar, UserAvatar } from './NexusLogo';

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

export function CreateGroupModal({
  publicUser,
  friendships,
  usersById,
  onClose,
  onCreated,
}: {
  publicUser: PublicUser;
  friendships: Friendship[];
  usersById: Record<string, PublicUser>;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const { language, presenceNowMs } = useAuth();
  const { pushToast } = useToast();
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (iconPreview) URL.revokeObjectURL(iconPreview);
    };
  }, [iconPreview]);

  const acceptedFriends = useMemo(() => {
    return friendships
      .filter((f) => f.status === 'accepted')
      .map((f) => {
        const friendUid = f.participants.find((id) => id !== publicUser.uid) || '';
        return usersById[friendUid];
      })
      .filter((u): u is PublicUser => Boolean(u))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [friendships, publicUser.uid, usersById]);

  const filteredFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return acceptedFriends;
    return acceptedFriends.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.usernameLower.includes(q)
    );
  }, [acceptedFriends, searchQuery]);

  const toggleFriend = (uid: string) => {
    setSelectedUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      if (prev.length >= 9) {
        pushToast({ type: 'info', title: t(language, 'maxFriendsReached') });
        return prev;
      }
      return [...prev, uid];
    });
  };

  const handleIconPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUids.length < 2) {
      pushToast({ type: 'error', title: t(language, 'minFriendsRequired') });
      return;
    }
    setSubmitting(true);
    try {
      let iconUrl = '';
      if (iconFile) {
        iconUrl = await uploadFileToStorage(
          `servers/group_${publicUser.uid}/icons`,
          iconFile
        );
      }
      const created = await createGroupDm(publicUser, {
        name: groupName.trim(),
        iconUrl,
        memberUids: selectedUids,
      });
      pushToast({ type: 'success', title: t(language, 'groupCreated') });
      onCreated(created.id);
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-lg">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-nexus" />
            <span>{t(language, 'createGroupTitle')}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {t(language, 'createGroupDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleCreate} className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Group Name & Icon (Optional) */}
          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer group shrink-0">
              <GroupAvatar
                src={iconPreview || undefined}
                name={groupName || 'Group'}
                size="lg"
              />
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <Upload className="w-4 h-4" />
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleIconPick}
                className="hidden"
              />
            </label>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold mb-1">
                {t(language, 'groupNameOptional')}
              </label>
              <input
                type="text"
                maxLength={LIMITS.GROUP_NAME_MAX}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t(language, 'groupNamePlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
              />
            </div>
            {iconPreview && (
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(iconPreview);
                  setIconPreview('');
                  setIconFile(null);
                }}
                title={t(language, 'removeIcon')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Selected Friends Badges */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-zinc-200">
                {t(language, 'selectFriendsCount')}
              </span>
              <span
                className={`tabular-nums font-semibold ${
                  selectedUids.length >= 2
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-zinc-400'
                }`}
              >
                {selectedUids.length} / 9 {t(language, 'selectedFriendsLabel')}
              </span>
            </div>

            {selectedUids.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-[#1E1F22] border border-slate-200 dark:border-white/10">
                {selectedUids.map((uid) => {
                  const friend = usersById[uid];
                  if (!friend) return null;
                  return (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1.5 ps-1.5 pe-1 py-0.5 rounded-md bg-nexus/15 text-nexus border border-nexus/30 text-xs font-medium"
                    >
                      <UserAvatar src={friend.avatarUrl} name={friend.displayName} size="xs" />
                      <span className="truncate max-w-[120px]">{friend.displayName}</span>
                      <button
                        type="button"
                        onClick={() => toggleFriend(uid)}
                        className="p-0.5 rounded hover:bg-nexus/20"
                        aria-label={t(language, 'cancel')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Search Friends */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(language, 'searchFriendsPlaceholder')}
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
            />
          </div>

          {/* Friend Selection List */}
          <div className="space-y-1 max-h-56 overflow-y-auto pe-1">
            {acceptedFriends.length < 2 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
                {t(language, 'noFriendsToCreateGroup')}
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
                {t(language, 'noMatchingMembers')}
              </div>
            ) : (
              filteredFriends.map((friend) => {
                const isSelected = selectedUids.includes(friend.uid);
                const status = getEffectiveUserStatus(
                  friend.status,
                  friend.lastSeen?.toMillis?.(),
                  presenceNowMs
                );
                const disabled = !isSelected && selectedUids.length >= 9;

                return (
                  <button
                    key={friend.uid}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleFriend(friend.uid)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-start transition-colors ${
                      isSelected
                        ? 'bg-nexus/15 border border-nexus/40'
                        : 'hover:bg-slate-100 dark:hover:bg-[#2B2D31] border border-transparent'
                    } disabled:opacity-45 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        src={friend.avatarUrl}
                        name={friend.displayName}
                        status={status}
                        size="sm"
                        showStatus
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {friend.displayName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                          @{friend.username}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-nexus border-nexus text-white'
                          : 'border-slate-300 dark:border-zinc-600'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            {t(language, 'cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || selectedUids.length < 2}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{t(language, 'createGroup')}</span>
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

export function GroupSettingsModal({
  group,
  publicUser,
  friendships,
  usersById,
  isMuted,
  initialTab = 'overview',
  onToggleMute,
  onClose,
  onLeftGroup,
}: {
  group: GroupDm;
  publicUser: PublicUser;
  friendships: Friendship[];
  usersById: Record<string, PublicUser>;
  isMuted: boolean;
  initialTab?: 'overview' | 'members' | 'add';
  onToggleMute: () => void;
  onClose: () => void;
  onLeftGroup: () => void;
}) {
  const { language, presenceNowMs } = useAuth();
  const { pushToast } = useToast();
  const isOwner = group.ownerId === publicUser.uid;

  const [tab, setTab] = useState<'overview' | 'members' | 'add'>(initialTab);
  const [name, setName] = useState(group.name || '');
  const [iconUrl, setIconUrl] = useState(group.iconUrl || '');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState(group.iconUrl || '');
  const [saving, setSaving] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmTransferUid, setConfirmTransferUid] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setName(group.name || '');
    setIconUrl(group.iconUrl || '');
    setIconPreview(group.iconUrl || '');
    setIconFile(null);
  }, [group.id, group.name, group.iconUrl]);

  const displayName = getGroupDisplayName(group, usersById, publicUser.uid, language);
  const remainingSlots = Math.max(0, LIMITS.GROUP_MEMBERS_MAX - group.memberIds.length);

  const availableFriendsToAdd = useMemo(() => {
    const memberSet = new Set(group.memberIds);
    const q = addSearch.trim().toLowerCase().replace(/^@/, '');
    return friendships
      .filter((f) => f.status === 'accepted')
      .map((f) => {
        const friendUid = f.participants.find((id) => id !== publicUser.uid) || '';
        return usersById[friendUid];
      })
      .filter((u): u is PublicUser => Boolean(u && !memberSet.has(u.uid)))
      .filter(
        (u) =>
          !q ||
          u.displayName.toLowerCase().includes(q) ||
          u.usernameLower.includes(q)
      );
  }, [friendships, group.memberIds, publicUser.uid, usersById, addSearch]);

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    setSaving(true);
    try {
      let nextIconUrl = iconUrl;
      if (iconFile) {
        nextIconUrl = await uploadFileToStorage(
          `servers/group_${publicUser.uid}/icons`,
          iconFile
        );
      }
      await updateGroupSettings(group, publicUser, {
        name: name.trim(),
        iconUrl: nextIconUrl,
      });
      pushToast({ type: 'success', title: t(language, 'groupUpdated') });
      onClose();
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddMembers = async () => {
    if (!isOwner || selectedToAdd.length === 0) return;
    setSaving(true);
    try {
      const targets = selectedToAdd
        .map((id) => usersById[id])
        .filter((u): u is PublicUser => Boolean(u));
      await addGroupMembers(group, publicUser, targets);
      pushToast({ type: 'success', title: t(language, 'membersAddedToGroup') });
      setSelectedToAdd([]);
      setTab('members');
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleKick = async (targetUid: string) => {
    const targetUser = usersById[targetUid];
    const targetName = targetUser?.displayName || targetUid.slice(0, 8);
    try {
      await kickGroupMember(group, publicUser, targetUid, targetName);
      pushToast({ type: 'info', title: t(language, 'memberKickedFromGroup') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleTransfer = async (targetUid: string) => {
    const targetUser = usersById[targetUid];
    const targetName = targetUser?.displayName || targetUid.slice(0, 8);
    try {
      await transferGroupOwnership(group, publicUser, targetUid, targetName);
      setConfirmTransferUid(null);
      pushToast({ type: 'success', title: t(language, 'ownershipTransferred') });
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleLeave = async () => {
    setSaving(true);
    try {
      await leaveGroupDm(group, publicUser);
      pushToast({ type: 'info', title: t(language, 'youLeftGroup') });
      onLeftGroup();
    } catch (err) {
      pushToast({
        type: 'error',
        title: t(language, 'errorGeneric'),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-xl">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <GroupAvatar src={group.iconUrl} name={displayName} size="sm" />
          <div className="min-w-0">
            <h3 className="font-bold text-base truncate">{displayName}</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
              {group.memberIds.length} {t(language, 'members')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden flex-col sm:flex-row">
        <nav className="sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-e border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#2B2D31] p-2 flex sm:flex-col gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-start whitespace-nowrap transition-colors ${
              tab === 'overview'
                ? 'bg-slate-200 dark:bg-[#404249] text-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span>{t(language, 'overview')}</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('members')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-start whitespace-nowrap transition-colors ${
              tab === 'members'
                ? 'bg-slate-200 dark:bg-[#404249] text-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t(language, 'members')} ({group.memberIds.length})
            </span>
          </button>

          {isOwner && remainingSlots > 0 && (
            <button
              type="button"
              onClick={() => setTab('add')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-start whitespace-nowrap transition-colors ${
                tab === 'add'
                  ? 'bg-slate-200 dark:bg-[#404249] text-slate-950 dark:text-white'
                  : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>{t(language, 'addMembers')}</span>
            </button>
          )}
        </nav>

        <div className="flex-1 p-5 overflow-y-auto space-y-5">
          {tab === 'overview' && (
            <div className="space-y-5">
              {isOwner ? (
                <form onSubmit={handleSaveOverview} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <label className="relative cursor-pointer group shrink-0">
                      <GroupAvatar
                        src={iconPreview || undefined}
                        name={name || displayName}
                        size="lg"
                      />
                      <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                        <Upload className="w-4 h-4" />
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setIconFile(f);
                            setIconPreview(URL.createObjectURL(f));
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold mb-1">
                        {t(language, 'groupIconOptional')}
                      </div>
                      {iconPreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setIconFile(null);
                            setIconUrl('');
                            setIconPreview('');
                          }}
                          className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                        >
                          {t(language, 'removeIcon')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      {t(language, 'groupNameOptional')}
                    </label>
                    <input
                      type="text"
                      maxLength={LIMITS.GROUP_NAME_MAX}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t(language, 'groupNamePlaceholder')}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{t(language, 'save')}</span>
                  </button>
                </form>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#2B2D31] border border-slate-200 dark:border-white/10 flex items-center gap-3">
                  <GroupAvatar src={group.iconUrl} name={displayName} size="md" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{displayName}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400">
                      {t(language, 'roleOwner')}:{' '}
                      {usersById[group.ownerId]?.displayName || group.ownerId.slice(0, 8)}
                    </div>
                  </div>
                </div>
              )}

              {/* Notification Mute Toggle */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isMuted ? (
                    <BellOff className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <Bell className="w-4 h-4 text-nexus shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">
                    {isMuted ? t(language, 'unmuteGroup') : t(language, 'muteGroup')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isMuted
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
                      : 'bg-slate-100 dark:bg-[#1E1F22] hover:bg-slate-200 dark:hover:bg-white/10'
                  }`}
                >
                  {isMuted ? t(language, 'unmuteGroup') : t(language, 'muteGroup')}
                </button>
              </div>

              {/* Leave Group Section */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2.5">
                {!confirmLeave ? (
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-semibold transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t(language, 'leaveGroup')}</span>
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2.5">
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                      {t(language, 'leaveGroupConfirm')}
                    </p>
                    {isOwner && group.memberIds.length > 1 && (
                      <p className="text-[11px] text-rose-600/90 dark:text-rose-300/80">
                        {t(language, 'leaveGroupOwnerNotice')}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleLeave}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors"
                      >
                        {t(language, 'leaveGroup')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmLeave(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold"
                      >
                        {t(language, 'cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'members' && (
            <div className="space-y-2">
              {group.memberIds.map((memberId) => {
                const user = usersById[memberId];
                const isMemberOwner = memberId === group.ownerId;
                const isMe = memberId === publicUser.uid;
                const status = getEffectiveUserStatus(
                  user?.status,
                  user?.lastSeen?.toMillis?.(),
                  presenceNowMs
                );

                return (
                  <div
                    key={memberId}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#2B2D31] border border-slate-200/70 dark:border-white/5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        src={user?.avatarUrl}
                        name={user?.displayName || 'User'}
                        status={status}
                        size="sm"
                        showStatus
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">
                            {user?.displayName || memberId.slice(0, 8)}
                          </span>
                          {isMemberOwner && (
                            <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                          @{user?.username || memberId.slice(0, 6)}
                        </div>
                      </div>
                    </div>

                    {isOwner && !isMe && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {confirmTransferUid === memberId ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleTransfer(memberId)}
                              className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold"
                            >
                              {t(language, 'accept')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmTransferUid(null)}
                              className="px-2 py-1 rounded border border-slate-200 dark:border-white/10 text-[11px]"
                            >
                              {t(language, 'cancel')}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirmTransferUid(memberId)}
                              title={t(language, 'transferOwnership')}
                              className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                            >
                              <Crown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleKick(memberId)}
                              title={t(language, 'kickFromGroup')}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'add' && isOwner && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {t(language, 'groupFullLimit')} ({group.memberIds.length}/{LIMITS.GROUP_MEMBERS_MAX})
              </p>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder={t(language, 'searchFriendsPlaceholder')}
                  className="w-full ps-9 pe-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1E1F22] text-sm focus:outline-none focus:ring-2 focus:ring-nexus"
                />
              </div>

              <div className="space-y-1 max-h-56 overflow-y-auto">
                {availableFriendsToAdd.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500 dark:text-zinc-400">
                    {t(language, 'noFriendsAvailableToAdd')}
                  </p>
                ) : (
                  availableFriendsToAdd.map((friend) => {
                    const checked = selectedToAdd.includes(friend.uid);
                    const disabled = !checked && selectedToAdd.length >= remainingSlots;
                    return (
                      <button
                        key={friend.uid}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setSelectedToAdd((prev) =>
                            prev.includes(friend.uid)
                              ? prev.filter((id) => id !== friend.uid)
                              : [...prev, friend.uid]
                          )
                        }
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-start transition-colors ${
                          checked
                            ? 'bg-nexus/15 border border-nexus/40'
                            : 'hover:bg-slate-100 dark:hover:bg-[#2B2D31] border border-transparent'
                        } disabled:opacity-45`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar src={friend.avatarUrl} name={friend.displayName} size="sm" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{friend.displayName}</div>
                            <div className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                              @{friend.username}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-nexus border-nexus text-white'
                              : 'border-slate-300 dark:border-zinc-600'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                disabled={saving || selectedToAdd.length === 0}
                onClick={handleAddMembers}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-nexus hover:bg-nexus-hover disabled:opacity-50 text-white text-xs font-semibold transition-colors"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <UserPlus className="w-4 h-4" />
                <span>{t(language, 'addToGroup')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
