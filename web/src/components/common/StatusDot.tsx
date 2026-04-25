import type { WorkerStatusValue } from '../../types/api';
import './StatusDot.css';

export function StatusDot({ status }: { status?: WorkerStatusValue | string }) {
  return <span className={`status-dot ${status || 'sleep'}`} />;
}

export function StatusBadge({ status }: { status?: WorkerStatusValue | string }) {
  return <span className={`status-badge ${status || 'sleep'}`}>{(status || 'sleep').toUpperCase()}</span>;
}
