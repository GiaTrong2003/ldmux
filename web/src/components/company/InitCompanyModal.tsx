import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { createAgent, CreateAgentBody } from '../../api/agents';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

interface Seed extends CreateAgentBody {
  optional?: 'be' | 'fe' | 'qa' | 'eng';
}

const SEEDS: Seed[] = [
  {
    name: 'ceo',
    role: 'CEO',
    autonomy: 'auto',
    soul: "You are the CEO of a small AI-run software team. Think high-level: break the user's request into concrete workstreams, delegate to your managers, wait for their reports, and synthesize an executive summary for the user. Be decisive and concise.",
    skill: 'Product strategy, decomposition, synthesizing cross-functional reports',
  },
  {
    name: 'be-manager',
    role: 'Backend Manager',
    reportsTo: 'ceo',
    autonomy: 'auto',
    soul: 'You are the Backend Manager. Design APIs, data models, and server architecture. Coordinate with the Frontend Manager when contracts need to be defined. Always end with a concise report for your manager.',
    skill: 'REST/GraphQL API design, databases, auth, server frameworks (Node/Go/Java)',
    optional: 'be',
  },
  {
    name: 'fe-manager',
    role: 'Frontend Manager',
    reportsTo: 'ceo',
    autonomy: 'auto',
    soul: 'You are the Frontend Manager. Design UI flows, component structure, and client-side state. Ask the Backend Manager for API shapes when you need them. Report back succinctly.',
    skill: 'React/Vue UI design, UX flows, client state management, accessibility',
    optional: 'fe',
  },
  {
    name: 'qa-manager',
    role: 'QA Manager',
    reportsTo: 'ceo',
    autonomy: 'auto',
    soul: 'You are the QA/QC Manager. Review plans and implementations for testability, edge cases, race conditions, and security gaps. Call out risks explicitly. Report findings to the CEO.',
    skill: 'Test strategy, edge cases, regression risk, security review',
    optional: 'qa',
  },
];

const ENGINEERS: Seed[] = [
  {
    name: 'be-engineer', role: 'Backend Engineer', reportsTo: 'be-manager', autonomy: 'auto',
    soul: 'You are a Backend Engineer reporting to the Backend Manager. Implement the designs your manager gives you. Ask for clarification if specs are ambiguous. Report progress and blockers.',
    skill: 'Hands-on backend coding, endpoints, migrations, unit tests',
  },
  {
    name: 'fe-engineer', role: 'Frontend Engineer', reportsTo: 'fe-manager', autonomy: 'auto',
    soul: 'You are a Frontend Engineer reporting to the Frontend Manager. Implement UI components per spec. Flag UX concerns as you build. Report progress and blockers.',
    skill: 'Hands-on UI coding, components, styling, frontend tests',
  },
];

export function InitCompanyModal({ open, onClose, onDone }: Props) {
  const [wantBE, setWantBE] = useState(true);
  const [wantFE, setWantFE] = useState(true);
  const [wantQA, setWantQA] = useState(true);
  const [wantEng, setWantEng] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();

  useEffect(() => { if (!open) setStatus(undefined); }, [open]);

  const submit = async () => {
    setBusy(true);
    const picked: Seed[] = [SEEDS[0]];
    if (wantBE) picked.push(SEEDS[1]);
    if (wantFE) picked.push(SEEDS[2]);
    if (wantQA) picked.push(SEEDS[3]);
    if (wantEng && wantBE) picked.push(ENGINEERS[0]);
    if (wantEng && wantFE) picked.push(ENGINEERS[1]);

    let created = 0, skipped = 0;
    for (const s of picked) {
      setStatus(`Creating ${s.name}...`);
      try {
        await createAgent(s);
        created++;
      } catch (e: any) {
        if (e.message?.includes('already exists')) skipped++;
        else console.warn('create failed:', s.name, e);
      }
    }
    setStatus(`Done — ${created} created, ${skipped} existed.`);
    onDone();
    window.setTimeout(() => { setBusy(false); onClose(); }, 1000);
  };

  return (
    <Modal
      open={open}
      title="Init company"
      onClose={onClose}
      width={480}
      footer={
        <>
          <span className="spacer" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{status}</span>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? 'Working...' : 'Create'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
        Choose which roles to seed. Existing agents are kept untouched.
      </p>
      <Check label="CEO (always created)" checked disabled />
      <Check label="Backend Manager" checked={wantBE} onChange={setWantBE} />
      <Check label="Frontend Manager" checked={wantFE} onChange={setWantFE} />
      <Check label="QA Manager" checked={wantQA} onChange={setWantQA} />
      <Check label="Also add BE + FE engineers (one level deeper)" checked={wantEng} onChange={setWantEng} />
    </Modal>
  );
}

function Check({
  label, checked, onChange, disabled,
}: { label: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ flexDirection: 'row', alignItems: 'center', color: 'var(--fg-0)', fontSize: 13 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange?.(e.target.checked)}
        style={{ width: 'auto', marginRight: 8 }}
      />
      {label}
    </label>
  );
}
