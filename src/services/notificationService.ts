export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface MajlisNotificationPayload {
  kind: 'dm' | 'channel' | 'group';
  serverId?: string;
  channelId?: string;
  dmId?: string;
  groupId?: string;
}

export interface ShowWebNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  payload?: MajlisNotificationPayload;
  onClick?: () => void;
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
const clickHandlers = new Map<string, () => void>();
let messageListenerAttached = false;

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export function ensureServiceWorkerMessageListener(
  onNavigate?: (payload: MajlisNotificationPayload) => void
) {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    messageListenerAttached
  ) {
    return;
  }
  messageListenerAttached = true;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as
      | { type?: string; payload?: MajlisNotificationPayload }
      | undefined;
    if (data?.type === 'MAJLIS_NOTIFICATION_CLICK' && data.payload) {
      onNavigate?.(data.payload);
    }
  });
}

export async function getOrRegisterNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw-notifications.js')
      .then(async (reg) => {
        try {
          await navigator.serviceWorker.ready;
        } catch {
          // Ignore ready race
        }
        return reg;
      })
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      void getOrRegisterNotificationWorker();
    }
    return result;
  } catch {
    return getNotificationPermission();
  }
}

export async function showWebNotification({
  title,
  body,
  icon,
  tag,
  payload,
  onClick,
}: ShowWebNotificationOptions): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const safeBody = body.trim().slice(0, 220);
  const notifTag = tag || `majlis-${Date.now()}`;

  if (onClick) {
    clickHandlers.set(notifTag, onClick);
  }

  // Prefer active Service Worker registration for background reliability
  try {
    const reg = await getOrRegisterNotificationWorker();
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(title, {
        body: safeBody,
        icon: icon || undefined,
        tag: notifTag,
        data: payload,
      });
      return true;
    }
  } catch {
    // Fall back to window Notification constructor
  }

  try {
    const notification = new Notification(title, {
      body: safeBody,
      icon: icon || undefined,
      tag: notifTag,
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore focus restriction
      }
      const handler = clickHandlers.get(notifTag);
      handler?.();
      notification.close();
    };
    notification.onclose = () => {
      clickHandlers.delete(notifTag);
    };
    return true;
  } catch {
    return false;
  }
}
