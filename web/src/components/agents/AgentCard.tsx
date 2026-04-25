import { useCallback, useState } from 'react';
import { StatusBadge } from '../common/StatusDot';
import { resetAgent, deleteAgent } from '../../api/agents';
import { formatCost, formatDateTime } from '../../utils/format';
import { TimelineModal } from '../debug/TimelineModal';
import type { AgentWithSession } from '../../types/api';
import './AgentCard.css';

interface Props {
  agent: AgentWithSession;
  onEdit: () => void;
  onChanged: () => void;
}

export function AgentCard({ agent, onEdit, onChanged }: Props) {
  const name = agent.name;
  const isRunning = agent.status === 'running';
  const [timelineOpen, setTimelineOpen] = useState(false);

  const handleReset = useCallback(async () => {
    const warn = isRunning
      ? `"${name}" is running. Reset will kill its in-flight task and wipe history. Continue?`
      : `Reset session for "${name}"? History is wiped; soul/skill kept.`;
    if (!confirm(warn)) return;
    try { await resetAgent(name); onChanged(); } catch (err: any) { alert(err.message); }
  }, [name, isRunning, onChanged]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete agent "${name}" permanently? Removes soul, skill, session, history, logs.`)) return;
    try { await deleteAgent(name); onChanged(); } catch (err: any) { alert(err.message); }
  }, [name, onChanged]);

  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <div className="agent-card-title">
          <span className="agent-card-name">{name}</span>
          {agent.role && <span className="agent-card-role">{agent.role}</span>}
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <div className="agent-card-body">
        {agent.soul && (
          <div className="agent-card-field">
            <label>Soul</label>
            <div className="soul">{agent.soul}</div>
          </div>
        )}
        {agent.skill && (
          <div className="agent-card-field">
            <label>Skill</label>
            <div>{agent.skill}</div>
          </div>
        )}
        <div className="agent-card-stats">
          <span>{agent.turns || 0} turns</span>
          <span>·</span>
          <span>{formatCost(agent.totalCostUsd)}</span>
          {agent.lastActiveAt && (<><span>·</span><span>last {formatDateTime(agent.lastActiveAt)}</span></>)}
          {agent.reportsTo && (<><span>·</span><span>reports to <strong>{agent.reportsTo}</strong></span></>)}
        </div>
      </div>
      <div className="agent-card-footer">
        <button className="primary" onClick={onEdit} disabled={isRunning}>Edit</button>
        <button
          onClick={() => setTimelineOpen(true)}
          disabled={!agent.hasSession}
          title={agent.hasSession ? 'Replay turn-by-turn trace from Claude Code' : 'No session yet — ask the agent first'}
        >
          Timeline
        </button>
        <button
          onClick={handleReset}
          disabled={!agent.hasSession && !isRunning}
          title={isRunning ? 'Force-stop current task and reset' : 'Wipe session'}
        >
          {isRunning ? 'Reset (stop task)' : 'Reset session'}
        </button>
        <button className="danger" onClick={handleDelete} disabled={isRunning}>Delete</button>
      </div>
      <TimelineModal open={timelineOpen} onClose={() => setTimelineOpen(false)} agentName={name} />
    </div>
  );
}
