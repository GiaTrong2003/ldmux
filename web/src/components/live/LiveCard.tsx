import { useRef, useEffect, useCallback } from 'react';
import { StatusBadge } from '../common/StatusDot';
import { useTail } from '../../hooks/useTail';
import { tailOutput } from '../../api/workers';
import { formatDurationMs, formatBytes, formatDateTime } from '../../utils/format';
import type { LiveWorker } from '../../types/api';
import './LiveCard.css';

function classForLiveness(w: LiveWorker): string {
  if (w.isZombie) return 'zombie';
  if (w.isStale) return 'stale';
  if (w.alive === true) return 'ok';
  return 'unknown';
}

function labelForLiveness(w: LiveWorker): string {
  if (w.isZombie) return 'ZOMBIE · PID dead';
  if (w.isStale) return 'STALE · no recent output';
  if (w.alive === true) return 'ALIVE · PID OK';
  return 'UNKNOWN';
}

export function LiveCard({ worker }: { worker: LiveWorker }) {
  const tailRef = useRef<HTMLPreElement>(null);
  const autoBottomRef = useRef(true);

  const { text } = useTail(
    useCallback((since: number) => tailOutput(worker.name, since).then(r => ({ chunk: r.chunk, size: r.size })), [worker.name]),
    2000,
    true
  );

  // Auto-scroll to bottom when new content arrives and user hadn't scrolled up
  useEffect(() => {
    const el = tailRef.current;
    if (!el) return;
    if (autoBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [text]);

  const handleScroll = () => {
    const el = tailRef.current;
    if (!el) return;
    autoBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  };

  const cls = classForLiveness(worker);
  return (
    <div className={`live-card ${cls}`}>
      <div className="live-card-header">
        <div className="live-card-title">
          <span className="live-card-name">{worker.name}</span>
          <StatusBadge status={worker.status} />
          <span className={`live-badge ${cls}`}>{labelForLiveness(worker)}</span>
        </div>
      </div>
      <div className="live-card-meta">
        {worker.pid !== undefined && <div><label>PID</label><strong>{worker.pid}</strong></div>}
        <div><label>Uptime</label><strong>{formatDurationMs(worker.uptimeMs ?? undefined)}</strong></div>
        <div><label>Idle</label><strong>{worker.idleMs !== null ? formatDurationMs(worker.idleMs) : '—'}</strong></div>
        <div><label>Bytes</label><strong>{formatBytes(worker.outputBytes)}</strong></div>
        <div><label>Last output</label><strong>{worker.lastOutputAt ? formatDateTime(worker.lastOutputAt) : '—'}</strong></div>
      </div>
      <pre ref={tailRef} className="live-card-tail" onScroll={handleScroll}>
        {text || '(no output yet)'}
      </pre>
    </div>
  );
}
