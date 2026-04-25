import { EmptyState } from '../common/EmptyState';
import { WorkerCard } from './WorkerCard';
import { NewWorkerForm } from './NewWorkerForm';
import type { WorkerStatus } from '../../types/api';
import './WorkersTab.css';

interface Props {
  workers: WorkerStatus[];
  onChanged: () => void;
}

export function WorkersTab({ workers, onChanged }: Props) {
  return (
    <div>
      <NewWorkerForm onCreated={onChanged} />
      {workers.length === 0 ? (
        <EmptyState
          title="No workers yet"
          description="Start one above or run a plan from the CLI with ldmux run."
        />
      ) : (
        <div className="workers-grid">
          {workers.map(w => (
            <WorkerCard key={w.name} worker={w} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}
