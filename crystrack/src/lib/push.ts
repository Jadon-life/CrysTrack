'use client';

export type PushSetupStatus =
  | 'unsupported'
  | 'permission-required'
  | 'permission-denied'
  | 'subscription-missing'
  | 'subscription-unsynced'
  | 'subscribed';

export interface PushSetupResult {
  ok: boolean;
  permission: NotificationPermission | 'unsupported';
  status: PushSetupStatus;
  error?: string;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function pushSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function registerCrysTrackServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported by this browser');
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Unable to save push subscription');
}

async function serverHasSubscription(endpoint: string) {
  const response = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { cache: 'no-store' });
  if (!response.ok) return false;
  const data = await response.json().catch(() => null);
  return Boolean(data?.active);
}

export async function getPushSetupStatus(): Promise<PushSetupResult> {
  if (!pushSupported()) {
    return { ok: false, permission: 'unsupported', status: 'unsupported', error: 'Push notifications are not supported on this browser.' };
  }

  const permission = Notification.permission;
  if (permission === 'denied') {
    return { ok: false, permission, status: 'permission-denied', error: 'Notifications are blocked in your browser settings.' };
  }
  if (permission !== 'granted') {
    return { ok: false, permission, status: 'permission-required' };
  }

  try {
    const registration = await registerCrysTrackServiceWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { ok: false, permission, status: 'subscription-missing' };

    if (await serverHasSubscription(subscription.endpoint)) {
      return { ok: true, permission, status: 'subscribed' };
    }

    try {
      await saveSubscription(subscription);
      return { ok: true, permission, status: 'subscribed' };
    } catch {
      return {
        ok: false,
        permission,
        status: 'subscription-unsynced',
        error: 'This browser has a push subscription, but CrysTrack could not sync it to your account.',
      };
    }
  } catch (error: any) {
    return {
      ok: false,
      permission,
      status: 'subscription-missing',
      error: error?.message || 'Unable to inspect push setup.',
    };
  }
}

export async function enablePushNotifications(): Promise<PushSetupResult> {
  if (!pushSupported()) {
    return { ok: false, permission: 'unsupported', status: 'unsupported', error: 'Push notifications are not supported on this browser.' };
  }

  let permission = Notification.permission;
  if (permission !== 'granted') permission = await Notification.requestPermission();

  if (permission === 'denied') {
    return { ok: false, permission, status: 'permission-denied', error: 'Notifications are blocked in your browser settings.' };
  }
  if (permission !== 'granted') {
    return { ok: false, permission, status: 'permission-required', error: 'Notification permission was not granted.' };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { ok: false, permission, status: 'subscription-missing', error: 'CrysTrack push is not configured yet.' };
  }

  try {
    const registration = await registerCrysTrackServiceWorker();
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await saveSubscription(subscription);
    return { ok: true, permission, status: 'subscribed' };
  } catch (error: any) {
    const browserMessage = error?.name === 'AbortError'
      ? 'The browser push service could not register this device. Check the browser push-messaging setting and try again.'
      : error?.message || 'Unable to enable reminders.';

    return { ok: false, permission, status: 'subscription-missing', error: browserMessage };
  }
}

export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => null);
  await subscription.unsubscribe();
}
