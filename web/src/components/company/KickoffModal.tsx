import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../common/Modal';
import { askAgent } from '../../api/agents';
import { formatCost, formatDurationMs } from '../../utils/format';
import type { AgentWithSession } from '../../types/api';

interface Props {
  open: boolean;
  agents: AgentWithSession[];
  onClose: () => void;
  onDone: () => void;
}

export function KickoffModal({ open, agents, onClose, onDone }: Props) {
  const sorted = useMemo(
    () => [...agents].sort((a, b) => Number(!!a.reportsTo) - Number(!!b.reportsTo)),
    [agents]
  );

  const [target, setTarget] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setTarget(sorted[0]?.name ?? '');
    setQuestion('');
    setStatus(undefined);
  }, [open, sorted]);

  const submit = async () => {
    if (!target || !question.trim()) return;
    setBusy(true);
    setStatus(`Sending to ${target}... (may delegate further, stay on this screen)`);
    try {
      const r = await askAgent(target, question.trim());
      setStatus(`Done — ${formatDurationMs(r.durationMs)} · ${formatCost(r.costUsd)}`);
      onDone();
      window.setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setStatus('Error: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Kick off a task"
      onClose={onClose}
      width={560}
      footer={
        <>
          <span className="spacer" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{status}</span>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy || !target || !question.trim()}>
            {busy ? 'Sending...' : 'Send'}
          </button>
        </>
      }
    >
      <label>Target agent
        <select value={target} onChange={e => setTarget(e.target.value)}>
          {sorted.map(a => (
            <option key={a.name} value={a.name}>
              {a.name}{a.role ? ` — ${a.role}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>Task / question
        <textarea
          rows={6}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter' || e.shiftKey || e.altKey) return;
            if ((e.nativeEvent as any).isComposing) return;
            e.preventDefault();
            if (!busy && target && question.trim()) submit();
          }}
          placeholder="Example: design a login page... (Enter to send, Shift+Enter newline)"
        />
      </label>
    </Modal>
  );
}
