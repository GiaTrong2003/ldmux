import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  useNodesState,
  type Node,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { AgentNode } from './AgentNode';
import type { AgentWithSession } from '../../types/api';
import './OrgChart.css';

const NODE_W = 200;
const NODE_H = 82;
const H_GAP = 40;
const V_GAP = 64;

const nodeTypes = { agent: AgentNode };

interface Props {
  agents: AgentWithSession[];
  activeEdges?: Set<string>; // edge ids ("parent-child") currently delegating
  onOpenNode: (name: string) => void;
  onAddAgent: (parent: string | null) => void;
  onContextMenu: (name: string, x: number, y: number) => void;
  onEdgeAssign: (parent: string, child: string) => void;
}

function computeLevels(agents: AgentWithSession[]): Map<string, number> {
  const byName = new Map(agents.map(a => [a.name, a]));
  const level = new Map<string, number>();
  const walk = (name: string, seen: Set<string>): number => {
    if (seen.has(name)) return 0;
    seen.add(name);
    const cached = level.get(name);
    if (cached !== undefined) return cached;
    const a = byName.get(name);
    const d = a?.reportsTo && byName.has(a.reportsTo) ? 1 + walk(a.reportsTo, seen) : 0;
    level.set(name, d);
    return d;
  };
  agents.forEach(a => walk(a.name, new Set()));
  return level;
}

function layoutPositions(agents: AgentWithSession[]): Map<string, { x: number; y: number }> {
  const level = computeLevels(agents);
  const rows = new Map<number, AgentWithSession[]>();
  agents.forEach(a => {
    const l = level.get(a.name) ?? 0;
    if (!rows.has(l)) rows.set(l, []);
    rows.get(l)!.push(a);
  });
  const maxRow = Math.max(...Array.from(rows.values()).map(r => r.length), 1);
  const chartW = Math.max(800, maxRow * (NODE_W + H_GAP) + H_GAP);
  const out = new Map<string, { x: number; y: number }>();
  for (const [l, row] of rows.entries()) {
    const totalW = row.length * NODE_W + (row.length - 1) * H_GAP;
    const startX = (chartW - totalW) / 2;
    row.forEach((a, i) => {
      out.set(a.name, { x: startX + i * (NODE_W + H_GAP), y: l * (NODE_H + V_GAP) + V_GAP / 2 });
    });
  }
  return out;
}

export function OrgChart({ agents, activeEdges, onOpenNode, onAddAgent, onContextMenu, onEdgeAssign }: Props) {
  const [nodes, setNodes, onNodesChangeDefault] = useNodesState<Node>([]);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const auto = layoutPositions(agents);
    const next: Node[] = agents.map(a => {
      const existing = positionsRef.current.get(a.name);
      const position = existing ?? auto.get(a.name) ?? { x: 0, y: 0 };
      positionsRef.current.set(a.name, position);
      return {
        id: a.name,
        type: 'agent',
        position,
        data: { agent: a, onOpen: onOpenNode, onContextMenu },
        draggable: true,
        selectable: true,
      };
    });
    const keep = new Set(agents.map(a => a.name));
    for (const k of Array.from(positionsRef.current.keys())) {
      if (!keep.has(k)) positionsRef.current.delete(k);
    }
    setNodes(next);
  }, [agents, onOpenNode, onContextMenu, setNodes]);

  const edges = useMemo<Edge[]>(() => {
    const names = new Set(agents.map(a => a.name));
    const out: Edge[] = [];
    for (const a of agents) {
      if (a.reportsTo && names.has(a.reportsTo)) {
        const id = `${a.reportsTo}-${a.name}`;
        const hot = activeEdges?.has(id) ?? false;
        out.push({
          id,
          source: a.reportsTo,
          target: a.name,
          type: 'smoothstep',
          animated: hot,
          className: hot ? 'edge-delegated' : undefined,
          style: { stroke: hot ? '#ffaa00' : '#6b7280', strokeWidth: hot ? 2.4 : 1.6 },
          markerEnd: { type: MarkerType.ArrowClosed, color: hot ? '#ffaa00' : '#6b7280' },
          label: '⇅ assign',
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 4,
          labelStyle: { fontSize: 10, fill: '#d0d7de' },
          labelBgStyle: { fill: 'rgba(30,30,30,0.6)' },
        });
      }
    }
    return out;
  }, [agents, activeEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      onNodesChangeDefault(changes);
      for (const c of changes) {
        if (c.type === 'position' && c.position) {
          positionsRef.current.set(c.id, c.position);
        }
      }
    },
    [onNodesChangeDefault]
  );

  const minimapColor = useCallback((n: Node) => {
    const s = (n.data as any)?.agent?.status;
    if (s === 'running') return 'var(--warn)';
    if (s === 'waiting') return 'var(--ok)';
    if (s === 'error') return 'var(--err)';
    return 'var(--fg-dim)';
  }, []);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    onEdgeAssign(edge.source, edge.target);
  }, [onEdgeAssign]);

  return (
    <div className="org-chart">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgeClick={handleEdgeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable
        elementsSelectable
        panOnDrag
        zoomOnScroll
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background color="#21262d" gap={24} />
        <Controls showInteractive={false} />
        <Panel position="top-right" className="org-chart-panel">
          <button className="primary" onClick={() => onAddAgent(null)}>+ Add agent</button>
          <span className="org-chart-hint">Click edge = assign task · Right-click node = menu</span>
        </Panel>
        <MiniMap
          pannable
          zoomable
          style={{ background: 'var(--bg-0)' }}
          nodeColor={minimapColor}
        />
      </ReactFlow>
    </div>
  );
}
