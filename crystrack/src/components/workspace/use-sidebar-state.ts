"use client";
import { useSyncExternalStore } from "react";

const key = "crystrack-sidebar-collapsed-v1";
const changed = "crystrack:sidebar-change";
let fallback = false;
let storageUnavailable = false;
function snapshot() {
  if (storageUnavailable) return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}
function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) notify();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(changed, notify);
  };
}
export function useSidebarState() {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false);
  function toggle() {
    fallback = !snapshot();
    try {
      window.localStorage.setItem(key, String(fallback));
    } catch {
      storageUnavailable = true;
      // Navigation still works when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(changed));
  }
  return { collapsed, toggle };
}
