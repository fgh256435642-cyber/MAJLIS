/**
 * Nexus Firestore Security Rules Verification Suite (Phase 0 Dirty Dozen Spec)
 * Defines adversarial payloads and expected PERMISSION_DENIED outcomes for
 * the Firestore Emulator test runner (`@firebase/rules-unit-testing`).
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'PII Leak: Read another user private settings',
    operation: 'get',
    path: 'users/victimUid',
    authUid: 'attackerUid',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Ghost Field Injection on Message',
    operation: 'create',
    path: 'servers/s1/channels/c1/messages/m1',
    authUid: 'memberUid',
    emailVerified: true,
    payload: {
      id: 'm1',
      channelId: 'c1',
      serverId: 's1',
      authorId: 'memberUid',
      authorName: 'Member',
      authorRole: 'member',
      content: 'hello',
      edited: false,
      isSystemAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Role Self-Escalation on Server Join',
    operation: 'create',
    path: 'servers/s1/members/attackerUid',
    authUid: 'attackerUid',
    emailVerified: true,
    payload: {
      uid: 'attackerUid',
      serverId: 's1',
      username: 'attacker',
      displayName: 'Attacker',
      role: 'owner',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Author Spoofing on Message',
    operation: 'create',
    path: 'servers/s1/channels/c1/messages/m2',
    authUid: 'attackerUid',
    emailVerified: true,
    payload: {
      id: 'm2',
      channelId: 'c1',
      serverId: 's1',
      authorId: 'victimUid',
      authorName: 'Victim',
      authorRole: 'owner',
      content: 'spoofed',
      edited: false,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Non-Member Snooping Private Server Messages',
    operation: 'list',
    path: 'servers/privateServer/channels/c1/messages',
    authUid: 'outsiderUid',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Banned User Rejoin Attempt',
    operation: 'create',
    path: 'servers/s1/members/bannedUid',
    authUid: 'bannedUid',
    emailVerified: true,
    payload: {
      uid: 'bannedUid',
      serverId: 's1',
      username: 'banned',
      displayName: 'Banned',
      role: 'member',
      joinedViaInvite: 'VALIDCODE',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Timestamp Forgery on Message',
    operation: 'create',
    path: 'servers/s1/channels/c1/messages/m3',
    authUid: 'memberUid',
    emailVerified: true,
    payload: {
      id: 'm3',
      channelId: 'c1',
      serverId: 's1',
      authorId: 'memberUid',
      authorName: 'Member',
      authorRole: 'member',
      content: 'backdated',
      edited: false,
      createdAt: new Date('2020-01-01T00:00:00Z'),
      updatedAt: new Date('2020-01-01T00:00:00Z'),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID Poisoning on Server Create',
    operation: 'create',
    path: 'servers/bad..id',
    authUid: 'attackerUid',
    emailVerified: true,
    payload: { id: 'bad..id', name: 'Bad', ownerId: 'attackerUid', isPublic: false, memberCount: 1 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'DM Eavesdropping by Third Party',
    operation: 'get',
    path: 'dms/alice_bob/messages/m1',
    authUid: 'charlieUid',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Friend Request Auto-Accept on Create',
    operation: 'create',
    path: 'friendships/alice_bob',
    authUid: 'aliceUid',
    emailVerified: true,
    payload: {
      id: 'alice_bob',
      participants: ['aliceUid', 'bobUid'],
      requesterId: 'aliceUid',
      recipientId: 'bobUid',
      status: 'accepted',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Non-Owner Server Delete',
    operation: 'delete',
    path: 'servers/s1',
    authUid: 'adminUid',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unverified Email Write',
    operation: 'create',
    path: 'servers/s2',
    authUid: 'unverifiedUid',
    emailVerified: false,
    payload: { id: 's2', name: 'Unverified Server', ownerId: 'unverifiedUid', isPublic: false, memberCount: 1 },
    expected: 'PERMISSION_DENIED',
  },
];
