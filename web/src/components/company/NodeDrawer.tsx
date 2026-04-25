import { useMemo, useState, useCallback, useEffect } from 'react';
import { StatusBadge } from '../common/StatusDot';
import { askAgent, resetAgent } from '../../api/agents';
import { formatCost, formatDurationMs } from '../../utils/format';
import { useEscape, submitOnEnter } from '../../hooks/useHotkeys';
import type { AgentWithSession } from '../../types/api';
import './NodeDrawer.css';

interface Props {
  open: boolean;
  name: string | null;
  agents: AgentWithSession[];
  onClose: () => void;
  onChanged: () => void;
  onEdit: (name: string) => void;
}

export function NodeDrawer({ open, name, agents, onClose, onChanged, onEdit }: Props) {
  const agent = useMemo(() => agents.find(a => a.name === name), [name, agents]);
  const subordinates = useMemo(
    () => (name ? agents.filter(a => a.reportsTo === name).map(a => a.name) : []),
    [agents, name]
  );

  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [answer, setAnswer] = useState<string>();
  const [costLabel, setCostLabel] = useState<string>();

  useEffect(() => {
    if (!open) { setQuestion(''); setAnswer(undefined); setStatus(undefined); setCostLabel(undefined); }
  }, [open]);

  const ask = useCallback(async () => {
    if (!name || !question.trim()) return;
    setBusy(true);
    setStatus('Running (this may take 5–30s)...');
    setAnswer(undefined);
    try {
      const r = await askAgent(name, question.trim());
      setAnswer(r.answer);
      setCostLabel(`${formatDurationMs(r.durationMs)} · ${formatCost(r.costUsd)}`);
      setStatus('Done.');
      onChanged();
    } catch (err: any) {
      setStatus('Error: ' + err.message);
    } finally {
      setBusy(false);
    }
  }, [name, question, onChanged]);

  const handleReset = useCallback(async () => {
    if (!name) return;
    const running = agent?.status === 'running';
    const warn = running
      ? `"${name}" is running. Reset will kill its in-flight task and wipe history. Continue?`
      : `Reset session for "${name}"?`;
    if (!confirm(warn)) return;
    try { await resetAgent(name); onChanged(); } catch (e: any) { alert(e.message); }
  }, [name, agent?.status, onChanged]);

  useEscape(open, onClose);

  return (
    <div className={`node-drawer ${open ? 'open' : ''}`}>
      {agent && (
        <>
          <div className="node-drawer-header">
            <div>
              <div className="node-drawer-name">{agent.name}</div>
              <div className="node-drawer-role">{agent.role || '(no role)'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={agent.status} />
              <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
            </div>
          </div>
          <div className="node-drawer-body">
            <Row label="Effective autonomy" value={agent.effectiveAutonomy ?? 'auto'} />
            <Row label="Reports to" value={agent.reportsTo || '(top-level)'} />
            <Row label="Direct reports" value={subordinates.length ? subordinates.join(', ') : '(none)'} />
            <Row label="Stats" value={`${agent.turns ?? 0} turns · ${formatCost(agent.totalCostUsd)}`} />
            {agent.soul && <Row label="Soul" value={agent.soul} pre />}
            {agent.skill && <Row label="Skill" value={agent.skill} />}
            <div className="node-drawer-btns">
              <button onClick={() => onEdit(agent.name)}>Edit agent</button>
              <button
                onClick={handleReset}
                disabled={!agent.hasSession && agent.status !== 'running'}
                title={agent.status === 'running' ? 'Force-stop current task and reset' : 'Wipe session'}
              >
                {agent.status === 'running' ? 'Reset (stop task)' : 'Reset session'}
              </button>
            </div>
          </div>
          <div className="node-drawer-ask">
            <textarea
              placeholder="Ask this agent directly... (Enter to send, Shift+Enter newline)"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={submitOnEnter(ask)}
              disabled={busy}
            />
            <div className="node-drawer-ask-row">
              <span className="node-drawer-status">{status}</span>
              <button className="primary" onClick={ask} disabled={busy || !question.trim()}>
                {busy ? 'Asking...' : 'Ask'}
              </button>
            </div>
            {answer && (
              <div className="node-drawer-answer">
                {costLabel && <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4 }}>{costLabel}</div>}
                <pre>{answer}</pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <div className="node-drawer-row">
      <label>{label}</label>
      {pre ? <pre className="node-drawer-pre">{value}</pre> : <div className="node-drawer-val">{value}</div>}
    </div>
  );
}
