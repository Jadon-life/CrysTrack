export type CeremonyBlock = 'morning' | 'evening' | 'night';

const ENABLED_KEY = 'crystrack-immersive-intros-enabled-v1';
const PREF_EVENT = 'crystrack-immersive-pref-changed';

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

export function ceremonySeenKey(userKey: string, block: CeremonyBlock, date = new Date()) {
  const safeUser = userKey || 'anonymous';
  return `crystrack-ceremony-v1:${safeUser}:${localDateKey(date)}:${block}`;
}

export function ceremonyWasSeen(userKey: string, block: CeremonyBlock) {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(ceremonySeenKey(userKey, block)) === '1';
}

export function markCeremonySeen(userKey: string, block: CeremonyBlock) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ceremonySeenKey(userKey, block), '1');
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
  const saveData = Boolean(nav.connection?.saveData);
  const slowNetwork = ['slow-2g', '2g'].includes(nav.connection?.effectiveType || '');
  return reducedMotion || saveData || slowNetwork || cores <= 4 || memory <= 4;
}
