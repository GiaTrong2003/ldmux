import { useState, useCallback } from 'react';
import { Tabs, TabDef } from './components/common/Tabs';
import { WorkersTab } from './components/workers/WorkersTab';
import { ErrorsTab } from './components/workers/ErrorsTab';
import { LiveTab } from './components/live/LiveTab';
import { AgentsTab } from './components/agents/AgentsTab';
import { CompanyTab } from './components/company/CompanyTab';
import { DebugTab } from './components/debug/DebugTab';
import { usePolling } from './hooks/usePolling';
import { listWorkers, mergeAll, cleanAll } from './api/workers';
import { listAgents } from './api/agents';
import type { WorkerStatus, AgentWithSession } from './types/api';
import './App.css';

type TabKey = 'workers' | 'errors' | 'live' | 'agents' | 'company' | 'debug';

export default function App() {
  const [tab, setTab] = useState<TabKey>('workers');
  const [paused, setPaused] = useState(false);

  const workers = usePolling<WorkerStatus[]>(listWorkers, 3000, paused);
  const agents = usePolling<AgentWithSession[]>(listAgents, 3000, paused);

  const ws = workers.data ?? [];
  const as = agents.data ?? [];
  const errorCount = ws.filter(w => w.status === 'error').length;
  const activeCount = ws.filter(w => ['pending', 'running', 'waiting', 'sleep'].includes(w.status)).length;

  const tabs: TabDef<TabKey>[] = [
    { key: 'workers', label: 'Workers', badge: ws.length },
    { key: 'errors', label: 'Errors', badge: errorCount, badgeKind: 'error' },
    { key: 'live', label: 'Live', badge: activeCount },
    { key: 'agents', label: 'Agents', badge: as.length },
    { key: 'company', label: 'Company', badge: as.filter(a => a.role).length },
    { key: 'debug', label: 'Debug' },
  ];

  const handleMerge = useCallback(async () => {
    try {
      const r = await mergeAll();
      alert(r.output ? 'Merged output saved.' : 'Merge done.');
    } catch (err: any) {
      alert('Merge failed: ' + err.message);
    }
  }, []);

  const handleClean = useCallback(async () => {
    if (!confirm('Clean all worker data? This removes .ldmux/workers/ entirely.')) return;
    try {
      await cleanAll();
      workers.refresh();
      agents.refresh();
    } catch (err: any) {
      alert('Clean failed: ' + err.message);
    }
  }, [workers, agents]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>ldmux</h1>
          <span className="app-tagline">Dashboard</span>
        </div>
        <div className="app-actions">
          <button onClick={() => { workers.refresh(); agents.refresh(); }}>Refresh</button>
          <button
            onClick={() => setPaused(p => !p)}
            className={paused ? 'danger' : ''}
            title={paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
          >
            {paused ? 'Paused' : 'Auto 3s'}
          </button>
          <button className="primary" onClick={handleMerge}>Merge all</button>
          <button className="danger" onClick={handleClean}>Clean</button>
        </div>
      </header>

      <main className="app-container">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'workers' && (
          <WorkersTab workers={ws} onChanged={workers.refresh} />
        )}
        {tab === 'errors' && (
          <ErrorsTab workers={ws.filter(w => w.status === 'error')} onChanged={workers.refresh} />
        )}
        {tab === 'live' && <LiveTab paused={paused} />}
        {tab === 'agents' && (
          <AgentsTab agents={as} onChanged={agents.refresh} />
        )}
        {tab === 'company' && (
          <CompanyTab paused={paused} onAgentsChanged={agents.refresh} />
        )}
        {tab === 'debug' && <DebugTab paused={paused} />}
      </main>
    </div>
  );
}
