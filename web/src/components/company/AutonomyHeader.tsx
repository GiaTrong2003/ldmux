import type { Autonomy } from '../../types/api';
import './AutonomyHeader.css';

interface Props {
  override: Autonomy | null;
  onChange: (v: Autonomy | null) => void;
  onInit: () => void;
  onKickoff: () => void;
  hasAgents: boolean;
}

export function AutonomyHeader({ override, onChange, onInit, onKickoff, hasAgents }: Props) {
  const val: 'auto' | 'manual' | 'per-agent' =
    override === 'auto' ? 'auto' : override === 'manual' ? 'manual' : 'per-agent';

  return (
    <div className="company-header">
      <div className="company-header-left">
        <strong>Autonomy</strong>
        <div className="autonomy-toggle">
          <button
            className={val === 'auto' ? 'active' : ''}
            onClick={() => onChange('auto')}
          >ALL auto</button>
          <button
            className={val === 'manual' ? 'active' : ''}
            onClick={() => onChange('manual')}
          >ALL manual</button>
          <button
            className={val === 'per-agent' ? 'active' : ''}
            onClick={() => onChange(null)}
          >Per-agent</button>
        </div>
        <span className="company-header-hint">
          {val === 'auto'   && 'All agents may auto-delegate via ask_agent.'}
          {val === 'manual' && 'No agent may call ask_agent — human routes everything.'}
          {val === 'per-agent' && 'Each agent uses its own setting.'}
        </span>
      </div>
      <div className="company-header-actions">
        <button onClick={onInit}>+ Init company</button>
        <button className="primary" onClick={onKickoff} disabled={!hasAgents}>Kick off task</button>
      </div>
    </div>
  );
}
