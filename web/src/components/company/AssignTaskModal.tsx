import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { askAgent } from '../../api/agents';
import { formatCost, formatDurationMs } from '../../utils/format';
import type { AgentWithSession } from '../../types/api';

interface Props {
  open: boolean;
  agents: AgentWithSession[];
  defaultFrom: string;       // 'user' | agent name
  defaultTo: string[] | null; // initial recipients
  onClose: () => void;
  onDone: () => void;
}

interface Result {
  status: 'pending' | 'ok' | 'err';
  answer?: string;
  meta?: string;
  error?: string;
}

export function AssignTaskModal({ open, agents, defaultFrom, defaultTo, onClose, onDone }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState<Set<string>>(new Set(defaultTo ?? []));
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});

  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(new Set(defaultTo ?? []));
      setQuestion('');
      setResults({});
      setBusy(false);
    }
  }, [open, defaultFrom, defaultTo]);

  const toggle = (name: string) => {
    setTo(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAllBelow = (parent: string) => {
    const descendants = new Set<string>();
    const queue = [parent];
    while (queue.length) {
      const p = queue.shift()!;
      for (const a of agents) {
        if (a.reportsTo === p && !descendants.has(a.name)) {
          descendants.add(a.name);
          queue.push(a.name);
        }
      }
    }
    setTo(prev => new Set([...prev, ...descendants]));
  };

  const submit = async () => {
    const targets = [...to];
    if (targets.length === 0 || !question.trim()) return;
    setBusy(true);
    const init: Record<string, Result> = {};
    for (const t of targets) init[t] = { status: 'pending' };
    setResults(init);
    const q = question.trim();
    const fromValue = from === 'user' ? undefined : from;
    const groupId = (crypto as any).randomUUID?.() ?? `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const participants = Array.from(new Set([from, ...targets])).sort();

    await Promise.all(targets.map(async target => {
      try {
        const r = await askAgent(target, q, { from: fromValue, groupId, participants });
        setResults(prev => ({
          ...prev,
          [target]: {
            status: 'ok',
            answer: r.answer,
            meta: `${formatDurationMs(r.durationMs)} · ${formatCost(r.costUsd)}`,
          },
        }));
      } catch (err: any) {
        setResults(prev => ({
          ...prev,
          [target]: { status: 'err', error: err.message },
        }));
      }
    }));

    setBusy(false);
    onDone();
  };

  const count = to.size;
  const title = count === 0
    ? 'Assign task'
    : count === 1
      ? `Assign task: ${from} → ${[...to][0]}`
      : `Assign task: ${from} → ${count} agents`;

  const directReports = from !== 'user'
    ? agents.filter(a => a.reportsTo === from).map(a => a.name)
    : [];

  return (
    <Modal open={open} title={title} onClose={onClose} width={720}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label>
          <FieldLabel>From</FieldLabel>
          <select value={from} onChange={e => setFrom(e.target.value)} disabled={busy}>
            <option value="user">user</option>
            {agents.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </label>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <FieldLabel>To ({count} selected)</FieldLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ghost" type="button" disabled={busy} onClick={() => setTo(new Set(agents.map(a => a.name)))}>All</button>
              <button className="ghost" type="button" disabled={busy} onClick={() => setTo(new Set())}>None</button>
              {from !== 'user' && directReports.length > 0 && (
                <button className="ghost" type="button" disabled={busy} onClick={() => setTo(new Set(directReports))}>
                  Direct reports ({directReports.length})
                </button>
              )}
              {from !== 'user' && (
                <button className="ghost" type="button" disabled={busy} onClick={() => selectAllBelow(from)}>
                  All under {from}
                </button>
              )}
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 6,
              maxHeight: 180,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 8,
              background: 'var(--bg-0)',
            }}
          >
            {agents.map(a => {
              const checked = to.has(a.name);
              const disabled = busy || a.name === from;
              return (
                <label
                  key={a.name}
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    fontSize: 12.5,
                    padding: '4px 6px',
                    borderRadius: 4,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled && !checked ? 0.45 : 1,
                    background: checked ? 'rgba(255,170,0,0.10)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(a.name)}
                  />
                  <span style={{ fontWeight: 500 }}>{a.name}</span>
                  {a.role && <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>· {a.role}</span>}
                </label>
              );
            })}
          </div>
        </div>

        <label>
          <FieldLabel>Task / Question</FieldLabel>
          <textarea
            rows={5}
            placeholder="What should these agents do? (Enter to send, Shift+Enter newline)"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey || e.altKey) return;
              if ((e.nativeEvent as any).isComposing) return;
              e.preventDefault();
              if (!busy && to.size > 0 && question.trim()) submit();
            }}
            disabled={busy}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            {busy ? `Running on ${count} agent${count === 1 ? '' : 's'}...` : count === 0 ? 'Pick at least one agent.' : `Ready: ${count} target${count === 1 ? '' : 's'}`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost" onClick={onClose} disabled={busy}>Close</button>
            <button className="primary" onClick={submit} disabled={busy || count === 0 || !question.trim()}>
              {busy ? 'Sending...' : `Send to ${count || 0}`}
            </button>
          </div>
        </div>

        {Object.keys(results).length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {Object.entries(results).map(([name, r]) => (
              <div
                key={name}
                style={{
                  background: 'var(--bg-0)',
                  border: `1px solid ${r.status === 'err' ? 'var(--err)' : 'var(--border)'}`,
                  borderRadius: 6,
                  padding: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>
                    {from} → {name}{' '}
                    <span style={{
                      fontSize: 10.5,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: r.status === 'pending' ? 'var(--fg-muted)' : r.status === 'ok' ? 'var(--ok)' : 'var(--err)',
                      marginLeft: 6,
                    }}>
                      {r.status === 'pending' ? '…running' : r.status}
                    </span>
                  </span>
                  {r.meta && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{r.meta}</span>}
                </div>
                {r.status === 'pending' && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Waiting for response…</div>}
                {r.answer && (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                    {r.answer}
                  </pre>
                )}
                {r.error && <div style={{ color: 'var(--err)', fontSize: 12 }}>{r.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      color: 'var(--fg-muted)',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}>{children}</div>
  );
}
