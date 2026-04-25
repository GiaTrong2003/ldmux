import { useState } from 'react';
import { createWorker } from '../../api/workers';
import './NewWorkerForm.css';

interface Props {
  onCreated: () => void;
}

export function NewWorkerForm({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const submit = async () => {
    if (!name.trim() || !prompt.trim()) {
      setErr('Both name and prompt are required.');
      return;
    }
    setBusy(true); setErr(undefined);
    try {
      await createWorker({ name: name.trim(), prompt: prompt.trim() });
      setName(''); setPrompt('');
      onCreated();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="new-worker">
      <h2>New worker</h2>
      <div className="new-worker-row">
        <input
          className="new-worker-name"
          placeholder="worker-name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={busy}
        />
        <textarea
          className="new-worker-prompt"
          placeholder="Enter prompt for agent..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={1}
          disabled={busy}
        />
        <button className="primary" onClick={submit} disabled={busy}>
          {busy ? 'Starting...' : 'Start'}
        </button>
      </div>
      {err && <div className="new-worker-err">{err}</div>}
    </div>
  );
}
