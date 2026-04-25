import { useState } from 'react';
import { EmptyState } from '../common/EmptyState';
import { AgentCard } from './AgentCard';
import { EditAgentModal } from './EditAgentModal';
import type { AgentWithSession } from '../../types/api';
import './AgentsTab.css';

interface Props {
  agents: AgentWithSession[];
  onChanged: () => void;
}

export function AgentsTab({ agents, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);

  if (agents.length === 0) {
    return (
      <EmptyState
        title="No persistent agents"
        description={<>Create one via CLI: <code>ldmux create</code>, or use the Company tab to seed a starter hierarchy.</>}
      />
    );
  }
  return (
    <>
      <div className="agents-grid">
        {agents.map(a => (
          <AgentCard
            key={a.name}
            agent={a}
            onEdit={() => setEditing(a.name)}
            onChanged={onChanged}
          />
        ))}
      </div>
      <EditAgentModal
        open={editing != null}
        name={editing}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
    </>
  );
}
