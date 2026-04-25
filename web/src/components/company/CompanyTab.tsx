import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '../common/EmptyState';
import { AutonomyHeader } from './AutonomyHeader';
import { OrgChart } from './OrgChart';
import { ConversationFeed } from './ConversationFeed';
import { NodeDrawer } from './NodeDrawer';
import { KickoffModal } from './KickoffModal';
import { InitCompanyModal } from './InitCompanyModal';
import { AddAgentModal } from './AddAgentModal';
import { EditAgentModal } from '../agents/EditAgentModal';
import { AssignTaskModal } from './AssignTaskModal';
import { AgentContextMenu, type ContextMenuState } from './AgentContextMenu';
import { getCompany, setAutonomyOverride } from '../../api/company';
import { deleteAgent } from '../../api/agents';
import { usePolling } from '../../hooks/usePolling';
import type { Autonomy } from '../../types/api';

interface Props {
  paused: boolean;
  onAgentsChanged: () => void;
}

const GLOW_MS = 4000;

export function CompanyTab({ paused, onAgentsChanged }: Props) {
  const { data, refresh } = usePolling(getCompany, 3000, paused);
  const company = data ?? { agents: [], conversations: [], autonomyOverride: null };

  const [drawerName, setDrawerName] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showKickoff, setShowKickoff] = useState(false);
  const [showInit, setShowInit] = useState(false);
  const [addingUnder, setAddingUnder] = useState<string | null | undefined>(undefined);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [assign, setAssign] = useState<{ from: string; to: string[] } | null>(null);

  // Glow edges that just delegated a task (parent-child key).
  const [activeExpiries, setActiveExpiries] = useState<Record<string, number>>({});
  const seenConvTsRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    const convs = company.conversations;
    if (!bootstrappedRef.current) {
      convs.forEach(c => seenConvTsRef.current.add(`${c.timestamp}|${c.from}|${c.to}`));
      bootstrappedRef.current = true;
      return;
    }
    const now = Date.now();
    const additions: Record<string, number> = {};
    for (const c of convs) {
      const key = `${c.timestamp}|${c.from}|${c.to}`;
      if (seenConvTsRef.current.has(key)) continue;
      seenConvTsRef.current.add(key);
      if (c.from === 'user' || c.to === 'user') continue;
      additions[`${c.from}-${c.to}`] = now + GLOW_MS;
    }
    if (Object.keys(additions).length > 0) {
      setActiveExpiries(prev => ({ ...prev, ...additions }));
    }
  }, [company.conversations]);

  useEffect(() => {
    if (Object.keys(activeExpiries).length === 0) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setActiveExpiries(prev => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v > now) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [activeExpiries]);

  const activeEdgeSet = new Set(Object.keys(activeExpiries));

  const handleAutonomy = useCallback(async (v: Autonomy | null) => {
    try {
      await setAutonomyOverride(v);
      refresh();
    } catch (err: any) {
      alert('Autonomy update failed: ' + err.message);
    }
  }, [refresh]);

  const onChanged = useCallback(() => {
    refresh();
    onAgentsChanged();
  }, [refresh, onAgentsChanged]);

  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`Delete agent "${name}"? This removes its config, session, and history.`)) return;
    try {
      await deleteAgent(name);
      onChanged();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  }, [onChanged]);

  const openContextMenu = useCallback((name: string, x: number, y: number) => {
    setCtxMenu({ name, x, y });
  }, []);

  const handleEdgeAssign = useCallback((parent: string, child: string) => {
    setAssign({ from: parent, to: [child] });
  }, []);

  const hasAgents = company.agents.length > 0;

  return (
    <>
      <AutonomyHeader
        override={company.autonomyOverride}
        onChange={handleAutonomy}
        onInit={() => setShowInit(true)}
        onKickoff={() => setShowKickoff(true)}
        hasAgents={hasAgents}
      />

      {!hasAgents ? (
        <EmptyState
          title="No company yet"
          description="Seed a starter hierarchy: CEO + BE/FE/QA managers."
          action={<button className="primary" onClick={() => setShowInit(true)}>Init company</button>}
        />
      ) : (
        <>
          <OrgChart
            agents={company.agents}
            activeEdges={activeEdgeSet}
            onOpenNode={setDrawerName}
            onAddAgent={(parent) => setAddingUnder(parent)}
            onContextMenu={openContextMenu}
            onEdgeAssign={handleEdgeAssign}
          />
          <ConversationFeed
            conversations={company.conversations}
            agents={company.agents}
            onSent={onChanged}
          />
        </>
      )}

      <NodeDrawer
        open={drawerName != null}
        name={drawerName}
        agents={company.agents}
        onClose={() => setDrawerName(null)}
        onChanged={onChanged}
        onEdit={(name) => { setEditing(name); setDrawerName(null); }}
      />

      <KickoffModal
        open={showKickoff}
        agents={company.agents}
        onClose={() => setShowKickoff(false)}
        onDone={onChanged}
      />

      <InitCompanyModal
        open={showInit}
        onClose={() => setShowInit(false)}
        onDone={onChanged}
      />

      <AddAgentModal
        open={addingUnder !== undefined}
        agents={company.agents}
        defaultReportsTo={addingUnder ?? null}
        onClose={() => setAddingUnder(undefined)}
        onDone={onChanged}
      />

      <EditAgentModal
        open={editing != null}
        name={editing}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />

      <AssignTaskModal
        open={assign !== null}
        agents={company.agents}
        defaultFrom={assign?.from ?? 'user'}
        defaultTo={assign?.to ?? null}
        onClose={() => setAssign(null)}
        onDone={onChanged}
      />

      <AgentContextMenu
        state={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onAsk={(name) => setAssign({ from: 'user', to: [name] })}
        onAssign={(name) => setAssign({ from: name, to: [] })}
        onOpen={(name) => setDrawerName(name)}
        onEdit={(name) => setEditing(name)}
        onAddChild={(parent) => setAddingUnder(parent)}
        onDelete={handleDelete}
      />
    </>
  );
}
