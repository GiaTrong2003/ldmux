import { useCallback } from 'react';
import { EmptyState } from '../common/EmptyState';
import { StatusBadge } from '../common/StatusDot';
import { retryWorker, getOutput } from '../../api/workers';
import { usePolling } from '../../hooks/usePolling';
import { formatDateTime } from '../../utils/format';
import type { WorkerStatus } from '../../types/api';
import './ErrorsTab.css';

interface CardProps { worker: WorkerStatus; onChanged: () => void; }

function ErrorCard({ worker, onChanged }: CardProps) {
  const name = worker.name;
  const output = usePolling(() => getOutput(name), 5000);

  const handleRetry = useCallback(async () => {
    if (!confirm(`Reset & retry "${name}"?`)) return;
    try { await retryWorker(name); onChanged(); } catch (err: any) { alert(err.message); }
  }, [name, onChanged]);

  const copyLog = useCallback(async () => {
    const txt = output.data?.output || '';
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // ignore
    }
  }, [output.data]);

  return (
    <div className="error-card">
      <div className="error-card-header">
        <span className="error-card-name">{name}</span>
        <StatusBadge status="error" />
      </div>
      <div className="error-card-message">
        <strong>Error:</strong> {worker.error || 'Process exited unexpectedly.'}
      </div>
      <div className="error-card-meta">
        {worker.pid ? <span>PID {worker.pid}</span> : null}
        {worker.startedAt && <span>Started {formatDateTime(worker.startedAt)}</span>}
        {worker.finishedAt && <span>Finished {formatDateTime(worker.finishedAt)}</span>}
      </div>
      <pre className="error-card-output">{output.data?.output || '(loading log...)'}</pre>
      <div className="error-card-actions">
        <button className="primary" onClick={handleRetry}>Reset & retry</button>
        <button onClick={output.refresh}>Refresh log</button>
        <button onClick={copyLog}>Copy log</button>
      </div>
    </div>
  );
}

interface Props {
  workers: WorkerStatus[];
  onChanged: () => void;
}

export function ErrorsTab({ workers, onChanged }: Props) {
  if (workers.length === 0) {
    return (
      <EmptyState
        title="No errors"
        description="When a worker fails, detailed logs will appear here."
      />
    );
  }
  return (
    <div className="errors-list">
      {workers.map(w => (
        <ErrorCard key={w.name} worker={w} onChanged={onChanged} />
      ))}
    </div>
  );
}
