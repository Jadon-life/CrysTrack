'use client';

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

export async function registerCrysTrackServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported by this browser');
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function enablePushNotifications(): Promise<{ ok: boolean; permission: NotificationPermission | 'unsupported'; error?: string }> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, permission: 'unsupported', error: 'Push notifications are not supported on this browser.' };
  }

  let permission = Notification.permission;
  if (permission !== 'granted') permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, permission, error: 'Notification permission was not granted.' };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, permission, error: 'CrysTrack push is not configured yet.' };

  try {
    const registration = await registerCrysTrackServiceWorker();
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Unable to save push subscription');
    return { ok: true, permission };
  } catch (error: any) {
    return { ok: false, permission, error: error?.message || 'Unable to enable reminders.' };
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
