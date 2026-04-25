import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import {
  WorkerStatus,
  AgentSession,
  writeStatus,
  readStatus,
  readSession,
  writeSession,
  appendHistory,
  appendConversation,
  getOutputPath,
} from './file-comm';
import { AgentConfig, readAgentConfig, buildSystemPrompt } from './agent-config';

export interface AskResult {
  sessionId: string;
  answer: string;
  durationMs: number;
  costUsd: number;
  isError: boolean;
}

export interface AskOptions {
  from?: string;  // caller agent name (for inter-agent ask) or "user"
  groupId?: string;
  participants?: string[];
}

// In-process registry of live claude child-processes per agent name,
// with the metadata needed by the Debug page (cmd/argv/startedAt/pid).
export interface LiveProcInfo {
  agentName: string;
  pid: number | undefined;
  cmd: string;
  argv: string[];
  startedAt: string;
  uptimeMs: number;
  cwd: string;
}

interface TrackedProc {
  child: ChildProcess;
  cmd: string;
  argv: string[];
  startedAtMs: number;
  startedAt: string;
  cwd: string;
}

const liveProcs = new Map<string, Set<TrackedProc>>();

function trackProc(name: string, info: TrackedProc) {
  let set = liveProcs.get(name);
  if (!set) { set = new Set(); liveProcs.set(name, set); }
  set.add(info);
  const cleanup = () => {
    const s = liveProcs.get(name);
    if (s) { s.delete(info); if (s.size === 0) liveProcs.delete(name); }
  };
  info.child.once('close', cleanup);
  info.child.once('error', cleanup);
}

export function listLiveProcs(): LiveProcInfo[] {
  const now = Date.now();
  const out: LiveProcInfo[] = [];
  for (const [agentName, set] of liveProcs.entries()) {
    for (const p of set) {
      out.push({
        agentName,
        pid: p.child.pid,
        cmd: p.cmd,
        argv: p.argv,
        startedAt: p.startedAt,
        uptimeMs: now - p.startedAtMs,
        cwd: p.cwd,
      });
    }
  }
  return out;
}

export function killAgentProcesses(name: string): number {
  const set = liveProcs.get(name);
  if (!set || set.size === 0) return 0;
  let killed = 0;
  for (const p of set) {
    try { p.child.kill('SIGTERM'); killed++; } catch { /* ignore */ }
  }
  // Hard-kill stragglers shortly after
  setTimeout(() => {
    const later = liveProcs.get(name);
    if (!later) return;
    for (const p of later) {
      try { p.child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }, 500);
  return killed;
}

export function resetAgent(baseDir: string, name: string): void {
  const cfg = readAgentConfig(baseDir, name);
  if (!cfg) throw new Error(`Agent "${name}" not found.`);

  // Abort anything mid-flight for this agent before wiping state.
  killAgentProcesses(name);

  const dir = path.join(baseDir, '.ldmux', 'workers', name);
  for (const f of ['session.json', 'history.jsonl', 'output.log']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  // Reset status back to sleep but keep the original createdAt
  writeStatus(baseDir, name, {
    name,
    status: 'sleep',
    startedAt: cfg.createdAt,
  });
}

export async function askAgent(
  baseDir: string,
  name: string,
  question: string,
  opts: AskOptions = {}
): Promise<AskResult> {
  const cfg = readAgentConfig(baseDir, name);
  if (!cfg) throw new Error(`Agent "${name}" not found. Create it first with: ldmux create`);

  const from = opts.from || 'user';
  const startedAt = Date.now();
  const existing = readSession(baseDir, name);
  const sessionId = existing?.sessionId ?? randomUUID();
  const isFirst = !existing;

  // Thread propagation: if no groupId passed, this ask is the start of a
  // new conversation thread. Generate one + a participants list. The same
  // values get pushed into the child env so any sub-agent calls (via MCP
  // `ask_agent`) attach replies back to *this* thread instead of spawning
  // a new pair-thread for every hop.
  const groupId = opts.groupId || `g-${randomUUID()}`;
  const baseParticipants = opts.participants && opts.participants.length > 0
    ? opts.participants
    : [from, name];
  const participants = Array.from(new Set(baseParticipants.concat([from, name]))).sort();

  // Build claude args
  const args = ['-p', question, '--output-format', 'json'];

  if (isFirst) {
    args.push('--session-id', sessionId);
    const sys = buildSystemPrompt(cfg, baseDir);
    if (sys) {
      args.push('--system-prompt', sys);
    }
  } else {
    args.push('--resume', sessionId);
  }

  if (cfg.model) args.push('--model', cfg.model);

  // Mark state: running
  markStatus(baseDir, name, 'running');
  appendHistory(baseDir, name, {
    role: 'user',
    content: question,
    timestamp: new Date().toISOString(),
    from,
  });

  const workDir = cfg.cwd ? path.resolve(cfg.cwd) : baseDir;
  const cmd = cfg.agent || 'claude';

  const stdout = await runProcess(
    cmd,
    args,
    workDir,
    {
      LDMUX_AGENT_NAME: name,
      LDMUX_BASE_DIR: baseDir,
      LDMUX_GROUP_ID: groupId,
      LDMUX_PARTICIPANTS: participants.join(','),
    },
    name,
    true,
  );

  // Append raw output to log
  const logPath = getOutputPath(baseDir, name);
  fs.appendFileSync(
    logPath,
    `\n---\n[${new Date().toISOString()}] Q: ${question}\n${stdout}\n`
  );

  // Parse JSON result
  let parsed: any;
  try {
    parsed = JSON.parse(stdout.trim().split('\n').filter(Boolean).pop() || '{}');
  } catch (err: any) {
    markStatus(baseDir, name, 'error', `Failed to parse claude JSON output: ${err.message}`);
    throw new Error(`claude did not return valid JSON. Check output log: ${logPath}`);
  }

  if (parsed.is_error || parsed.type !== 'result') {
    const msg = parsed.result || parsed.error || 'Unknown error from claude';
    markStatus(baseDir, name, 'error', msg);
    throw new Error(msg);
  }

  const answer: string = parsed.result ?? '';
  const returnedSessionId: string = parsed.session_id ?? sessionId;
  const durationMs: number = parsed.duration_ms ?? 0;
  const costUsd: number = parsed.total_cost_usd ?? 0;
  const numTurns: number | undefined = typeof parsed.num_turns === 'number' ? parsed.num_turns : undefined;
  const u = parsed.usage || {};
  const usage = {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheCreationInputTokens: u.cache_creation_input_tokens,
    cacheReadInputTokens: u.cache_read_input_tokens,
  };

  // Persist session
  const newSession: AgentSession = {
    sessionId: returnedSessionId,
    turns: (existing?.turns ?? 0) + 1,
    totalCostUsd: (existing?.totalCostUsd ?? 0) + costUsd,
    lastActiveAt: new Date().toISOString(),
    workDir,
  };
  writeSession(baseDir, name, newSession);

  // Record assistant turn
  appendHistory(baseDir, name, {
    role: 'assistant',
    content: answer,
    timestamp: new Date().toISOString(),
    durationMs,
    costUsd,
    numTurns,
    usage,
  });

  // Log cross-agent conversation (flat log across the whole company)
  appendConversation(baseDir, {
    from,
    to: name,
    question,
    answer,
    timestamp: new Date().toISOString(),
    durationMs: durationMs || (Date.now() - startedAt),
    costUsd,
    groupId,
    participants,
  });

  markStatus(baseDir, name, 'waiting');

  return {
    sessionId: returnedSessionId,
    answer,
    durationMs,
    costUsd,
    isError: false,
  };
}

function markStatus(baseDir: string, name: string, status: WorkerStatus['status'], error?: string): void {
  const prev = readStatus(baseDir, name);
  const now = new Date().toISOString();
  const next: WorkerStatus = {
    name,
    status,
    startedAt: prev?.startedAt ?? now,
    lastActiveAt: now,
    error,
  };
  if (status === 'waiting' || status === 'done' || status === 'error') {
    next.finishedAt = now;
  }
  writeStatus(baseDir, name, next);
}

function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
  trackedAgentName?: string,
  trackMeta = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', ...extraEnv },
    });

    if (trackedAgentName) {
      const startedAtMs = Date.now();
      trackProc(trackedAgentName, {
        child,
        cmd,
        argv: args,
        startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        cwd,
      });
    }
    void trackMeta;

    let stdout = '';
    let stderr = '';
    let killedByReset = false;
    child.stdout?.on('data', (b: Buffer) => { stdout += b.toString(); });
    child.stderr?.on('data', (b: Buffer) => { stderr += b.toString(); });

    child.on('error', (err) => reject(err));
    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGKILL') killedByReset = true;
      if (killedByReset) {
        reject(new Error(`${cmd} was cancelled by reset.`));
      } else if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}. stderr: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}
