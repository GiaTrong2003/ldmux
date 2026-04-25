import { useCallback } from 'react';
import { StatusBadge } from '../common/StatusDot';
import { stopWorker, getOutput } from '../../api/workers';
import { usePolling } from '../../hooks/usePolling';
import { formatTime } from '../../utils/format';
import type { WorkerStatus } from '../../types/api';
import './WorkerCard.css';

interface Props {
  worker: WorkerStatus;
  onChanged: () => void;
}

export function WorkerCard({ worker, onChanged }: Props) {
  const name = worker.name;
  const output = usePolling(() => getOutput(name), 3000);

  const handleStop = useCallback(async () => {
    if (!confirm(`Stop worker "${name}"?`)) return;
    try { await stopWorker(name); onChanged(); } catch (err: any) { alert(err.message); }
  }, [name, onChanged]);

  return (
    <div className={`worker-card ${worker.status}`}>
      <div className="worker-card-header">
        <span className="worker-card-name">{name}</span>
        <StatusBadge status={worker.status} />
      </div>
      <div className="worker-card-body">
        <div className="worker-card-time">
          {worker.startedAt && <>Started {formatTime(worker.startedAt)}</>}
          {worker.finishedAt && <> · Finished {formatTime(worker.finishedAt)}</>}
          {worker.pid && <> · PID {worker.pid}</>}
        </div>
        <pre className="worker-card-output">{output.data?.output || '(no output yet)'}</pre>
      </div>
      <div className="worker-card-footer">
        <button onClick={output.refresh}>Refresh</button>
        {worker.status === 'running' && (
          <button className="danger" onClick={handleStop}>Stop</button>
        )}
      </div>
    </div>
  );
}
