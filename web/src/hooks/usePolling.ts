import { useEffect, useRef, useState, useCallback } from 'react';

export interface PollingState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Poll `fetcher` every `intervalMs`. Pauses when document.hidden or paused=true.
 * Also exposes a manual `refresh()` to trigger an immediate fetch.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  paused = false
): PollingState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcherRef.current();
      if (aliveRef.current) {
        setData(res);
        setError(null);
      }
    } catch (err) {
      if (aliveRef.current) setError(err as Error);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    const id = window.setInterval(() => {
      if (document.hidden || paused) return;
      refresh();
    }, intervalMs);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [intervalMs, paused, refresh]);

  return { data, error, loading, refresh };
}
