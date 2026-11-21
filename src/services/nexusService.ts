import {
  EmailAuthProvider,
  GoogleAuthProvider,
  TotpMultiFactorGenerator,
  deleteUser,
  multiFactor,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  verifyBeforeUpdateEmail,
  type TotpSecret,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type {
  AuditLog,
  BlockedUser,
  Channel,
  ChannelType,
  CustomStatusDuration,
  DirectCall,
  DirectMessageThread,
  DmPermission,
  FriendRequestPermission,
  Friendship,
  GroupDm,
  Invite,
  Language,
  PublicUser,
  Role,
  Server,
  ShortcutActionId,
  SystemMessageAction,
  ThemeMode,
  UserPrivate,
  UserSession,
  UserSettings,
  UserStatus,
} from '../types/nexus';
import {
  computeCustomStatusExpiryMs,
  extractInviteCode,
  extractMentions,
  generateInviteCode,
  getPairId,
  getReactionDocId,
  isValidHexColor,
  LIMITS,
  normalizeChannelSlug,
  sanitizeImageOrHttpsUrl,
  sanitizeMessageBody,
  sanitizeText,
} from '../utils/validation';

const inFlightProfileEnsures = new Map<string, Promise<PublicUser>>();

export function ensureUserProfile(
  firebaseUser: User,
  preferredUsername?: string,
  preferredDisplayName?: string
): Promise<PublicUser> {
  const uid = firebaseUser.uid;
  const existingPromise = inFlightProfileEnsures.get(uid);
  if (existingPromise) {
    return existingPromise;
  }

  const run = ensureUserProfileInternal(
    firebaseUser,
    preferredUsername,
    preferredDisplayName
  ).finally(() => {
    inFlightProfileEnsures.delete(uid);
  });

  inFlightProfileEnsures.set(uid, run);
  return run;
}

async function ensureUserProfileInternal(
  firebaseUser: User,
  preferredUsername?: string,
  preferredDisplayName?: string
): Promise<PublicUser> {
  const uid = firebaseUser.uid;
  const userDocRef = doc(db, 'users', uid);
  const publicDocRef = doc(db, 'publicUsers', uid);

  try {
    const [privSnap, pubSnap] = await Promise.all([
      getDoc(userDocRef),
      getDoc(publicDocRef),
    ]);

    if (privSnap.exists() && pubSnap.exists()) {
      const existingPub = pubSnap.data() as PublicUser;
      const targetStatus: UserStatus = existingPub.hideOnlineStatus ? 'offline' : 'online';
      await updateDoc(publicDocRef, {
        status: targetStatus,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (existingPub.usernameLower) {
        const resRef = doc(db, 'usernames', existingPub.usernameLower);
        const resSnap = await getDoc(resRef);
        if (!resSnap.exists()) {
          await setDoc(resRef, {
            uid,
            usernameLower: existingPub.usernameLower,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
      return { ...existingPub, status: targetStatus };
    }

    let cleanUsername = '';
    let candidateLower = '';
    let shouldWriteReservation = false;

    if (pubSnap.exists()) {
      const existingPub = pubSnap.data() as PublicUser;
      cleanUsername = existingPub.username;
      candidateLower = existingPub.usernameLower;
      const resSnap = await getDoc(doc(db, 'usernames', candidateLower));
      shouldWriteReservation = !resSnap.exists();
    } else {
      const baseRaw =
        preferredUsername ||
        firebaseUser.email?.split('@')[0] ||
        `user_${uid.slice(0, 6)}`;
      let baseClean = baseRaw
        .replace(/[^a-zA-Z0-9_.-]/g, '_')
        .slice(0, LIMITS.USERNAME_MAX - 7);
      if (baseClean.length < 2) {
        baseClean = `user_${uid.slice(0, 5)}`;
      }

      const candidates = [
        baseClean,
        `${baseClean}_${uid.slice(0, 4)}`,
        `${baseClean}_${uid.slice(0, 6)}`,
      ];

      let chosen = '';
      let chosenSnapExists = false;
      for (const cand of candidates) {
        const lower = cand.toLowerCase();
        const snap = await getDoc(doc(db, 'usernames', lower));
        if (!snap.exists() || snap.data()?.uid === uid) {
          chosen = cand;
          chosenSnapExists = snap.exists();
          break;
        }
      }

      if (!chosen) {
        const randSuffix = Math.random().toString(36).slice(2, 6);
        chosen = `user_${uid.slice(0, 6)}_${randSuffix}`.slice(0, LIMITS.USERNAME_MAX);
        const finalSnap = await getDoc(doc(db, 'usernames', chosen.toLowerCase()));
        chosenSnapExists = finalSnap.exists() && finalSnap.data()?.uid === uid;
      }

      cleanUsername = chosen;
      candidateLower = chosen.toLowerCase();
      shouldWriteReservation = !chosenSnapExists;
    }

    const displayName =
      sanitizeText(
        preferredDisplayName || firebaseUser.displayName || cleanUsername,
        LIMITS.DISPLAY_NAME_MAX
      ) || cleanUsername;

    const avatarUrl =
      firebaseUser.photoURL && firebaseUser.photoURL.startsWith('https://')
        ? firebaseUser.photoURL.slice(0, LIMITS.URL_MAX)
        : '';

    const rawEmail = (firebaseUser.email || `${uid}@nexus.local`).trim().slice(0, 254);
    const email = rawEmail.length >= 3 ? rawEmail : `${uid}@nexus.local`;

    const batch = writeBatch(db);

    if (!privSnap.exists()) {
      batch.set(userDocRef, {
        uid,
        email,
        theme: 'dark',
        language: 'ar',
        notificationsEnabled: true,
        soundEnabled: true,
        mentionsOnly: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (!pubSnap.exists()) {
      batch.set(publicDocRef, {
        uid,
        username: cleanUsername,
        usernameLower: candidateLower,
        displayName,
        avatarUrl,
        bio: '',
        status: 'online',
        isDiscoverable: true,
        profileVisible: true,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (shouldWriteReservation) {
      batch.set(doc(db, 'usernames', candidateLower), {
        uid,
        usernameLower: candidateLower,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();

    const finalPubSnap = await getDoc(publicDocRef);
    if (finalPubSnap.exists()) {
      return finalPubSnap.data() as PublicUser;
    }
    const nowTs = Timestamp.now();
    return {
      uid,
      username: cleanUsername,
      usernameLower: candidateLower,
      displayName,
      avatarUrl,
      bio: '',
      status: 'online',
      isDiscoverable: true,
      profileVisible: true,
      lastSeen: nowTs,
      updatedAt: nowTs,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function pingUserPresence(
  uid: string,
  status: UserStatus,
  hideOnlineStatus = false
): Promise<void> {
  try {
    await updateDoc(doc(db, 'publicUsers', uid), {
      status: hideOnlineStatus ? 'offline' : status,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Heartbeat failures are non-fatal and must never interrupt active voice sessions
    const code = (err as { code?: string })?.code;
    if (code && code !== 'not-found') {
      console.warn('[Presence] Heartbeat update failed (non-fatal):', code, err);
    }
  }
}

export async function updateUserSettings(
  uid: string,
  updates: Partial<Pick<UserPrivate, 'theme' | 'language' | 'notificationsEnabled' | 'soundEnabled' | 'mentionsOnly'>>
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'not-found' && auth.currentUser?.uid === uid) {
      try {
        await ensureUserProfile(auth.currentUser);
        await updateDoc(doc(db, 'users', uid), {
          ...updates,
          updatedAt: serverTimestamp(),
        });
        return;
      } catch (retryError) {
        handleFirestoreError(retryError, OperationType.UPDATE, path);
      }
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserProfile(
  uid: string,
  currentProfile: PublicUser,
  updates: {
    displayName: string;
    username: string;
    bio: string;
    avatarUrl: string;
    bannerUrl?: string;
    profileColor?: string;
    isDiscoverable?: boolean;
  }
): Promise<void> {
  const cleanDisplay = sanitizeText(updates.displayName, LIMITS.DISPLAY_NAME_MAX);
  const cleanUsername = sanitizeText(updates.username, LIMITS.USERNAME_MAX).replace(/[^a-zA-Z0-9_.-]/g, '');
  const cleanUsernameLower = cleanUsername.toLowerCase();
  const cleanBio = sanitizeText(updates.bio, LIMITS.BIO_MAX);
  const cleanAvatar = sanitizeImageOrHttpsUrl(updates.avatarUrl);
  const cleanBanner =
    updates.bannerUrl !== undefined
      ? sanitizeImageOrHttpsUrl(updates.bannerUrl)
      : sanitizeImageOrHttpsUrl(currentProfile.bannerUrl);
  const cleanColor =
    updates.profileColor !== undefined
      ? isValidHexColor(updates.profileColor)
        ? updates.profileColor
        : ''
      : currentProfile.profileColor || '';
  const nextDiscoverable =
    updates.isDiscoverable !== undefined ? updates.isDiscoverable : currentProfile.isDiscoverable;

  if (cleanUsername.length < LIMITS.USERNAME_MIN) {
    throw new Error('Username must be at least 2 characters (letters, numbers, _, ., -).');
  }
  if (!cleanDisplay) {
    throw new Error('Display name is required.');
  }

  const profilePayload = {
    username: cleanUsername,
    usernameLower: cleanUsernameLower,
    displayName: cleanDisplay,
    bio: cleanBio,
    avatarUrl: cleanAvatar,
    bannerUrl: cleanBanner,
    profileColor: cleanColor,
    isDiscoverable: nextDiscoverable,
    lastSeen: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    if (cleanUsernameLower !== currentProfile.usernameLower) {
      const targetResRef = doc(db, 'usernames', cleanUsernameLower);
      const oldResRef = currentProfile.usernameLower
        ? doc(db, 'usernames', currentProfile.usernameLower)
        : null;
      const [targetSnap, oldSnap] = await Promise.all([
        getDoc(targetResRef),
        oldResRef ? getDoc(oldResRef) : Promise.resolve(null),
      ]);
      if (targetSnap.exists() && targetSnap.data()?.uid !== uid) {
        throw new Error('That username is already taken.');
      }
      const batch = writeBatch(db);
      if (oldResRef && oldSnap?.exists() && oldSnap.data()?.uid === uid) {
        batch.delete(oldResRef);
      }
      if (!targetSnap.exists()) {
        batch.set(targetResRef, {
          uid,
          usernameLower: cleanUsernameLower,
          createdAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, 'publicUsers', uid), profilePayload);
      await batch.commit();
    } else {
      const targetResRef = doc(db, 'usernames', cleanUsernameLower);
      const targetSnap = await getDoc(targetResRef);
      if (!targetSnap.exists()) {
        const batch = writeBatch(db);
        batch.set(targetResRef, {
          uid,
          usernameLower: cleanUsernameLower,
          createdAt: serverTimestamp(),
        });
        batch.update(doc(db, 'publicUsers', uid), profilePayload);
        await batch.commit();
      } else {
        await updateDoc(doc(db, 'publicUsers', uid), profilePayload);
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already taken') ||
        error.message.includes('required') ||
        error.message.includes('at least 2 characters'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `publicUsers/${uid}`);
  }
}

export async function markChannelRead(uid: string, serverId: string, channelId: string): Promise<void> {
  const path = `users/${uid}/readStates/${channelId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'readStates', channelId), {
      channelId,
      userId: uid,
      serverId,
      lastReadAt: serverTimestamp(),
    });
  } catch {
    // Non-critical read-state sync
  }
}

export async function createServer(
  uid: string,
  profile: PublicUser,
  input: { name: string; description: string; iconUrl: string; isPublic: boolean }
): Promise<{ serverId: string; defaultChannelId: string }> {
  const name = sanitizeText(input.name, LIMITS.SERVER_NAME_MAX);
  const description = sanitizeText(input.description, LIMITS.SERVER_DESC_MAX);
  if (name.length < LIMITS.SERVER_NAME_MIN) {
    throw new Error('Server name must be at least 2 characters.');
  }

  const cleanIcon = sanitizeImageOrHttpsUrl(input.iconUrl);

  const serverRef = doc(collection(db, 'servers'));
  const serverId = serverRef.id;
  const generalRef = doc(collection(db, 'servers', serverId, 'channels'));
  const voiceRef = doc(collection(db, 'servers', serverId, 'channels'));

  try {
    const batch = writeBatch(db);
    batch.set(serverRef, {
      id: serverId,
      name,
      description,
      iconUrl: cleanIcon,
      ownerId: uid,
      isPublic: input.isPublic,
      defaultChannelId: generalRef.id,
      memberCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'servers', serverId, 'members', uid), {
      uid,
      serverId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || '',
      role: 'owner',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', uid, 'joinedServers', serverId), {
      serverId,
      userId: uid,
      serverName: name,
      serverIconUrl: cleanIcon,
      role: 'owner',
      joinedAt: serverTimestamp(),
    });

    batch.set(generalRef, {
      id: generalRef.id,
      serverId,
      name: 'general',
      topic: 'General community discussion',
      type: 'text',
      category: 'Text Channels',
      position: 0,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(voiceRef, {
      id: voiceRef.id,
      serverId,
      name: 'Lounge',
      topic: 'Voice chat room',
      type: 'voice',
      category: 'Voice Channels',
      position: 1,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    // Create default invite after membership is committed
    const inviteCode = generateInviteCode(8);
    await setDoc(doc(db, 'invites', inviteCode), {
      code: inviteCode,
      serverId,
      serverName: name,
      serverIconUrl: cleanIcon,
      createdBy: uid,
      uses: 0,
      maxUses: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { serverId, defaultChannelId: generalRef.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `servers/${serverId}`);
  }
}

export async function updateServer(
  serverId: string,
  updates: { name: string; description: string; iconUrl: string; isPublic: boolean }
): Promise<void> {
  const name = sanitizeText(updates.name, LIMITS.SERVER_NAME_MAX);
  const description = sanitizeText(updates.description, LIMITS.SERVER_DESC_MAX);
  if (name.length < LIMITS.SERVER_NAME_MIN) {
    throw new Error('Server name must be at least 2 characters.');
  }
  try {
    await updateDoc(doc(db, 'servers', serverId), {
      name,
      description,
      iconUrl: sanitizeImageOrHttpsUrl(updates.iconUrl),
      isPublic: updates.isPublic,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `servers/${serverId}`);
  }
}

export async function deleteServer(uid: string, serverId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'servers', serverId));
    batch.delete(doc(db, 'users', uid, 'joinedServers', serverId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `servers/${serverId}`);
  }
}

export async function createInvite(uid: string, server: Server, maxUses = 0): Promise<Invite> {
  const code = generateInviteCode(8);
  const path = `invites/${code}`;
  try {
    const payload = {
      code,
      serverId: server.id,
      serverName: server.name,
      serverIconUrl: server.iconUrl || '',
      createdBy: uid,
      uses: 0,
      maxUses,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'invites', code), payload);
    const snap = await getDoc(doc(db, 'invites', code));
    return snap.data() as Invite;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function revokeInvite(code: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'invites', code));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `invites/${code}`);
  }
}

export async function joinServerByInvite(
  uid: string,
  profile: PublicUser,
  rawInput: string
): Promise<string> {
  const code = extractInviteCode(rawInput);
  if (!code || code.length < 4) {
    throw new Error('Please enter a valid invite code or link.');
  }

  try {
    const inviteSnap = await getDoc(doc(db, 'invites', code));
    if (!inviteSnap.exists()) {
      throw new Error('Invite code not found or expired.');
    }
    const invite = inviteSnap.data() as Invite;
    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      throw new Error('This invite has reached its maximum uses.');
    }

    const existingMember = await getDoc(doc(db, 'servers', invite.serverId, 'members', uid));
    if (existingMember.exists()) {
      // Ensure joinedServers ref is present without violating create timestamp rules
      const joinedRef = doc(db, 'users', uid, 'joinedServers', invite.serverId);
      const joinedSnap = await getDoc(joinedRef);
      if (!joinedSnap.exists()) {
        await setDoc(joinedRef, {
          serverId: invite.serverId,
          userId: uid,
          serverName: invite.serverName,
          serverIconUrl: invite.serverIconUrl || '',
          role: existingMember.data().role,
          joinedAt: serverTimestamp(),
        });
      }
      return invite.serverId;
    }

    const serverSnap = await getDoc(doc(db, 'servers', invite.serverId));
    if (!serverSnap.exists()) {
      throw new Error('This server no longer exists.');
    }
    const server = serverSnap.data() as Server;

    const batch = writeBatch(db);
    batch.set(doc(db, 'servers', server.id, 'members', uid), {
      uid,
      serverId: server.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || '',
      role: 'member',
      joinedViaInvite: code,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid, 'joinedServers', server.id), {
      serverId: server.id,
      userId: uid,
      serverName: server.name,
      serverIconUrl: server.iconUrl || '',
      role: 'member',
      joinedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'servers', server.id), {
      memberCount: server.memberCount + 1,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'invites', code), {
      uses: invite.uses + 1,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return server.id;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Invite') ||
        error.message.includes('maximum') ||
        error.message.includes('no longer exists') ||
        error.message.includes('valid invite'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `invites/${code}`);
  }
}

export async function joinPublicServer(
  uid: string,
  profile: PublicUser,
  server: Server
): Promise<string> {
  try {
    const existingMember = await getDoc(doc(db, 'servers', server.id, 'members', uid));
    if (existingMember.exists()) {
      return server.id;
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'servers', server.id, 'members', uid), {
      uid,
      serverId: server.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || '',
      role: 'member',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid, 'joinedServers', server.id), {
      serverId: server.id,
      userId: uid,
      serverName: server.name,
      serverIconUrl: server.iconUrl || '',
      role: 'member',
      joinedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'servers', server.id), {
      memberCount: server.memberCount + 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return server.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `servers/${server.id}/members/${uid}`);
  }
}

export async function leaveServer(uid: string, server: Server): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'servers', server.id, 'members', uid));
    batch.delete(doc(db, 'users', uid, 'joinedServers', server.id));
    batch.update(doc(db, 'servers', server.id), {
      memberCount: Math.max(1, server.memberCount - 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `servers/${server.id}/members/${uid}`);
  }
}

export async function cleanupStaleJoinedServer(uid: string, serverId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'joinedServers', serverId));
  } catch {
    // Ignore cleanup errors
  }
}

export async function createChannel(
  uid: string,
  serverId: string,
  input: { name: string; topic: string; type: ChannelType; category: string; position: number }
): Promise<Channel> {
  const cleanName =
    input.type === 'text'
      ? normalizeChannelSlug(input.name)
      : sanitizeText(input.name, LIMITS.CHANNEL_NAME_MAX) || 'voice';
  const cleanTopic = sanitizeText(input.topic, LIMITS.CHANNEL_TOPIC_MAX);
  const cleanCategory =
    sanitizeText(input.category, LIMITS.CATEGORY_MAX) ||
    (input.type === 'text' ? 'Text Channels' : 'Voice Channels');

  const chRef = doc(collection(db, 'servers', serverId, 'channels'));
  try {
    await setDoc(chRef, {
      id: chRef.id,
      serverId,
      name: cleanName,
      topic: cleanTopic,
      type: input.type,
      category: cleanCategory,
      position: input.position,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(chRef);
    return snap.data() as Channel;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `servers/${serverId}/channels/${chRef.id}`);
  }
}

export async function updateChannel(
  serverId: string,
  channelId: string,
  type: ChannelType,
  updates: { name: string; topic: string; category: string }
): Promise<void> {
  const cleanName =
    type === 'text'
      ? normalizeChannelSlug(updates.name)
      : sanitizeText(updates.name, LIMITS.CHANNEL_NAME_MAX) || 'voice';
  const cleanTopic = sanitizeText(updates.topic, LIMITS.CHANNEL_TOPIC_MAX);
  const cleanCategory = sanitizeText(updates.category, LIMITS.CATEGORY_MAX) || 'General';
  try {
    await updateDoc(doc(db, 'servers', serverId, 'channels', channelId), {
      name: cleanName,
      topic: cleanTopic,
      category: cleanCategory,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `servers/${serverId}/channels/${channelId}`);
  }
}

export async function deleteChannel(serverId: string, channelId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'servers', serverId, 'channels', channelId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `servers/${serverId}/channels/${channelId}`);
  }
}

export async function sendChannelMessage(
  serverId: string,
  channelId: string,
  author: { uid: string; displayName: string; avatarUrl?: string; role: Role },
  payload: {
    content: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    replyTo?: { id: string; author: string; content: string } | null;
  }
): Promise<void> {
  const content = sanitizeMessageBody(payload.content);
  if (!content && !payload.attachmentUrl) return;

  const msgRef = doc(collection(db, 'servers', serverId, 'channels', channelId, 'messages'));
  const mentions = extractMentions(content);

  try {
    const batch = writeBatch(db);
    batch.set(msgRef, {
      id: msgRef.id,
      channelId,
      serverId,
      authorId: author.uid,
      authorName: author.displayName,
      authorAvatar: author.avatarUrl || '',
      authorRole: author.role,
      content,
      ...(payload.attachmentUrl
        ? {
            attachmentUrl: payload.attachmentUrl,
            attachmentName: sanitizeText(payload.attachmentName || 'file', 256),
            attachmentType: sanitizeText(payload.attachmentType || 'application/octet-stream', 128),
          }
        : {}),
      ...(payload.replyTo
        ? {
            replyToId: payload.replyTo.id,
            replyToAuthor: sanitizeText(payload.replyTo.author, 64),
            replyToContent: sanitizeText(payload.replyTo.content || '[Attachment]', 240),
          }
        : {}),
      mentions,
      edited: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'servers', serverId, 'channels', channelId), {
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `servers/${serverId}/channels/${channelId}/messages/${msgRef.id}`
    );
  }
}

export async function editChannelMessage(
  serverId: string,
  channelId: string,
  messageId: string,
  newContent: string
): Promise<void> {
  const content = sanitizeMessageBody(newContent);
  if (!content) return;
  try {
    await updateDoc(doc(db, 'servers', serverId, 'channels', channelId, 'messages', messageId), {
      content,
      mentions: extractMentions(content),
      edited: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `servers/${serverId}/channels/${channelId}/messages/${messageId}`
    );
  }
}

export async function deleteChannelMessage(
  serverId: string,
  channelId: string,
  messageId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'servers', serverId, 'channels', channelId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `servers/${serverId}/channels/${channelId}/messages/${messageId}`
    );
  }
}

export async function toggleChannelReaction(
  serverId: string,
  channelId: string,
  messageId: string,
  userId: string,
  emoji: string,
  alreadyReacted: boolean
): Promise<void> {
  const reactionId = getReactionDocId(userId, messageId, emoji);
  const ref = doc(db, 'servers', serverId, 'channels', channelId, 'reactions', reactionId);
  try {
    if (alreadyReacted) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        id: reactionId,
        messageId,
        userId,
        emoji: emoji.slice(0, 16),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      alreadyReacted ? OperationType.DELETE : OperationType.CREATE,
      `servers/${serverId}/channels/${channelId}/reactions/${reactionId}`
    );
  }
}

export async function setChannelTyping(
  serverId: string,
  channelId: string,
  userId: string,
  displayName: string,
  isTyping: boolean
): Promise<void> {
  const ref = doc(db, 'servers', serverId, 'channels', channelId, 'typing', userId);
  try {
    if (isTyping) {
      await setDoc(ref, {
        userId,
        displayName: sanitizeText(displayName, 64),
        updatedAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(ref);
    }
  } catch {
    // Non-critical typing indicator
  }
}

export async function updateMemberRole(
  serverId: string,
  targetUid: string,
  role: Exclude<Role, 'owner'>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'servers', serverId, 'members', targetUid), {
      role,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `servers/${serverId}/members/${targetUid}`);
  }
}

export async function kickMember(server: Server, targetUid: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'servers', server.id, 'members', targetUid));
    batch.update(doc(db, 'servers', server.id), {
      memberCount: Math.max(1, server.memberCount - 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `servers/${server.id}/members/${targetUid}`);
  }
}

export async function banMember(
  server: Server,
  targetUid: string,
  bannedBy: string,
  reason = ''
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'servers', server.id, 'bans', targetUid), {
      uid: targetUid,
      serverId: server.id,
      bannedBy,
      reason: sanitizeText(reason, 240),
      createdAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'servers', server.id, 'members', targetUid));
    batch.update(doc(db, 'servers', server.id), {
      memberCount: Math.max(1, server.memberCount - 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `servers/${server.id}/bans/${targetUid}`);
  }
}

export async function unbanMember(serverId: string, targetUid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'servers', serverId, 'bans', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `servers/${serverId}/bans/${targetUid}`);
  }
}

export async function findUserByUsername(usernameInput: string): Promise<PublicUser | null> {
  const clean = usernameInput.trim().replace(/^@/, '').toLowerCase();
  if (!clean || clean.length < 2) return null;
  try {
    const resSnap = await getDoc(doc(db, 'usernames', clean));
    if (!resSnap.exists()) return null;
    const targetUid = resSnap.data().uid as string;
    const pubSnap = await getDoc(doc(db, 'publicUsers', targetUid));
    return pubSnap.exists() ? (pubSnap.data() as PublicUser) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `usernames/${clean}`);
  }
}

export async function checkUsernameAvailability(usernameInput: string): Promise<'available' | 'taken' | 'unknown'> {
  const clean = usernameInput.trim().replace(/^@/, '').toLowerCase();
  if (!clean || clean.length < 2) return 'unknown';
  try {
    const resSnap = await getDoc(doc(db, 'usernames', clean));
    return resSnap.exists() ? 'taken' : 'available';
  } catch {
    return 'unknown';
  }
}

export async function sendFriendRequest(requesterId: string, targetUsername: string): Promise<void> {
  const targetUser = await findUserByUsername(targetUsername);
  if (!targetUser) {
    throw new Error('No user found with that username.');
  }
  if (targetUser.uid === requesterId) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const blockSnap = await getDoc(doc(db, 'users', requesterId, 'blockedUsers', targetUser.uid));
  if (blockSnap.exists()) {
    throw new Error('USER_IS_BLOCKED');
  }

  const perm = targetUser.friendRequestPermission || 'everyone';
  if (perm === 'nobody') {
    throw new Error('FRIEND_REQUEST_RESTRICTED');
  }
  if (perm === 'friends_of_friends') {
    const joinedSnap = await getDocs(collection(db, 'users', requesterId, 'joinedServers'));
    let hasMutual = false;
    for (const sDoc of joinedSnap.docs) {
      const mSnap = await getDoc(doc(db, 'servers', sDoc.id, 'members', targetUser.uid));
      if (mSnap.exists()) {
        hasMutual = true;
        break;
      }
    }
    if (!hasMutual) {
      throw new Error('FRIEND_REQUEST_RESTRICTED');
    }
  }

  const friendshipId = getPairId(requesterId, targetUser.uid);
  const fRef = doc(db, 'friendships', friendshipId);
  let currentOp = OperationType.GET;
  try {
    const existingSnap = await getDoc(fRef);
    if (existingSnap.exists()) {
      const data = existingSnap.data() as Friendship;
      if (data.status === 'accepted') {
        throw new Error('You are already friends with this user.');
      }
      if (data.status === 'pending') {
        throw new Error('A friend request is already pending.');
      }
      // If previously declined, delete first so requester can re-send cleanly
      currentOp = OperationType.DELETE;
      await deleteDoc(fRef);
    }

    currentOp = OperationType.CREATE;
    await setDoc(fRef, {
      id: friendshipId,
      participants: [requesterId, targetUser.uid].sort(),
      requesterId,
      recipientId: targetUser.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already') ||
        error.message.includes('not found') ||
        error.message.includes('yourself') ||
        error.message === 'USER_IS_BLOCKED' ||
        error.message === 'FRIEND_REQUEST_RESTRICTED')
    ) {
      throw error;
    }
    handleFirestoreError(error, currentOp, `friendships/${friendshipId}`);
  }
}

export async function respondFriendRequest(
  friendshipId: string,
  accept: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'friendships', friendshipId), {
      status: accept ? 'accepted' : 'declined',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `friendships/${friendshipId}`);
  }
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friendships/${friendshipId}`);
  }
}

export async function getOrCreateDmThread(uidA: string, uidB: string): Promise<DirectMessageThread> {
  const dmId = getPairId(uidA, uidB);
  const dmRef = doc(db, 'dms', dmId);
  try {
    const snap = await getDoc(dmRef);
    if (snap.exists()) {
      return snap.data() as DirectMessageThread;
    }

    const [blockSnap, targetPubSnap] = await Promise.all([
      getDoc(doc(db, 'users', uidA, 'blockedUsers', uidB)),
      getDoc(doc(db, 'publicUsers', uidB)),
    ]);
    if (blockSnap.exists()) {
      throw new Error('USER_IS_BLOCKED');
    }
    if (targetPubSnap.exists()) {
      const targetPub = targetPubSnap.data() as PublicUser;
      if (targetPub.dmPermission === 'friends_only') {
        const fSnap = await getDoc(doc(db, 'friendships', getPairId(uidA, uidB)));
        if (!fSnap.exists() || (fSnap.data() as Friendship).status !== 'accepted') {
          throw new Error('DM_FRIENDS_ONLY');
        }
      }
    }

    await setDoc(dmRef, {
      id: dmId,
      participants: [uidA, uidB].sort(),
      lastMessagePreview: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const createdSnap = await getDoc(dmRef);
    return createdSnap.data() as DirectMessageThread;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'USER_IS_BLOCKED' || error.message === 'DM_FRIENDS_ONLY')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `dms/${dmId}`);
  }
}

export async function sendDmMessage(
  dmId: string,
  author: PublicUser,
  payload: {
    content: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    replyTo?: { id: string; author: string; content: string } | null;
  }
): Promise<void> {
  const content = sanitizeMessageBody(payload.content);
  if (!content && !payload.attachmentUrl) return;

  const msgRef = doc(collection(db, 'dms', dmId, 'messages'));
  try {
    const batch = writeBatch(db);
    batch.set(msgRef, {
      id: msgRef.id,
      dmId,
      authorId: author.uid,
      authorName: author.displayName,
      authorAvatar: author.avatarUrl || '',
      content,
      ...(payload.attachmentUrl
        ? {
            attachmentUrl: payload.attachmentUrl,
            attachmentName: sanitizeText(payload.attachmentName || 'file', 256),
            attachmentType: sanitizeText(payload.attachmentType || 'application/octet-stream', 128),
          }
        : {}),
      ...(payload.replyTo
        ? {
            replyToId: payload.replyTo.id,
            replyToAuthor: sanitizeText(payload.replyTo.author, 64),
            replyToContent: sanitizeText(payload.replyTo.content || '[Attachment]', 240),
          }
        : {}),
      edited: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'dms', dmId), {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: sanitizeText(content || payload.attachmentName || 'Attachment', 160),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `dms/${dmId}/messages/${msgRef.id}`);
  }
}

export async function editDmMessage(
  dmId: string,
  messageId: string,
  newContent: string
): Promise<void> {
  const content = sanitizeMessageBody(newContent);
  if (!content) return;
  try {
    await updateDoc(doc(db, 'dms', dmId, 'messages', messageId), {
      content,
      edited: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `dms/${dmId}/messages/${messageId}`);
  }
}

export async function deleteDmMessage(dmId: string, messageId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'dms', dmId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `dms/${dmId}/messages/${messageId}`);
  }
}

export async function toggleDmReaction(
  dmId: string,
  messageId: string,
  userId: string,
  emoji: string,
  alreadyReacted: boolean
): Promise<void> {
  const reactionId = getReactionDocId(userId, messageId, emoji);
  const ref = doc(db, 'dms', dmId, 'reactions', reactionId);
  try {
    if (alreadyReacted) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        id: reactionId,
        messageId,
        userId,
        emoji: emoji.slice(0, 16),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      alreadyReacted ? OperationType.DELETE : OperationType.CREATE,
      `dms/${dmId}/reactions/${reactionId}`
    );
  }
}

export async function setDmTyping(
  dmId: string,
  userId: string,
  displayName: string,
  isTyping: boolean
): Promise<void> {
  const ref = doc(db, 'dms', dmId, 'typing', userId);
  try {
    if (isTyping) {
      await setDoc(ref, {
        userId,
        displayName: sanitizeText(displayName, 64),
        updatedAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(ref);
    }
  } catch {
    // Non-critical typing indicator
  }
}

export async function searchPublicServers(searchQuery: string): Promise<Server[]> {
  try {
    const q = query(
      collection(db, 'servers'),
      where('isPublic', '==', true),
      limit(50)
    );
    const snap = await getDocs(q);
    const all = snap.docs
      .map((d) => d.data() as Server)
      .sort((a, b) => b.memberCount - a.memberCount);
    const term = searchQuery.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        (s.description || '').toLowerCase().includes(term)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'servers');
  }
}

export async function searchDiscoverableUsers(searchQuery: string): Promise<PublicUser[]> {
  try {
    const q = query(
      collection(db, 'publicUsers'),
      where('isDiscoverable', '==', true),
      limit(40)
    );
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => d.data() as PublicUser);
    const term = searchQuery.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (u) =>
        u.usernameLower.includes(term) ||
        u.displayName.toLowerCase().includes(term)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'publicUsers');
  }
}

export function resolveThemeMode(theme: ThemeMode): 'dark' | 'light' {
  return theme === 'warm' || theme === 'royal' ? 'light' : 'dark';
}

export function applyDocumentThemeAndDirection(theme: ThemeMode, language: Language) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = resolveThemeMode(theme);
  root.setAttribute('data-theme', theme);
  root.style.setProperty('color-scheme', resolved);
  root.setAttribute('data-theme-mode', resolved);
  const themeColor =
    theme === 'warm'
      ? '#FFF6EB'
      : theme === 'royal'
      ? '#F9FCFF'
      : theme === 'forest'
      ? '#162A2C'
      : theme === 'ocean'
      ? '#323D42'
      : '#07192D';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeColor);
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.dir = language === 'ar' ? 'rtl' : 'ltr';
  root.lang = language;
  document.title =
    language === 'ar'
      ? 'مجلس — مجتمعات الدردشة الفورية والصوت'
      : 'MAJLIS — Real-Time Chat & Voice Communities';
}

export async function logAuditAction(
  serverId: string,
  actorId: string,
  actorName: string,
  action: AuditLog['action'],
  targetName?: string,
  details?: string
): Promise<void> {
  const auditRef = doc(collection(db, 'servers', serverId, 'auditLogs'));
  try {
    await setDoc(auditRef, {
      id: auditRef.id,
      serverId,
      actorId,
      actorName,
      action,
      targetName: targetName || '',
      details: details || '',
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-critical audit logging
  }
}

export async function checkUserInActiveCall(userId: string): Promise<boolean> {
  try {
    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', userId),
      where('status', 'in', ['ringing', 'active']),
      limit(5)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch {
    return false;
  }
}

export async function startDmCall(
  dmId: string,
  caller: PublicUser,
  recipientOrParticipants: PublicUser | string[],
  type: 'audio' | 'video',
  options?: { isGroup?: boolean; groupName?: string }
): Promise<string> {
  const isCallerBusy = await checkUserInActiveCall(caller.uid);
  if (isCallerBusy) {
    throw new Error('ALREADY_IN_CALL');
  }

  const participants = Array.isArray(recipientOrParticipants)
    ? Array.from(new Set([caller.uid, ...recipientOrParticipants])).slice(0, LIMITS.GROUP_MEMBERS_MAX)
    : [caller.uid, recipientOrParticipants.uid];

  if (participants.length < 2) {
    throw new Error('At least 2 participants are required for a call.');
  }

  const callRef = doc(collection(db, 'calls'));
  const callId = callRef.id;

  try {
    await setDoc(callRef, {
      id: callId,
      dmId,
      callerId: caller.uid,
      callerName: caller.displayName,
      callerAvatar: caller.avatarUrl || '',
      participants,
      activeParticipants: [caller.uid],
      type,
      status: 'ringing',
      ...(options?.isGroup
        ? {
            isGroup: true,
            groupName: sanitizeText(options.groupName || '', LIMITS.GROUP_NAME_MAX),
          }
        : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return callId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `calls/${callId}`);
    throw error;
  }
}

export async function respondDmCall(
  callId: string,
  accept: boolean,
  responderUid: string
): Promise<void> {
  try {
    const callRef = doc(db, 'calls', callId);
    if (accept) {
      await updateDoc(callRef, {
        status: 'active',
        startedAt: serverTimestamp(),
        activeParticipants: arrayUnion(responderUid),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(callRef, {
        status: 'declined',
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `calls/${callId}`);
  }
}

export async function endDmCall(
  callId: string,
  dmId: string,
  author: PublicUser,
  durationSeconds: number = 0,
  reason: 'ended' | 'missed' | 'declined' = 'ended'
): Promise<void> {
  try {
    const callRef = doc(db, 'calls', callId);
    const snap = await getDoc(callRef);
    if (!snap.exists()) return;
    const data = snap.data() as DirectCall;
    if (
      data.status === 'ended' ||
      data.status === 'missed' ||
      data.status === 'declined' ||
      data.status === 'busy'
    ) {
      return;
    }

    await updateDoc(callRef, {
      status: reason,
      endedAt: serverTimestamp(),
      durationSeconds: durationSeconds || 0,
      updatedAt: serverTimestamp(),
    });

    let systemContent = '';
    if (reason === 'missed') {
      systemContent = '📞 مكالمة فائتة · Missed call';
    } else if (reason === 'declined') {
      systemContent = '📞 تم رفض المكالمة · Call declined';
    } else if (durationSeconds > 0) {
      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;
      const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      systemContent = `📞 انتهت المكالمة — مدتها ${durStr} · Call ended — ${durStr}`;
    } else {
      systemContent = '📞 انتهت المكالمة · Call ended';
    }

    if (data.isGroup) {
      await sendGroupMessage(dmId, author, {
        content: systemContent,
        isSystem: true,
        systemAction: 'call',
      });
    } else {
      await sendDmMessage(dmId, author, { content: systemContent });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `calls/${callId}`);
  }
}

export async function addParticipantToCall(callId: string, newParticipantUid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'calls', callId), {
      participants: arrayUnion(newParticipantUid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `calls/${callId}`);
  }
}

// ============================================================================
// Group DM Operations
// ============================================================================

export async function createGroupDm(
  creator: PublicUser,
  input: { name: string; iconUrl: string; memberUids: string[] }
): Promise<GroupDm> {
  const uniqueOthers = Array.from(
    new Set(input.memberUids.filter((id) => id && id !== creator.uid))
  ).slice(0, 9);

  if (uniqueOthers.length < 2) {
    throw new Error('Select at least 2 friends to create a group.');
  }

  const memberIds = [creator.uid, ...uniqueOthers];
  const cleanName = sanitizeText(input.name || '', LIMITS.GROUP_NAME_MAX);
  const cleanIcon = sanitizeImageOrHttpsUrl(input.iconUrl);

  const groupRef = doc(collection(db, 'groups'));
  const groupId = groupRef.id;

  try {
    await setDoc(groupRef, {
      id: groupId,
      name: cleanName,
      iconUrl: cleanIcon,
      ownerId: creator.uid,
      memberIds,
      lastMessagePreview: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await sendGroupMessage(groupId, creator, {
      content: `${creator.displayName} أنشأ المجموعة`,
      isSystem: true,
      systemAction: 'created',
    });

    const snap = await getDoc(groupRef);
    return snap.data() as GroupDm;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groups/${groupId}`);
  }
}

export async function sendGroupMessage(
  groupId: string,
  author: PublicUser,
  payload: {
    content: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    replyTo?: { id: string; author: string; content: string } | null;
    isSystem?: boolean;
    systemAction?: SystemMessageAction;
    systemTargetName?: string;
  }
): Promise<void> {
  const content = sanitizeMessageBody(payload.content);
  if (!content && !payload.attachmentUrl) return;

  const msgRef = doc(collection(db, 'groups', groupId, 'messages'));
  const mentions = payload.isSystem ? [] : extractMentions(content);

  try {
    const batch = writeBatch(db);
    batch.set(msgRef, {
      id: msgRef.id,
      groupId,
      authorId: author.uid,
      authorName: author.displayName,
      authorAvatar: author.avatarUrl || '',
      content,
      ...(payload.isSystem ? { isSystem: true } : {}),
      ...(payload.systemAction ? { systemAction: payload.systemAction } : {}),
      ...(payload.systemTargetName
        ? { systemTargetName: sanitizeText(payload.systemTargetName, 80) }
        : {}),
      ...(payload.attachmentUrl
        ? {
            attachmentUrl: payload.attachmentUrl,
            attachmentName: sanitizeText(payload.attachmentName || 'file', 256),
            attachmentType: sanitizeText(payload.attachmentType || 'application/octet-stream', 128),
          }
        : {}),
      ...(payload.replyTo
        ? {
            replyToId: payload.replyTo.id,
            replyToAuthor: sanitizeText(payload.replyTo.author, 64),
            replyToContent: sanitizeText(payload.replyTo.content || '[Attachment]', 240),
          }
        : {}),
      mentions,
      edited: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'groups', groupId), {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: sanitizeText(content || payload.attachmentName || 'Attachment', 160),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groups/${groupId}/messages/${msgRef.id}`);
  }
}

export async function editGroupMessage(
  groupId: string,
  messageId: string,
  newContent: string
): Promise<void> {
  const content = sanitizeMessageBody(newContent);
  if (!content) return;
  try {
    await updateDoc(doc(db, 'groups', groupId, 'messages', messageId), {
      content,
      mentions: extractMentions(content),
      edited: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}/messages/${messageId}`);
  }
}

export async function deleteGroupMessage(groupId: string, messageId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'groups', groupId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}/messages/${messageId}`);
  }
}

export async function toggleGroupReaction(
  groupId: string,
  messageId: string,
  userId: string,
  emoji: string,
  alreadyReacted: boolean
): Promise<void> {
  const reactionId = getReactionDocId(userId, messageId, emoji);
  const ref = doc(db, 'groups', groupId, 'reactions', reactionId);
  try {
    if (alreadyReacted) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        id: reactionId,
        messageId,
        userId,
        emoji: emoji.slice(0, 16),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      alreadyReacted ? OperationType.DELETE : OperationType.CREATE,
      `groups/${groupId}/reactions/${reactionId}`
    );
  }
}

export async function setGroupTyping(
  groupId: string,
  userId: string,
  displayName: string,
  isTyping: boolean
): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'typing', userId);
  try {
    if (isTyping) {
      await setDoc(ref, {
        userId,
        displayName: sanitizeText(displayName, 64),
        updatedAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(ref);
    }
  } catch {
    // Non-critical typing indicator
  }
}

export async function updateGroupSettings(
  group: GroupDm,
  actor: PublicUser,
  updates: { name: string; iconUrl: string }
): Promise<void> {
  const nextName = sanitizeText(updates.name, LIMITS.GROUP_NAME_MAX);
  const nextIcon = sanitizeImageOrHttpsUrl(updates.iconUrl);

  const nameChanged = nextName !== (group.name || '');
  const iconChanged = nextIcon !== (group.iconUrl || '');

  try {
    await updateDoc(doc(db, 'groups', group.id), {
      name: nextName,
      iconUrl: nextIcon,
      updatedAt: serverTimestamp(),
    });

    if (nameChanged) {
      await sendGroupMessage(group.id, actor, {
        content: nextName ? `تم تغيير اسم المجموعة إلى ${nextName}` : 'تم مسح اسم المجموعة',
        isSystem: true,
        systemAction: 'renamed_group',
        systemTargetName: nextName || '—',
      });
    } else if (iconChanged) {
      await sendGroupMessage(group.id, actor, {
        content: 'تم تحديث صورة المجموعة',
        isSystem: true,
        systemAction: 'changed_icon',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${group.id}`);
  }
}

export async function addGroupMembers(
  group: GroupDm,
  actor: PublicUser,
  newMembers: PublicUser[]
): Promise<void> {
  const existingSet = new Set(group.memberIds);
  const toAdd = newMembers.filter((u) => !existingSet.has(u.uid));
  if (toAdd.length === 0) return;

  const nextMemberIds = [...group.memberIds, ...toAdd.map((u) => u.uid)].slice(
    0,
    LIMITS.GROUP_MEMBERS_MAX
  );

  try {
    await updateDoc(doc(db, 'groups', group.id), {
      memberIds: nextMemberIds,
      updatedAt: serverTimestamp(),
    });

    const addedCount = nextMemberIds.length - group.memberIds.length;
    for (const member of toAdd.slice(0, addedCount)) {
      await sendGroupMessage(group.id, actor, {
        content: `${actor.displayName} أضاف ${member.displayName}`,
        isSystem: true,
        systemAction: 'added_member',
        systemTargetName: member.displayName,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${group.id}`);
  }
}

export async function kickGroupMember(
  group: GroupDm,
  actor: PublicUser,
  targetUid: string,
  targetDisplayName: string
): Promise<void> {
  if (targetUid === group.ownerId) return;
  const nextMemberIds = group.memberIds.filter((id) => id !== targetUid);

  try {
    await updateDoc(doc(db, 'groups', group.id), {
      memberIds: nextMemberIds,
      updatedAt: serverTimestamp(),
    });

    await sendGroupMessage(group.id, actor, {
      content: `${actor.displayName} طرد ${targetDisplayName}`,
      isSystem: true,
      systemAction: 'removed_member',
      systemTargetName: targetDisplayName,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${group.id}`);
  }
}

export async function transferGroupOwnership(
  group: GroupDm,
  actor: PublicUser,
  newOwnerUid: string,
  newOwnerDisplayName: string
): Promise<void> {
  if (!group.memberIds.includes(newOwnerUid) || newOwnerUid === group.ownerId) return;

  try {
    await updateDoc(doc(db, 'groups', group.id), {
      ownerId: newOwnerUid,
      updatedAt: serverTimestamp(),
    });

    await sendGroupMessage(group.id, actor, {
      content: `${actor.displayName} نقل الملكية إلى ${newOwnerDisplayName}`,
      isSystem: true,
      systemAction: 'transferred_owner',
      systemTargetName: newOwnerDisplayName,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${group.id}`);
  }
}

export async function leaveGroupDm(group: GroupDm, actor: PublicUser): Promise<void> {
  const remaining = group.memberIds.filter((id) => id !== actor.uid);

  try {
    if (remaining.length === 0) {
      await deleteDoc(doc(db, 'groups', group.id));
      return;
    }

    // Write system message while still a member before removing from memberIds
    await sendGroupMessage(group.id, actor, {
      content: `${actor.displayName} غادر المجموعة`,
      isSystem: true,
      systemAction: 'left_group',
    });

    const isOwner = group.ownerId === actor.uid;
    await updateDoc(doc(db, 'groups', group.id), {
      memberIds: remaining,
      ...(isOwner ? { ownerId: remaining[0] } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${group.id}`);
  }
}

export async function toggleMuteGroup(
  uid: string,
  groupId: string,
  muted: boolean
): Promise<void> {
  const ref = doc(db, 'users', uid, 'mutedGroups', groupId);
  try {
    if (muted) {
      await setDoc(ref, {
        groupId,
        muted: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(ref);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/mutedGroups/${groupId}`);
  }
}

export async function markConversationRead(
  scope: 'dm' | 'group',
  conversationId: string,
  userId: string,
  lastReadMessageId: string
): Promise<void> {
  if (!conversationId || !userId || !lastReadMessageId) return;
  const colName = scope === 'dm' ? 'dms' : 'groups';
  const ref = doc(db, colName, conversationId, 'readReceipts', userId);
  try {
    await setDoc(ref, {
      userId,
      lastReadMessageId,
      lastReadAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical read receipt update
  }
}

// ============================================================================
// Detailed User Settings, Privacy, Security, Sessions & Data Management
// ============================================================================

export const APP_VERSION = '2.4.0';

export const DEFAULT_SHORTCUTS: Record<ShortcutActionId, string> = {
  quickSwitcher: 'Ctrl+K',
  toggleSidebar: 'Ctrl+B',
  toggleMute: 'Ctrl+M',
  toggleDeafen: 'Ctrl+D',
  openSettings: 'Ctrl+Comma',
};

export function createDefaultUserSettings(uid: string): UserSettings {
  const detectedTz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh'
      : 'Asia/Riyadh';
  return {
    uid,
    themeMode: 'basic',
    accentPreset: 'indigo',
    customAccentHex: '#5865F2',
    fontSize: 'normal',
    density: 'comfortable',
    messageStyle: 'normal',
    avatarShape: 'circle',
    reducedMotion: false,
    notificationMode: 'all',
    soundEnabled: true,
    notificationSound: 'classic',
    notificationVolume: 80,
    dndScheduleEnabled: false,
    dndStartHour: 23,
    dndEndHour: 7,
    serverNotifications: {},
    channelMutes: {},
    audioInputId: 'default',
    audioOutputId: 'default',
    videoInputId: 'default',
    voiceSensitivityAuto: true,
    voiceSensitivityThreshold: 40,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    outputVolume: 100,
    cameraQuality: '720p',
    pushToTalkEnabled: false,
    pushToTalkKey: 'Space',
    friendRequestPermission: 'everyone',
    dmPermission: 'server_members',
    hideOnlineStatus: false,
    profileVisible: true,
    language: 'ar',
    timeFormat: '12h',
    timezone: detectedTz.slice(0, 64),
    calendar: 'gregory',
    autoPreviewLinks: true,
    autoEmoji: true,
    showQuickReply: true,
    showTypingIndicators: true,
    confirmExternalLinks: true,
    highContrast: false,
    reduceTransparency: false,
    largeControls: false,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    vpnCompatibilityMode: false,
    sessionRevokedBeforeMs: 0,
  };
}

export async function saveDetailedUserSettings(
  uid: string,
  base: UserSettings,
  partial: Partial<UserSettings>
): Promise<UserSettings> {
  const defaults = createDefaultUserSettings(uid);
  const raw: UserSettings = {
    ...defaults,
    ...base,
    ...partial,
    uid,
  };

  const merged: UserSettings = {
    uid,
    themeMode:
      raw.themeMode === 'warm' ||
      raw.themeMode === 'royal' ||
      raw.themeMode === 'forest' ||
      raw.themeMode === 'ocean'
        ? raw.themeMode
        : 'basic',
    accentPreset: String(raw.accentPreset || 'indigo').slice(0, 16) as UserSettings['accentPreset'],
    customAccentHex: isValidHexColor(raw.customAccentHex) ? raw.customAccentHex : '#5865F2',
    fontSize: raw.fontSize,
    density: raw.density,
    messageStyle: raw.messageStyle,
    avatarShape: raw.avatarShape,
    reducedMotion: Boolean(raw.reducedMotion),
    notificationMode: raw.notificationMode,
    soundEnabled: Boolean(raw.soundEnabled),
    notificationSound: raw.notificationSound,
    notificationVolume: Math.max(0, Math.min(100, Math.round(raw.notificationVolume ?? 80))),
    dndScheduleEnabled: Boolean(raw.dndScheduleEnabled),
    dndStartHour: Math.max(0, Math.min(23, Math.round(raw.dndStartHour ?? 23))),
    dndEndHour: Math.max(0, Math.min(23, Math.round(raw.dndEndHour ?? 7))),
    serverNotifications: raw.serverNotifications || {},
    channelMutes: raw.channelMutes || {},
    audioInputId: String(raw.audioInputId || 'default').slice(0, 256),
    audioOutputId: String(raw.audioOutputId || 'default').slice(0, 256),
    videoInputId: String(raw.videoInputId || 'default').slice(0, 256),
    voiceSensitivityAuto: Boolean(raw.voiceSensitivityAuto),
    voiceSensitivityThreshold: Math.max(
      0,
      Math.min(100, Math.round(raw.voiceSensitivityThreshold ?? 40))
    ),
    noiseSuppression: Boolean(raw.noiseSuppression),
    echoCancellation: Boolean(raw.echoCancellation),
    autoGainControl: Boolean(raw.autoGainControl),
    outputVolume: Math.max(0, Math.min(200, Math.round(raw.outputVolume ?? 100))),
    cameraQuality: raw.cameraQuality,
    pushToTalkEnabled: Boolean(raw.pushToTalkEnabled),
    pushToTalkKey: String(raw.pushToTalkKey || 'Space').slice(0, 32),
    friendRequestPermission: raw.friendRequestPermission,
    dmPermission: raw.dmPermission,
    hideOnlineStatus: Boolean(raw.hideOnlineStatus),
    profileVisible: raw.profileVisible !== false,
    language: raw.language,
    timeFormat: raw.timeFormat,
    timezone: String(raw.timezone || 'UTC').slice(0, 64),
    calendar: raw.calendar,
    autoPreviewLinks: Boolean(raw.autoPreviewLinks),
    autoEmoji: Boolean(raw.autoEmoji),
    showQuickReply: Boolean(raw.showQuickReply),
    showTypingIndicators: Boolean(raw.showTypingIndicators),
    confirmExternalLinks: Boolean(raw.confirmExternalLinks),
    highContrast: Boolean(raw.highContrast),
    reduceTransparency: Boolean(raw.reduceTransparency),
    largeControls: Boolean(raw.largeControls),
    shortcuts: { ...DEFAULT_SHORTCUTS, ...(raw.shortcuts || {}) },
    vpnCompatibilityMode: Boolean(raw.vpnCompatibilityMode),
    sessionRevokedBeforeMs: Math.max(0, Math.round(raw.sessionRevokedBeforeMs ?? 0)),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'settings', 'preferences'), {
      ...merged,
      updatedAt: serverTimestamp(),
    });

    // Keep core UserPrivate preferences mirrored cleanly
    const legacyUpdates: Partial<
      Pick<UserPrivate, 'theme' | 'language' | 'notificationsEnabled' | 'soundEnabled' | 'mentionsOnly'>
    > = {};
    if (partial.themeMode !== undefined) {
      legacyUpdates.theme = resolveThemeMode(merged.themeMode);
    }
    if (partial.language !== undefined) {
      legacyUpdates.language = merged.language;
    }
    if (partial.notificationMode !== undefined) {
      legacyUpdates.notificationsEnabled = merged.notificationMode !== 'none';
      legacyUpdates.mentionsOnly = merged.notificationMode === 'mentions';
    }
    if (partial.soundEnabled !== undefined) {
      legacyUpdates.soundEnabled = merged.soundEnabled;
    }
    if (Object.keys(legacyUpdates).length > 0) {
      await updateUserSettings(uid, legacyUpdates);
    }

    return merged;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/settings/preferences`);
  }
}

export async function updateCustomStatus(
  uid: string,
  emoji: string,
  text: string,
  duration: CustomStatusDuration
): Promise<void> {
  const cleanText = sanitizeText(text, 80);
  const cleanEmoji = sanitizeText(emoji, 16);
  const expiresAtMs =
    !cleanText && !cleanEmoji ? 0 : Math.round(computeCustomStatusExpiryMs(duration));

  const payload = {
    customStatusText: cleanText,
    customStatusEmoji: cleanEmoji,
    customStatusExpiresAtMs: expiresAtMs,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'publicUsers', uid), payload);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'not-found' && auth.currentUser?.uid === uid) {
      try {
        await ensureUserProfile(auth.currentUser);
        await updateDoc(doc(db, 'publicUsers', uid), payload);
        return;
      } catch (retryError) {
        handleFirestoreError(retryError, OperationType.UPDATE, `publicUsers/${uid}`);
      }
    }
    handleFirestoreError(error, OperationType.UPDATE, `publicUsers/${uid}`);
  }
}

export async function updatePrivacySettings(
  uid: string,
  updates: {
    hideOnlineStatus: boolean;
    friendRequestPermission: FriendRequestPermission;
    dmPermission: DmPermission;
    profileVisible: boolean;
  },
  activePresenceTarget: UserStatus = 'online'
): Promise<void> {
  const payload = {
    hideOnlineStatus: updates.hideOnlineStatus,
    friendRequestPermission: updates.friendRequestPermission,
    dmPermission: updates.dmPermission,
    profileVisible: updates.profileVisible,
    status: updates.hideOnlineStatus ? 'offline' : activePresenceTarget,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'publicUsers', uid), payload);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'not-found' && auth.currentUser?.uid === uid) {
      try {
        await ensureUserProfile(auth.currentUser);
        await updateDoc(doc(db, 'publicUsers', uid), payload);
        return;
      } catch (retryError) {
        handleFirestoreError(retryError, OperationType.UPDATE, `publicUsers/${uid}`);
      }
    }
    handleFirestoreError(error, OperationType.UPDATE, `publicUsers/${uid}`);
  }
}

export async function blockUser(myUid: string, target: PublicUser): Promise<void> {
  if (!target.uid || target.uid === myUid) return;
  try {
    await setDoc(doc(db, 'users', myUid, 'blockedUsers', target.uid), {
      uid: target.uid,
      username: sanitizeText(target.username || 'user', 32),
      displayName: sanitizeText(target.displayName || target.username || 'User', 64),
      avatarUrl: target.avatarUrl || '',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${myUid}/blockedUsers/${target.uid}`);
  }
}

export async function unblockUser(myUid: string, targetUid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', myUid, 'blockedUsers', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${myUid}/blockedUsers/${targetUid}`);
  }
}

export function getOrCreateLocalSessionId(): string {
  const key = 'nexus_device_session_id';
  let id = localStorage.getItem(key);
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    id = 'sess_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, id);
  }
  return id;
}

export function getLocalSessionCreatedAtMs(): number {
  const key = 'nexus_device_session_created_ms';
  const raw = localStorage.getItem(key);
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  const now = Date.now();
  localStorage.setItem(key, String(now));
  return now;
}

export function detectBrowserAndDevice(): { deviceName: string; browser: string; platform: string } {
  if (typeof navigator === 'undefined') {
    return { deviceName: 'Web Browser', browser: 'Unknown', platform: 'Web' };
  }
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Google Chrome';
  else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  let platform = 'Desktop';
  if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS';
  else if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) platform = 'macOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';

  return {
    deviceName: `${browser} · ${platform}`,
    browser,
    platform,
  };
}

export async function registerCurrentSession(uid: string): Promise<string> {
  const sessionId = getOrCreateLocalSessionId();
  const createdAtMs = getLocalSessionCreatedAtMs();
  const info = detectBrowserAndDevice();
  const ref = doc(db, 'users', uid, 'sessions', sessionId);
  try {
    const existingSnap = await getDoc(ref);
    await setDoc(ref, {
      id: sessionId,
      userId: uid,
      deviceName: info.deviceName.slice(0, 128),
      browser: info.browser.slice(0, 64),
      platform: info.platform.slice(0, 64),
      createdAtMs: existingSnap.exists()
        ? Math.round((existingSnap.data() as UserSession).createdAtMs || createdAtMs)
        : createdAtMs,
      lastActiveAt: serverTimestamp(),
      createdAt: existingSnap.exists()
        ? (existingSnap.data() as UserSession).createdAt
        : serverTimestamp(),
    });
  } catch {
    // Non-critical session registration
  }
  return sessionId;
}

export async function revokeSingleSession(uid: string, sessionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'sessions', sessionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/sessions/${sessionId}`);
  }
}

export async function revokeAllOtherSessions(
  uid: string,
  currentSessionId: string,
  settings: UserSettings
): Promise<UserSettings> {
  const now = Date.now();
  // Preserve current device session timestamp so signing out *other* devices doesn't log out the current browser
  if (currentSessionId && typeof localStorage !== 'undefined') {
    localStorage.setItem('nexus_device_session_created_ms', String(now));
  }
  const snap = await getDocs(collection(db, 'users', uid, 'sessions'));
  const batch = writeBatch(db);
  for (const d of snap.docs) {
    if (d.id !== currentSessionId) {
      batch.delete(d.ref);
    }
  }
  await batch.commit();

  // Record revocation timestamp so any other active tab/device signs out immediately
  return saveDetailedUserSettings(uid, settings, {
    sessionRevokedBeforeMs: now,
  });
}

// ============================================================================
// Firebase Auth Security Actions (Reauth, Password, Email, 2FA, Delete Account)
// ============================================================================

export async function reauthenticateCurrentUser(currentPassword?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');

  const providerIds = user.providerData.map((p) => p.providerId);
  if (providerIds.includes('password') && user.email) {
    if (!currentPassword) {
      throw new Error('PASSWORD_REQUIRED');
    }
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    return;
  }
  if (providerIds.includes('google.com')) {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
    return;
  }
  throw new Error('Unsupported auth provider for reauthentication.');
}

export async function changeUserPassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await reauthenticateCurrentUser(currentPassword);
  await updatePassword(user, newPassword);
}

export async function changeUserEmail(currentPassword: string, newEmail: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await reauthenticateCurrentUser(currentPassword);
  await verifyBeforeUpdateEmail(user, newEmail.trim());
}

export function getEnrolledMfaFactors() {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    return multiFactor(user).enrolledFactors;
  } catch {
    return [];
  }
}

export async function startTotpMfaEnrollment(currentPassword?: string): Promise<{
  secret: TotpSecret;
  qrUrl: string;
  secretKey: string;
}> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  try {
    if (currentPassword || user.providerData.some((p) => p.providerId === 'google.com')) {
      await reauthenticateCurrentUser(currentPassword);
    }
    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    const qrUrl = secret.generateQrCodeUrl(user.email || user.uid, 'Majlis');
    return { secret, qrUrl, secretKey: secret.secretKey };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/operation-not-allowed' ||
      code === 'auth/admin-restricted-operation' ||
      code === 'auth/unsupported-first-factor'
    ) {
      throw new Error('MFA_NOT_ENABLED_ON_PROJECT');
    }
    if (code === 'auth/requires-recent-login') {
      throw new Error('REAUTH_REQUIRED');
    }
    throw err;
  }
}

export async function finalizeTotpMfaEnrollment(
  secret: TotpSecret,
  verificationCode: string,
  displayName = 'Authenticator App'
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
    secret,
    verificationCode.trim()
  );
  await multiFactor(user).enroll(assertion, sanitizeText(displayName, 48));
}

export async function unenrollMfaFactor(factorUid: string, currentPassword?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  try {
    await multiFactor(user).unenroll(factorUid);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/requires-recent-login') {
      await reauthenticateCurrentUser(currentPassword);
      await multiFactor(user).unenroll(factorUid);
      return;
    }
    throw err;
  }
}

export async function deleteMyAccountAndData(
  uid: string,
  publicUser: PublicUser | null,
  currentPassword?: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Not signed in.');

  try {
    if (currentPassword || user.providerData.some((p) => p.providerId === 'google.com')) {
      await reauthenticateCurrentUser(currentPassword);
    }

    const subCols = ['settings', 'sessions', 'blockedUsers', 'readStates', 'mutedGroups', 'joinedServers'];
    for (const sub of subCols) {
      const snap = await getDocs(collection(db, 'users', uid, sub));
      for (const d of snap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    }

    if (publicUser?.usernameLower) {
      await deleteDoc(doc(db, 'usernames', publicUser.usernameLower)).catch(() => {});
    }
    await deleteDoc(doc(db, 'publicUsers', uid)).catch(() => {});
    await deleteDoc(doc(db, 'users', uid)).catch(() => {});

    await deleteUser(user);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/requires-recent-login') {
      throw new Error('REAUTH_REQUIRED');
    }
    throw err;
  }
}

export async function exportAllMyUserData(uid: string): Promise<Record<string, unknown>> {
  const [
    privSnap,
    pubSnap,
    settingsSnap,
    joinedSnap,
    blockedSnap,
    sessionsSnap,
    friendsSnap,
    dmsSnap,
    groupsSnap,
  ] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'publicUsers', uid)),
    getDoc(doc(db, 'users', uid, 'settings', 'preferences')),
    getDocs(collection(db, 'users', uid, 'joinedServers')),
    getDocs(collection(db, 'users', uid, 'blockedUsers')),
    getDocs(collection(db, 'users', uid, 'sessions')),
    getDocs(query(collection(db, 'friendships'), where('participants', 'array-contains', uid))),
    getDocs(query(collection(db, 'dms'), where('participants', 'array-contains', uid))),
    getDocs(query(collection(db, 'groups'), where('memberIds', 'array-contains', uid))),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    account: privSnap.exists() ? privSnap.data() : null,
    profile: pubSnap.exists() ? pubSnap.data() : null,
    settings: settingsSnap.exists() ? settingsSnap.data() : null,
    joinedServers: joinedSnap.docs.map((d) => d.data()),
    blockedUsers: blockedSnap.docs.map((d) => d.data()),
    activeSessions: sessionsSnap.docs.map((d) => d.data()),
    friendships: friendsSnap.docs.map((d) => d.data()),
    directMessageThreads: dmsSnap.docs.map((d) => d.data()),
    groupDms: groupsSnap.docs.map((d) => d.data()),
  };
}

export async function submitProblemReport(
  uid: string,
  input: { category: string; subject: string; description: string }
): Promise<void> {
  const cleanCategory = sanitizeText(input.category || 'bug', 48);
  const cleanSubject = sanitizeText(input.subject, 120);
  const cleanDesc = sanitizeText(input.description, 2000);
  if (cleanSubject.length < 2 || cleanDesc.length < 5) {
    throw new Error('INVALID_REPORT');
  }
  const ref = doc(collection(db, 'problemReports'));
  try {
    await setDoc(ref, {
      id: ref.id,
      userId: uid,
      category: cleanCategory,
      subject: cleanSubject,
      description: cleanDesc,
      appVersion: APP_VERSION,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `problemReports/${ref.id}`);
  }
}

export function clearAppLocalCacheAndReload(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('nexus_') && k !== 'nexus_device_session_id' && k !== 'nexus_device_session_created_ms') {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  window.location.reload();
}
