'use client';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { fetcher } from '@/lib/api';
import type { TodayData } from '@/types/rhythm';
const Context = createContext<{
  data: TodayData | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}>({ data: null, loading: true, error: '', refresh: async () => {} });
export const useRhythm = () => useContext(Context);
export function RhythmProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<TodayData | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    sequence = useRef(0);
  const refresh = useCallback(async (fresh = true) => {
    const serial = ++sequence.current;
    try {
      const result = await fetcher(
        '/api/dashboard/today' + (fresh ? '?fresh=1' : ''),
      );
      if (serial === sequence.current) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (serial === sequence.current)
        setError(e instanceof Error ? e.message : 'Your day could not load.');
    } finally {
      if (serial === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh(false));
    const update = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('focus', update);
    window.addEventListener('crystrack-activity-updated', update);
    document.addEventListener('visibilitychange', update);
    const interval = setInterval(update, 60000);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('crystrack-activity-updated', update);
      document.removeEventListener('visibilitychange', update);
      clearInterval(interval);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ data, error, loading, refresh }}>
      {children}
    </Context.Provider>
  );
}
