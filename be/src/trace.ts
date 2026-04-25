import fs from 'fs';
import os from 'os';
import path from 'path';
import { readSession } from './file-comm';

// Claude Code stores per-session traces at:
//   ~/.claude/projects/<encodedCwd>/<sessionId>.jsonl
// where <encodedCwd> is the absolute cwd with `/` (and `.`) replaced by `-`.
// e.g. /root/learn-claude/ldmux/be → -root-learn-claude-ldmux-be
export function encodeCwd(cwd: string): string {
  const abs = path.resolve(cwd);
  // Observed rule: replace path separators with `-`. We have a `findTraceFile`
  // fallback that scans projects/* if this guess misses.
  return abs.replace(/\//g, '-');
}

export function getClaudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

export function resolveTracePath(workDir: string, sessionId: string): string {
  return path.join(getClaudeProjectsDir(), encodeCwd(workDir), `${sessionId}.jsonl`);
}

// Fallback: scan all project dirs for `<sessionId>.jsonl` if encode rule changes
// or workDir wasn't recorded yet.
export function findTraceFile(sessionId: string): string | null {
  const projects = getClaudeProjectsDir();
  if (!fs.existsSync(projects)) return null;
  for (const proj of fs.readdirSync(projects)) {
    const candidate = path.join(projects, proj, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  result?: string;
  isError?: boolean;
  startedAt?: string;
  resultAt?: string;
  durationMs?: number;
}

export interface TurnTrace {
  turnIndex: number;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  userMsg: string;
  assistantText: string;
  thinking: string;
  toolCalls: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
  model?: string;
  isError?: boolean;
}

export interface AgentTrace {
  agentName: string;
  sessionId: string;
  workDir: string | null;
  tracePath: string | null;
  exists: boolean;
  turns: TurnTrace[];
}

function asString(v: any): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map(b => (typeof b === 'string' ? b : (b?.text ?? ''))).join('');
  }
  return '';
}

export function parseTraceFile(filePath: string): TurnTrace[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const turns: TurnTrace[] = [];
  let cur: TurnTrace | null = null;
  // Map tool_use_id → ToolCall so tool_results can be attached.
  const pendingTools = new Map<string, { call: ToolCall; turn: TurnTrace }>();

  const newTurn = (ts: string | null): TurnTrace => ({
    turnIndex: turns.length,
    startedAt: ts,
    endedAt: ts,
    durationMs: null,
    userMsg: '',
    assistantText: '',
    thinking: '',
    toolCalls: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  });

  for (const line of lines) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    const ts: string | null = typeof ev.timestamp === 'string' ? ev.timestamp : null;

    if (ev.type === 'user') {
      const msg = ev.message;
      const content = msg?.content;
      // Tool result — attach to existing call (don't open a new turn).
      if (Array.isArray(content) && content.some((b: any) => b?.type === 'tool_result')) {
        for (const b of content) {
          if (b?.type !== 'tool_result') continue;
          const id = b.tool_use_id;
          const entry = pendingTools.get(id);
          if (!entry) continue;
          entry.call.result = asString(b.content);
          entry.call.isError = !!b.is_error;
          entry.call.resultAt = ts ?? entry.call.resultAt;
          if (entry.call.startedAt && entry.call.resultAt) {
            entry.call.durationMs =
              new Date(entry.call.resultAt).getTime() -
              new Date(entry.call.startedAt).getTime();
          }
          pendingTools.delete(id);
        }
        if (cur && ts) cur.endedAt = ts;
        continue;
      }
      // Plain user message — start a new turn.
      cur = newTurn(ts);
      cur.userMsg = asString(content);
      turns.push(cur);
    } else if (ev.type === 'assistant') {
      if (!cur) { cur = newTurn(ts); turns.push(cur); }
      const msg = ev.message;
      if (msg?.model && !cur.model) cur.model = msg.model;
      const blocks = Array.isArray(msg?.content) ? msg.content : [];
      for (const b of blocks) {
        if (b?.type === 'text') {
          cur.assistantText += (cur.assistantText ? '\n' : '') + (b.text ?? '');
        } else if (b?.type === 'thinking') {
          cur.thinking += (cur.thinking ? '\n' : '') + (b.thinking ?? '');
        } else if (b?.type === 'tool_use') {
          const call: ToolCall = {
            id: b.id,
            name: b.name,
            input: b.input,
            startedAt: ts ?? undefined,
          };
          cur.toolCalls.push(call);
          pendingTools.set(b.id, { call, turn: cur });
        }
      }
      const u = msg?.usage;
      if (u) {
        cur.usage.inputTokens += u.input_tokens || 0;
        cur.usage.outputTokens += u.output_tokens || 0;
        cur.usage.cacheCreationInputTokens += u.cache_creation_input_tokens || 0;
        cur.usage.cacheReadInputTokens += u.cache_read_input_tokens || 0;
      }
      if (ts) cur.endedAt = ts;
    }
  }

  for (const t of turns) {
    if (t.startedAt && t.endedAt) {
      t.durationMs = new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime();
    }
  }
  return turns;
}

export function getAgentTrace(baseDir: string, name: string): AgentTrace {
  const session = readSession(baseDir, name);
  if (!session) {
    return { agentName: name, sessionId: '', workDir: null, tracePath: null, exists: false, turns: [] };
  }
  const workDir = session.workDir ?? null;
  let tracePath: string | null = null;
  if (workDir) {
    const p = resolveTracePath(workDir, session.sessionId);
    if (fs.existsSync(p)) tracePath = p;
  }
  if (!tracePath) tracePath = findTraceFile(session.sessionId);
  const exists = !!tracePath && fs.existsSync(tracePath);
  return {
    agentName: name,
    sessionId: session.sessionId,
    workDir,
    tracePath,
    exists,
    turns: exists && tracePath ? parseTraceFile(tracePath) : [],
  };
}

export function readRawTrace(baseDir: string, name: string): { tracePath: string | null; raw: string } {
  const session = readSession(baseDir, name);
  if (!session) return { tracePath: null, raw: '' };
  let tracePath: string | null = null;
  if (session.workDir) {
    const p = resolveTracePath(session.workDir, session.sessionId);
    if (fs.existsSync(p)) tracePath = p;
  }
  if (!tracePath) tracePath = findTraceFile(session.sessionId);
  if (!tracePath || !fs.existsSync(tracePath)) return { tracePath, raw: '' };
  return { tracePath, raw: fs.readFileSync(tracePath, 'utf-8') };
}
