import './Tabs.css';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  badge?: number;
  badgeKind?: 'default' | 'error';
}

interface Props<K extends string> {
  tabs: TabDef<K>[];
  active: K;
  onChange: (key: K) => void;
}

export function Tabs<K extends string>({ tabs, active, onChange }: Props<K>) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button
          key={t.key}
          className={'tab' + (active === t.key ? ' active' : '')}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.badge !== undefined && (
            <span className={'tab-badge' + (t.badgeKind === 'error' ? ' error' : '')}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
