// Mirror of backend types. Update in sync with src/agent-config.ts and src/file-comm.ts.

export type Autonomy = 'auto' | 'manual';

export type WorkerStatusValue =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'sleep'
  | 'done'
  | 'error';

export interface AgentConfig {
  name: string;
  soul?: string;
  skill?: string;
  cwd?: string;
  model?: string;
  agent?: string;
  role?: string;
  reportsTo?: string;
  autonomy?: Autonomy;
  createdAt: string;
}

export interface WorkerStatus {
  name: string;
  status: WorkerStatusValue;
  pid?: number;
  startedAt?: string;
  finishedAt?: string;
  lastActiveAt?: string;
  error?: string;
}

export interface WorkerLiveness {
  alive: boolean | null;
  lastOutputAt: string | null;
  outputBytes: number;
  idleMs: number | null;
  uptimeMs: number | null;
  isZombie: boolean;
  isStale: boolean;
}

export type LiveWorker = WorkerStatus & WorkerLiveness;

export interface AgentWithSession extends AgentConfig {
  status?: WorkerStatusValue;
  turns: number;
  totalCostUsd: number;
  lastActiveAt?: string;
  hasSession?: boolean;
  effectiveAutonomy?: Autonomy;
}

export interface ConversationEntry {
  from: string;
  to: string;
  question: string;
  answer: string;
  timestamp: string;
  durationMs: number;
  costUsd: number;
  isError?: boolean;
  groupId?: string;
  participants?: string[];
}

export interface CompanyResponse {
  agents: AgentWithSession[];
  autonomyOverride: Autonomy | null;
  conversations: ConversationEntry[];
}

export interface TailResponse {
  chunk: string;
  size: number;
}

export interface LiveProcInfo {
  agentName: string;
  pid?: number;
  cmd: string;
  argv: string[];
  startedAt: string;
  uptimeMs: number;
  cwd: string;
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

export interface AskResult {
  success: boolean;
  sessionId: string;
  answer: string;
  durationMs: number;
  costUsd: number;
  isError: boolean;
}
