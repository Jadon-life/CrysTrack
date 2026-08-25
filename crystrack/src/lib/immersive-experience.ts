export type CeremonyBlock = 'morning' | 'evening' | 'night';

const ENABLED_KEY = 'crystrack-immersive-intros-enabled-v1';
const PREF_EVENT = 'crystrack-immersive-pref-changed';
const PREVIEW_EVENT = 'crystrack-immersive-preview-v2';
const CEREMONY_VERSION = 'crystrack-ceremony-v2';

export function immersiveIntrosEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(ENABLED_KEY) !== '0';
}

export function setImmersiveIntrosEnabled(value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ENABLED_KEY, value ? '1' : '0');
  window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: value }));
}

export function subscribeImmersiveIntroPreference(listener: (value: boolean) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const onChange = (event: Event) => {
    const custom = event as CustomEvent<boolean>;
    listener(typeof custom.detail === 'boolean' ? custom.detail : immersiveIntrosEnabled());
  };
  window.addEventListener(PREF_EVENT, onChange);
  return () => window.removeEventListener(PREF_EVENT, onChange);
}

export function previewImmersiveCeremony(block: CeremonyBlock) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: block }));
}

export function subscribeImmersivePreview(listener: (block: CeremonyBlock) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const onPreview = (event: Event) => {
    const block = (event as CustomEvent<CeremonyBlock>).detail;
    if (block === 'morning' || block === 'evening' || block === 'night') listener(block);
  };
  window.addEventListener(PREVIEW_EVENT, onPreview);
  return () => window.removeEventListener(PREVIEW_EVENT, onPreview);
}

export function ceremonyBlockForPhase(phase: string): CeremonyBlock | null {
  if (phase === 'morning') return 'morning';
  if (phase === 'golden' || phase === 'evening') return 'evening';
  if (phase === 'night') return 'night';
  return null;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ceremonySeenKey(userKey: string, block: CeremonyBlock, dateKey?: string) {
  const safeUser = userKey || 'anonymous';
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey || '') ? dateKey : localDateKey();
  return `${CEREMONY_VERSION}:${safeUser}:${safeDate}:${block}`;
}

export function ceremonyWasSeen(userKey: string, block: CeremonyBlock, dateKey?: string) {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(ceremonySeenKey(userKey, block, dateKey)) === '1';
}

export function markCeremonySeen(userKey: string, block: CeremonyBlock, dateKey?: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ceremonySeenKey(userKey, block, dateKey), '1');
}

type NetworkNavigator = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
  deviceMemory?: number;
};

export function shouldUseLiteCeremony(reducedMotion: boolean) {
  if (typeof navigator === 'undefined') return reducedMotion;
  const nav = navigator as NetworkNavigator;
  const cores = navigator.hardwareConcurrency || 8;
  const memory = nav.deviceMemory || 8;
  const verySlowNetwork = ['slow-2g', '2g'].includes(nav.connection?.effectiveType || '');
  // Four-core / ~4 GB machines can render these CSS ceremonies. The old <=4
  // threshold incorrectly downgraded a large class of normal PCs to a blink.
  return reducedMotion || verySlowNetwork || cores <= 2 || memory <= 2;
}
