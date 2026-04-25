import { useEffect, useRef } from 'react';
import './AgentContextMenu.css';

export interface ContextMenuState {
  name: string;
  x: number;
  y: number;
}

interface Props {
  state: ContextMenuState | null;
  onClose: () => void;
  onAsk: (name: string) => void;
  onAssign: (name: string) => void;
  onOpen: (name: string) => void;
  onEdit: (name: string) => void;
  onAddChild: (parent: string) => void;
  onDelete: (name: string) => void;
}

export function AgentContextMenu({ state, onClose, onAsk, onAssign, onOpen, onEdit, onAddChild, onDelete }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', key);
    };
  }, [state, onClose]);

  if (!state) return null;

  const wrap = (fn: (n: string) => void) => () => { fn(state.name); onClose(); };

  return (
    <div
      ref={ref}
      className="agent-ctx-menu"
      style={{ left: state.x, top: state.y }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="agent-ctx-head">{state.name}</div>
      <button onClick={wrap(onAsk)}>💬 Ask directly</button>
      <button onClick={wrap(onAssign)}>➡ Assign task…</button>
      <button onClick={wrap(onOpen)}>👁 Open details</button>
      <button onClick={wrap(onEdit)}>✎ Edit</button>
      <button onClick={wrap(onAddChild)}>＋ Add child</button>
      <div className="agent-ctx-sep" />
      <button className="danger" onClick={wrap(onDelete)}>🗑 Delete</button>
    </div>
  );
}
