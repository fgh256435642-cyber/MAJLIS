# Majlis Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation**: User emails and private settings in `/users/{userId}` can ONLY be read and written by `request.auth.uid == userId`. Public profiles in `/publicUsers/{userId}` contain zero PII.
2. **Server Access Containment**: Private servers (`isPublic == false`) and ALL server subcollections (`channels`, `messages`, `reactions`, `typing`, `voiceParticipants`, `voiceSignals`, `members`, `bans`) are strictly inaccessible to non-members.
3. **Ban Enforcement**: A user listed in `/servers/{serverId}/bans/{uid}` cannot join `/servers/{serverId}/members/{uid}`.
4. **Role Integrity & RBAC**: Users cannot self-assign `owner`, `admin`, or `moderator` when joining a server via invite (`role` must be `'member'`). Only the server owner or authorized admins can promote/demote roles, kick, or ban.
5. **Author Immutability**: Messages (`authorId`), invites (`createdBy`), friendships (`requesterId`), and servers (`ownerId`) cannot have their identity/ownership fields forged on create or altered on update.
6. **Temporal Integrity**: All `createdAt`, `updatedAt`, `joinedAt` timestamps must match `request.time`.
7. **Input Boundaries**: All IDs match `^[a-zA-Z0-9_\-]+$` with length <= 128 (or <= 260 for composite DM/friendship IDs). All string fields have strict `.size()` caps.
8. **DM & Friendship Isolation**: Only the 2 UIDs inside `participants` can read or write a friendship or DM thread and its messages.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **PII Leak (`GET /users/victimUid`)**: Attacker attempts to read another user's private settings & email. Expected: `PERMISSION_DENIED`.
2. **Ghost Field Injection (`CREATE /servers/s1/channels/c1/messages/m1`)**: Attacker includes an undeclared field `isSystemAdmin: true`. Expected: `PERMISSION_DENIED`.
3. **Role Self-Escalation (`CREATE /servers/s1/members/attackerUid`)**: Attacker joins server with `role: 'owner'` or `role: 'admin'`. Expected: `PERMISSION_DENIED`.
4. **Author Spoofing (`CREATE /servers/s1/channels/c1/messages/m2`)**: Attacker sends message with `authorId: 'victimUid'`. Expected: `PERMISSION_DENIED`.
5. **Non-Member Snooping (`LIST /servers/privateServer/channels/c1/messages`)**: Non-member queries messages of a private server. Expected: `PERMISSION_DENIED`.
6. **Banned User Rejoin (`CREATE /servers/s1/members/bannedUid`)**: Banned user tries to rejoin via valid invite code. Expected: `PERMISSION_DENIED`.
7. **Timestamp Forgery (`CREATE /servers/s1/channels/c1/messages/m3`)**: Attacker sets `createdAt` to a past timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
8. **ID Poisoning (`CREATE /servers/../../../../etc/passwd`)**: Attacker uses invalid characters or >128-char ID. Expected: `PERMISSION_DENIED`.
9. **DM Eavesdropping (`GET /dms/alice_bob/messages/m1`)**: Third user `charlie` attempts to read Alice & Bob's DM. Expected: `PERMISSION_DENIED`.
10. **Friend Request Auto-Accept (`CREATE /friendships/f1`)**: Requester tries to create a friendship directly with `status: 'accepted'`. Expected: `PERMISSION_DENIED`.
11. **Non-Owner Server Delete (`DELETE /servers/s1`)**: Admin or Member attempts to delete the server. Expected: `PERMISSION_DENIED`.
12. **Unverified Email Write (`CREATE /servers/s1`)**: User with `email_verified: false` tries to create a server. Expected: `PERMISSION_DENIED`.
