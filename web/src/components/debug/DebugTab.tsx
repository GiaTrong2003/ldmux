import { useState, useCallback } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { EmptyState } from '../common/EmptyState';
import { listLiveProcs, killAgent } from '../../api/debug';
import { LiveProcRow } from './LiveProcRow';
import type { LiveProcInfo } from '../../types/api';
import './DebugTab.css';

interface Props { paused: boolean }

export function DebugTab({ paused }: Props) {
  const [interval, setIntervalMs] = useState(2000);
  const { data, refresh } = usePolling<LiveProcInfo[]>(listLiveProcs, interval, paused);
  const procs = data ?? [];

  const handleKill = useCallback(async (name: string) => {
    if (!confirm(`Kill all live processes for "${name}"?`)) return;
    try { await killAgent(name); refresh(); } catch (err: any) { alert(err.message); }
  }, [refresh]);

  return (
    <div className="debug-tab">
      <div className="debug-toolbar">
        <label>
          Auto-refresh
          <select value={interval} onChange={e => setIntervalMs(parseInt(e.target.value, 10))}>
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
        </label>
        <button onClick={refresh}>Refresh now</button>
        <span className="debug-count">{procs.length} live</span>
      </div>
      {procs.length === 0 ? (
        <EmptyState
          title="No live claude processes"
          description="Spawn an agent ask/chat from the Agents or Company tab to see it here."
        />
      ) : (
        <div className="debug-list">
          {procs.map((p, i) => (
            <LiveProcRow key={`${p.agentName}-${p.pid ?? i}`} proc={p} onKill={() => handleKill(p.agentName)} />
          ))}
        </div>
      )}
    </div>
  );
}
