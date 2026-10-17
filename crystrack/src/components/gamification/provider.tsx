"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRhythm } from "@/components/rhythm/rhythm-provider";
import { useAuth } from "@/components/layout/auth-provider";
import type { GamificationSnapshot } from "@/types/gamification";
const Context = createContext<{
  data: GamificationSnapshot | null;
  hidden: boolean;
  preference: boolean;
  setHidden: (value: boolean) => Promise<void>;
  saving: boolean;
  error: string;
}>({
  data: null,
  hidden: true,
  preference: true,
  setHidden: async () => {},
  saving: false,
  error: "",
});
export const useGamification = () => useContext(Context);
export function GamificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: today, refresh } = useRhythm(),
    { user } = useAuth(),
    data = today?.gamification || null;
  const [burst, setBurst] = useState(0);
  const [pending, setPending] = useState<boolean | null>(null);
  const [override, setOverride] = useState<boolean | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const seen = useRef<Set<string> | null>(null),
    busy = useRef(false),
    sequence = useRef(0),
    currentUser = useRef(user?.id),
    hidden = pending === true || (override ?? data?.hidden !== false);
  useEffect(() => {
    if (currentUser.current !== user?.id) {
      currentUser.current = user?.id;
      seen.current = null;
      sequence.current++;
      queueMicrotask(() => {
        setPending(null);
        setOverride(null);
        setNotice("");
        setError("");
      });
    }
  }, [user?.id]);
  useEffect(() => {
    if (hidden || !data?.ready) {
      seen.current = null;
      queueMicrotask(() => setNotice(""));
      return;
    }
    const unlocked = data.badges.filter((b) => b.unlocked),
      ids = new Set(unlocked.map((b) => b.id));
    if (seen.current) {
      const fresh = unlocked.filter((b) => !seen.current!.has(b.id));
      if (fresh.length)
        queueMicrotask(() => {
          setBurst((n) => n + 1);
          setNotice(
            fresh.length === 1
              ? `${fresh[0].name} unlocked. A small win worth keeping.`
              : `${fresh.length} badges unlocked. Your small steps are adding up.`,
          );
        });
    }
    seen.current = new Set([...(seen.current || []), ...ids]);
  }, [data, hidden]);
  useEffect(() => {
    if (override !== null && data?.hidden === override)
      queueMicrotask(() => setOverride(null));
  }, [override, data?.hidden]);
  const setHidden = async (value: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setPending(value);
    setSaving(true);
    setError("");
    const previous = hidden,
      serial = ++sequence.current;
    // Suppress immediately; showing extras waits until the server confirms the preference.
    if (value) {
      setOverride(true);
      setNotice("");
      seen.current = null;
    }
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideGamification: value }),
      });
      if (!res.ok)
        throw new Error(
          "Your preference could not be saved. Please try again.",
        );
      if (serial === sequence.current) setOverride(value);
      await refresh();
    } catch (e) {
      if (serial === sequence.current) {
        setOverride(previous);
        setError(e instanceof Error ? e.message : "Please try again.");
      }
    } finally {
      busy.current = false;
      setPending(null);
      setSaving(false);
    }
  };
  return (
    <Context.Provider
      value={{
        data,
        hidden,
        preference: pending ?? hidden,
        setHidden,
        saving,
        error,
      }}
    >
      {children}
      {!hidden && notice && (
        <>
          <div
            key={burst}
            aria-hidden="true"
            className="goal-particles gamification-particles"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ "--particle": i } as React.CSSProperties} />
            ))}
          </div>
          <aside role="status" className="gamification-toast">
            <span>{notice}</span>
            <a href="/insights#achievement-cabinet">View badges</a>
            <button
              aria-label="Dismiss badge notification"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </aside>
        </>
      )}
    </Context.Provider>
  );
}
