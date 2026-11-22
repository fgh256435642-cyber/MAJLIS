# Majlis — Firebase Configuration & Setup Guide

## 1. Provisioned Config (`firebase-applet-config.json`)
Your Firebase project is already provisioned in `firebase-applet-config.json`. If deploying to your own custom Firebase project, replace `firebase-applet-config.json` using this structure:

```json
{
  "projectId": "YOUR_FIREBASE_PROJECT_ID",
  "appId": "YOUR_FIREBASE_APP_ID",
  "apiKey": "YOUR_FIREBASE_API_KEY",
  "authDomain": "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
  "firestoreDatabaseId": "(default)",
  "storageBucket": "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
  "messagingSenderId": "YOUR_MESSAGING_SENDER_ID"
}
```

## 2. Authentication Providers
- **Google Sign-In**: Enabled automatically for this project.
- **Email / Password**: To enable Email/Password sign-up & login, open Firebase Console &rarr; **Authentication** &rarr; **Sign-in method** &rarr; enable **Email/Password**. New email/password accounts receive a verification email before entering the workspace.

## 3. Firestore Security Rules
`firestore.rules` enforces:
- Strict PII isolation (`/users/{userId}` owner-only vs. `/publicUsers/{userId}` public profile)
- Server membership containment (private servers & subcollections require membership in `/servers/{serverId}/members/{uid}`)
- Role-based access control (`owner`, `admin`, `moderator`, `member`)
- Ban enforcement (`/servers/{serverId}/bans/{uid}` blocks re-joining)
- Input length & schema validation matching `firebase-blueprint.json`
- A bounded Firestore fallback for message attachments when Firebase Storage is unavailable: non-image files up to 400 KB and compressed images within the existing 200,000-character data URL limit.

Deploy the current `firestore.rules` after updating it in Firebase Console under **Firestore Database** &rarr; **Rules**. The small-file fallback will not work with older deployed rules.

## 4. Firebase Storage (Avatars, Server Icons & Chat Attachments)
To enable file/image uploads in Firebase Storage:
1. Open Firebase Console &rarr; **Storage** &rarr; **Get Started**.
2. Deploy the rules from `storage.rules` in the root of this repository.

Firebase Storage requires the Blaze billing plan. If billing is not enabled, chat can use the Firestore fallback for files up to 400 KB after the updated Firestore rules are deployed.

## 5. WebRTC Voice Channels
Voice channels use peer-to-peer WebRTC (`RTCPeerConnection`) with STUN signaling stored ephemerally in `/servers/{serverId}/channels/{channelId}/voiceSignals` and live participant presence in `voiceParticipants`. Ensure microphone permissions are granted in the browser when joining a voice channel.
