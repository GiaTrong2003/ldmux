import { useMemo } from 'react';
import { EmptyState } from '../common/EmptyState';
import { LiveCard } from './LiveCard';
import { listLive } from '../../api/workers';
import { usePolling } from '../../hooks/usePolling';
import type { LiveWorker } from '../../types/api';

const ACTIVE = new Set(['pending', 'running', 'waiting', 'sleep']);

interface Props { paused: boolean; }

export function LiveTab({ paused }: Props) {
  const { data } = usePolling<LiveWorker[]>(listLive, 2000, paused);
  const active = useMemo(
    () => (data ?? []).filter(w => ACTIVE.has(w.status)),
    [data]
  );

  if (active.length === 0) {
    return (
      <EmptyState
        title="No active workers"
        description="Workers with status running / waiting / pending / sleep will appear here with live PID checks and a tail of their output."
      />
    );
  }
  return (
    <div className="live-list">
      {active.map(w => <LiveCard key={w.name} worker={w} />)}
    </div>
  );
}
