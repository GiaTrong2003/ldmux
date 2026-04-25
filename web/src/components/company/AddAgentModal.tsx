import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { createAgent } from '../../api/agents';
import type { AgentWithSession, Autonomy } from '../../types/api';

interface Props {
  open: boolean;
  agents: AgentWithSession[];
  defaultReportsTo?: string | null;
  onClose: () => void;
  onDone: () => void;
}

export function AddAgentModal({ open, agents, defaultReportsTo, onClose, onDone }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [soul, setSoul] = useState('');
  const [skill, setSkill] = useState('');
  const [reportsTo, setReportsTo] = useState('');
  const [autonomy, setAutonomy] = useState<'' | Autonomy>('auto');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setName('');
    setRole('');
    setSoul('');
    setSkill('');
    setReportsTo(defaultReportsTo ?? '');
    setAutonomy('auto');
    setErr(undefined);
  }, [open, defaultReportsTo]);

  const submit = async () => {
    const n = name.trim();
    if (!n) { setErr('Name is required'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(n)) { setErr('Name must be filesystem-safe: letters, numbers, - or _'); return; }
    setBusy(true); setErr(undefined);
    try {
      await createAgent({
        name: n,
        role: role.trim() || undefined,
        soul: soul.trim() || undefined,
        skill: skill.trim() || undefined,
        reportsTo: reportsTo.trim() || undefined,
        autonomy: autonomy || undefined,
      });
      onDone();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Add agent"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating...' : 'Create'}
          </button>
        </>
      }
    >
      {err && <div className="modal-warn" style={{ background: 'var(--err-bg)', color: 'var(--err)' }}>{err}</div>}
      <label>Name
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. be-engineer-2" autoFocus />
      </label>
      <label>Role
        <input value={role} onChange={e => setRole(e.target.value)} placeholder='e.g. "Backend Engineer"' />
      </label>
      <label>Reports to
        <select value={reportsTo} onChange={e => setReportsTo(e.target.value)}>
          <option value="">(top-level)</option>
          {agents.map(a => <option key={a.name} value={a.name}>{a.name}{a.role ? ` — ${a.role}` : ''}</option>)}
        </select>
      </label>
      <label>Autonomy
        <select value={autonomy} onChange={e => setAutonomy(e.target.value as any)}>
          <option value="auto">auto — may delegate</option>
          <option value="manual">manual — cannot delegate</option>
        </select>
      </label>
      <label>Soul (optional)
        <textarea value={soul} onChange={e => setSoul(e.target.value)} placeholder="You are ..." />
      </label>
      <label>Skill (optional)
        <input value={skill} onChange={e => setSkill(e.target.value)} placeholder="e.g. React, accessibility" />
      </label>
    </Modal>
  );
}
