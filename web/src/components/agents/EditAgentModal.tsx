import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { getAgent, patchAgent, AgentPatch } from '../../api/agents';
import type { AgentWithSession, Autonomy } from '../../types/api';

interface Props {
  open: boolean;
  name: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditAgentModal({ open, name, onClose, onSaved }: Props) {
  const [cfg, setCfg] = useState<AgentWithSession | null>(null);
  const [soul, setSoul] = useState('');
  const [skill, setSkill] = useState('');
  const [cwd, setCwd] = useState('');
  const [model, setModel] = useState('');
  const [role, setRole] = useState('');
  const [reportsTo, setReportsTo] = useState('');
  const [autonomy, setAutonomy] = useState<'' | Autonomy>('');
  const [resetOnSave, setResetOnSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    if (!open || !name) return;
    let alive = true;
    setErr(undefined);
    getAgent(name)
      .then(a => {
        if (!alive) return;
        setCfg(a);
        setSoul(a.soul ?? '');
        setSkill(a.skill ?? '');
        setCwd(a.cwd ?? '');
        setModel(a.model ?? '');
        setRole(a.role ?? '');
        setReportsTo(a.reportsTo ?? '');
        setAutonomy((a.autonomy as any) ?? '');
        setResetOnSave(false);
      })
      .catch(e => setErr(e.message));
    return () => { alive = false; };
  }, [open, name]);

  const hasSession = !!cfg?.hasSession;
  const promptChanged =
    cfg != null && (
      (soul || undefined) !== (cfg.soul ?? undefined) ||
      (skill || undefined) !== (cfg.skill ?? undefined) ||
      (role || undefined) !== (cfg.role ?? undefined) ||
      (reportsTo || undefined) !== (cfg.reportsTo ?? undefined) ||
      (autonomy || undefined) !== (cfg.autonomy ?? undefined)
    );

  const save = async () => {
    if (!name) return;
    setBusy(true); setErr(undefined);
    const patch: AgentPatch = {
      soul: soul.trim() || null,
      skill: skill.trim() || null,
      cwd: cwd.trim() || null,
      model: model.trim() || null,
      role: role.trim() || null,
      reportsTo: reportsTo.trim() || null,
      autonomy: autonomy === '' ? null : (autonomy as Autonomy),
    };
    try {
      await patchAgent(name, patch, resetOnSave);
      onSaved();
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
      title={name ? `Edit agent: ${name}` : 'Edit agent'}
      onClose={onClose}
      width={640}
      footer={
        <>
          <label style={{ fontSize: 12, color: 'var(--fg-muted)', flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={resetOnSave} onChange={e => setResetOnSave(e.target.checked)} style={{ width: 'auto' }} />
            Reset session on save (required for prompt-affecting changes to apply)
          </label>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy || !name}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      {promptChanged && hasSession && (
        <div className="modal-warn">
          Prompt-affecting field changed — session already carries the original system prompt. Check "Reset session" to re-apply.
        </div>
      )}
      {err && <div className="modal-warn" style={{ background: 'var(--err-bg)', color: 'var(--err)' }}>{err}</div>}

      <label>Soul (system persona)
        <textarea value={soul} onChange={e => setSoul(e.target.value)} placeholder="You are ..." />
      </label>
      <label>Skill (expertise hints)
        <textarea value={skill} onChange={e => setSkill(e.target.value)} placeholder="Node.js, PostgreSQL, ..." />
      </label>
      <label>Cwd (working directory)
        <input value={cwd} onChange={e => setCwd(e.target.value)} placeholder="(default)" />
      </label>
      <label>Model
        <input value={model} onChange={e => setModel(e.target.value)} placeholder="opus / sonnet / haiku" />
      </label>
      <label>Role (company title)
        <input value={role} onChange={e => setRole(e.target.value)} placeholder='e.g. "Backend Manager"' />
      </label>
      <label>Reports to (manager's agent name)
        <input value={reportsTo} onChange={e => setReportsTo(e.target.value)} placeholder="e.g. ceo" />
      </label>
      <label>Autonomy
        <select value={autonomy} onChange={e => setAutonomy(e.target.value as any)}>
          <option value="">(unset — default: auto)</option>
          <option value="auto">auto — may call ask_agent</option>
          <option value="manual">manual — must not call ask_agent</option>
        </select>
      </label>
    </Modal>
  );
}
