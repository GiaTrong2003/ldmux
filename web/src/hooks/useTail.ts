import { useEffect, useRef, useState, useCallback } from 'react';
import type { TailResponse } from '../types/api';

/**
 * Incremental byte-offset tail. Keeps accumulated text in state and fetches
 * only the delta on each tick. Resets if server reports size < our offset
 * (e.g. retry cleared output).
 */
export function useTail(
  fetcher: (since: number) => Promise<TailResponse>,
  intervalMs: number,
  enabled = true
): { text: string; reset: () => void } {
  const [text, setText] = useState('');
  const offsetRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reset = useCallback(() => {
    offsetRef.current = 0;
    setText('');
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetcherRef.current(offsetRef.current);
        if (!alive) return;
        if (r.size < offsetRef.current) {
          offsetRef.current = 0;
          setText(r.chunk || '');
          return;
        }
        if (r.chunk) setText(t => t + r.chunk);
        offsetRef.current = r.size;
      } catch {
        // swallow — next tick may succeed
      }
    };
    tick();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      tick();
    }, intervalMs);
    return () => { alive = false; window.clearInterval(id); };
  }, [intervalMs, enabled]);

  return { text, reset };
}
