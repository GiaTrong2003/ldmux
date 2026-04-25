import express from 'express';
import path from 'path';
import {
  listWorkers, listWorkersLive, readOutput, readOutputTail, readOutputTailLines, readStatus, readTask, clearOutput, cleanWorkers, readSession,
  readConversations, readConversationsTail, deleteConversations, appendConversation, readCompanyConfig, writeCompanyConfig,
} from '../file-comm';
import { spawnWorker, stopWorker } from '../worker';
import { mergeOutputs } from '../merge';
import { listAgents, readAgentConfig, updateAgentConfig, deleteAgent, resolveEffectiveAutonomy, createAgent, agentExists } from '../agent-config';
import { resetAgent, askAgent, listLiveProcs, killAgentProcesses } from '../agent';
import { getAgentTrace, readRawTrace } from '../trace';
import { writeStatus } from '../file-comm';

const PORT = 3700;

export function startGui(baseDir: string, agentDir: string = baseDir): void {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // API: List all workers
  app.get('/api/workers', (_req, res) => {
    const workers = listWorkers(baseDir);
    res.json(workers);
  });

  // API: List workers enriched with liveness info (PID alive check, output mtime/size)
  app.get('/api/workers/live', (_req, res) => {
    res.json(listWorkersLive(baseDir));
  });

  // API: Get worker output
  app.get('/api/workers/:name/output', (req, res) => {
    const output = readOutput(baseDir, req.params.name);
    res.json({ name: req.params.name, output });
  });

  // API: Incremental tail — returns only bytes appended since `since`
  app.get('/api/workers/:name/tail', (req, res) => {
    const since = parseInt(String(req.query.since || '0'), 10) || 0;
    const { chunk, size } = readOutputTail(baseDir, req.params.name, since);
    res.json({ name: req.params.name, chunk, size });
  });

  // API: Get worker status
  app.get('/api/workers/:name/status', (req, res) => {
    const status = readStatus(baseDir, req.params.name);
    if (status) {
      res.json(status);
    } else {
      res.status(404).json({ error: 'Worker not found' });
    }
  });

  // API: Create new worker
  app.post('/api/workers', (req, res) => {
    const { name, prompt, cwd, agent } = req.body;
    if (!name || !prompt) {
      res.status(400).json({ error: 'name and prompt are required' });
      return;
    }
    try {
      spawnWorker(baseDir, { name, prompt, cwd, agent });
      res.json({ success: true, name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Stop a worker
  app.post('/api/workers/:name/stop', (req, res) => {
    const stopped = stopWorker(req.params.name);
    res.json({ success: stopped, name: req.params.name });
  });

  // API: Retry a worker — reuses original prompt, clears old output
  app.post('/api/workers/:name/retry', (req, res) => {
    const name = req.params.name;
    const current = readStatus(baseDir, name);
    if (current && current.status === 'running') {
      res.status(409).json({ error: 'Worker is currently running. Stop it first.' });
      return;
    }
    const prompt = readTask(baseDir, name);
    if (!prompt) {
      res.status(404).json({ error: 'Task file not found — cannot retry.' });
      return;
    }
    try {
      stopWorker(name); // no-op if not tracked; safety
      clearOutput(baseDir, name);
      spawnWorker(baseDir, { name, prompt });
      res.json({ success: true, name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Persistent agents ---

  // API: List all agents (those with agent.json) + session stats
  app.get('/api/agents', (_req, res) => {
    const agents = listAgents(agentDir).map(cfg => {
      const session = readSession(agentDir, cfg.name);
      const status = readStatus(agentDir, cfg.name);
      return {
        ...cfg,
        status: status?.status,
        turns: session?.turns ?? 0,
        totalCostUsd: session?.totalCostUsd ?? 0,
        lastActiveAt: session?.lastActiveAt,
        hasSession: !!session,
      };
    });
    res.json(agents);
  });

  // API: Get single agent config + session/status
  app.get('/api/agents/:name', (req, res) => {
    const cfg = readAgentConfig(agentDir, req.params.name);
    if (!cfg) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    const session = readSession(agentDir, cfg.name);
    const status = readStatus(agentDir, cfg.name);
    res.json({
      ...cfg,
      status: status?.status,
      turns: session?.turns ?? 0,
      totalCostUsd: session?.totalCostUsd ?? 0,
      lastActiveAt: session?.lastActiveAt,
      hasSession: !!session,
    });
  });

  // API: Update agent config (soul/skill/cwd/model/role/reportsTo/autonomy). Pass null to clear a field.
  // Query `?reset=true` resets the session after save if any prompt-affecting field changed.
  app.patch('/api/agents/:name', (req, res) => {
    const { soul, skill, cwd, model, role, reportsTo, autonomy } = req.body ?? {};
    const status = readStatus(agentDir, req.params.name);
    if (status?.status === 'running') {
      res.status(409).json({ error: 'Agent is running. Wait for it to finish before editing.' });
      return;
    }
    try {
      const { updated, soulOrSkillChanged } = updateAgentConfig(agentDir, req.params.name, {
        soul, skill, cwd, model, role, reportsTo, autonomy,
      });
      let didReset = false;
      if (req.query.reset === 'true' && soulOrSkillChanged) {
        resetAgent(agentDir, req.params.name);
        didReset = true;
      }
      res.json({ success: true, updated, soulOrSkillChanged, didReset });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // API: Delete agent (removes entire folder: config, session, history, logs)
  app.delete('/api/agents/:name', (req, res) => {
    const status = readStatus(agentDir, req.params.name);
    if (status?.status === 'running') {
      res.status(409).json({ error: 'Agent is running. Stop or wait before deleting.' });
      return;
    }
    try {
      deleteAgent(agentDir, req.params.name);
      res.json({ success: true });
    } catch (err: any) {
      const msg = err.message as string;
      const code = msg.includes('not found') ? 404 : 400;
      res.status(code).json({ error: msg });
    }
  });

  // API: Reset agent session (force). Kills any in-flight claude process
  // for this agent, then wipes session.json/history.jsonl/output.log and
  // sets status back to 'sleep'. Keeps soul/skill config.
  app.post('/api/agents/:name/reset', (req, res) => {
    try {
      resetAgent(agentDir, req.params.name);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // API: Merge all outputs
  app.post('/api/merge', (_req, res) => {
    const merged = mergeOutputs(baseDir);
    res.json({ success: true, output: merged });
  });

  // API: Clean all workers
  app.post('/api/clean', (_req, res) => {
    cleanWorkers(baseDir);
    res.json({ success: true });
  });

  // --- Company (hierarchy of agents) ---

  // API: Company snapshot — agents (with hierarchy + effective autonomy), override, recent conversations
  app.get('/api/company', (_req, res) => {
    const company = readCompanyConfig(agentDir);
    const agents = listAgents(agentDir).map(cfg => {
      const session = readSession(agentDir, cfg.name);
      const status = readStatus(agentDir, cfg.name);
      return {
        ...cfg,
        status: status?.status,
        turns: session?.turns ?? 0,
        totalCostUsd: session?.totalCostUsd ?? 0,
        lastActiveAt: session?.lastActiveAt,
        hasSession: !!session,
        effectiveAutonomy: resolveEffectiveAutonomy(agentDir, cfg),
      };
    });
    res.json({
      agents,
      autonomyOverride: company.autonomyOverride ?? null,
      conversations: readConversations(agentDir, 200),
    });
  });

  // API: Conversation tail (incremental by byte offset)
  // API: Add members to a group-id thread (writes a system marker entry that extends participants)
  app.post('/api/conversations/:groupId/members', (req, res) => {
    const { agents } = req.body ?? {};
    const groupId = req.params.groupId;
    if (!groupId || !Array.isArray(agents) || agents.length === 0) {
      res.status(400).json({ error: 'groupId + non-empty agents[] required' });
      return;
    }
    const newAgents = agents.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (newAgents.length === 0) {
      res.status(400).json({ error: 'agents must contain non-empty strings' });
      return;
    }
    const existing = readConversations(agentDir).filter(e => e.groupId === groupId);
    if (existing.length === 0) {
      res.status(404).json({ error: `No thread found with groupId ${groupId}` });
      return;
    }
    const union = new Set<string>();
    for (const e of existing) {
      (e.participants && e.participants.length > 0 ? e.participants : [e.from, e.to]).forEach(p => union.add(p));
    }
    newAgents.forEach(a => union.add(a));
    const participants = [...union].sort();
    const joined = newAgents.join(', ');
    appendConversation(agentDir, {
      from: 'system',
      to: '*',
      question: '',
      answer: `Added ${joined} to the thread.`,
      timestamp: new Date().toISOString(),
      durationMs: 0,
      costUsd: 0,
      groupId,
      participants,
    });
    res.json({ success: true, participants });
  });

  // API: Delete a conversation thread (by groupId or sorted pair)
  app.delete('/api/conversations', (req, res) => {
    const { groupId, pair } = req.body ?? {};
    if (!groupId && !(Array.isArray(pair) && pair.length === 2)) {
      res.status(400).json({ error: 'provide groupId or pair=[string,string]' });
      return;
    }
    const removed = deleteConversations(agentDir, {
      groupId: typeof groupId === 'string' ? groupId : undefined,
      pair: Array.isArray(pair) ? [String(pair[0]), String(pair[1])] : undefined,
    });
    res.json({ success: true, removed });
  });

  app.get('/api/conversations', (req, res) => {
    const since = parseInt(String(req.query.since || '0'), 10) || 0;
    const { chunk, size } = readConversationsTail(agentDir, since);
    res.json({ chunk, size });
  });

  // API: Set/clear global autonomy override
  app.post('/api/company/autonomy', (req, res) => {
    const { override } = req.body ?? {};
    if (override !== 'auto' && override !== 'manual' && override !== null && override !== undefined) {
      res.status(400).json({ error: 'override must be "auto", "manual", or null' });
      return;
    }
    writeCompanyConfig(agentDir, { autonomyOverride: override ?? null });
    res.json({ success: true, autonomyOverride: override ?? null });
  });

  // API: Ask any agent directly (used by kick-off + per-node ask). Blocking.
  app.post('/api/agents/:name/ask', async (req, res) => {
    const { question, from, groupId, participants } = req.body ?? {};
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'question is required (string)' });
      return;
    }
    const fromAgent = typeof from === 'string' && from.trim() ? from.trim() : 'user';
    const gid = typeof groupId === 'string' && groupId.trim() ? groupId.trim() : undefined;
    const parts = Array.isArray(participants) ? participants.filter((x): x is string => typeof x === 'string') : undefined;
    try {
      const r = await askAgent(agentDir, req.params.name, question, {
        from: fromAgent,
        groupId: gid,
        participants: parts,
      });
      res.json({ success: true, ...r });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Create an agent (used by GUI "Init company" / quick-add)
  app.post('/api/agents', (req, res) => {
    const { name, soul, skill, cwd, model, role, reportsTo, autonomy, overwrite } = req.body ?? {};
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    try {
      if (!overwrite && agentExists(agentDir, name)) {
        res.status(409).json({ error: `Agent "${name}" already exists` });
        return;
      }
      const cfg = createAgent(agentDir, { name, soul, skill, cwd, model, role, reportsTo, autonomy, overwrite });
      writeStatus(agentDir, name, { name, status: 'sleep', startedAt: cfg.createdAt });
      res.json({ success: true, agent: cfg });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Debug page (live processes) ---

  app.get('/api/debug/live-procs', (_req, res) => {
    res.json(listLiveProcs());
  });

  app.get('/api/agents/:name/output/tail', (req, res) => {
    const name = req.params.name;
    if (req.query.lines !== undefined) {
      const lines = parseInt(String(req.query.lines), 10) || 40;
      res.json({ name, ...readOutputTailLines(agentDir, name, lines) });
      return;
    }
    const since = parseInt(String(req.query.since || '0'), 10) || 0;
    const { chunk, size } = readOutputTail(agentDir, name, since);
    res.json({ name, chunk, size });
  });

  app.post('/api/agents/:name/kill', (req, res) => {
    const killed = killAgentProcesses(req.params.name);
    res.json({ success: true, killed });
  });

  // --- Turn timeline (per-turn trace from Claude Code JSONL) ---

  app.get('/api/agents/:name/trace', (req, res) => {
    try {
      res.json(getAgentTrace(agentDir, req.params.name));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/agents/:name/trace/raw', (req, res) => {
    try {
      const { tracePath, raw } = readRawTrace(agentDir, req.params.name);
      res.json({ tracePath, raw });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log('');
    console.log('  ┌─────────────────────────────────────┐');
    console.log('  │        ldmux - Web Dashboard         │');
    console.log('  │                                      │');
    console.log(`  │   http://localhost:${PORT}              │`);
    console.log('  │                                      │');
    console.log('  │   Press Ctrl+C to stop               │');
    console.log('  └─────────────────────────────────────┘');
    console.log('');
  });
}
