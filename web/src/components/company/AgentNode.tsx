import { type NodeProps } from '@xyflow/react';
import { StatusDot } from '../common/StatusDot';
import { formatCost } from '../../utils/format';
import type { AgentWithSession } from '../../types/api';
import './AgentNode.css';

export interface AgentNodeData extends Record<string, unknown> {
  agent: AgentWithSession;
  onOpen?: (name: string) => void;
  onContextMenu?: (name: string, x: number, y: number) => void;
}

export function AgentNode({ data }: NodeProps) {
  const a = (data as AgentNodeData).agent;
  const onOpen = (data as AgentNodeData).onOpen;
  const onCtx = (data as AgentNodeData).onContextMenu;
  const auto = a.effectiveAutonomy ?? 'auto';
  return (
    <div
      className={`agent-node ${a.status || 'sleep'}`}
      onClick={() => onOpen?.(a.name)}
      onContextMenu={(e) => {
        if (!onCtx) return;
        e.preventDefault();
        e.stopPropagation();
        onCtx(a.name, e.clientX, e.clientY);
      }}
    >
      <div className="agent-node-head">
        <StatusDot status={a.status} />
        <div className="agent-node-name">{a.name}</div>
        <span className={`agent-node-badge ${auto}`}>{auto.toUpperCase()}</span>
      </div>
      <div className="agent-node-role">{a.role || '—'}</div>
      <div className="agent-node-stats">
        {a.turns ?? 0} turns · {formatCost(a.totalCostUsd)} · {a.status || 'sleep'}
      </div>
    </div>
  );
}
