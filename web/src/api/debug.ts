import { apiGet, apiPost } from './client';
import type { LiveProcInfo, AgentTrace } from '../types/api';

export const listLiveProcs = () => apiGet<LiveProcInfo[]>('/api/debug/live-procs');

export const tailAgentOutputLines = (name: string, lines = 40) =>
  apiGet<{ name: string; chunk: string; size: number; lines: number }>(
    `/api/agents/${encodeURIComponent(name)}/output/tail?lines=${lines}`
  );

export const killAgent = (name: string) =>
  apiPost<{ success: boolean; killed: number }>(`/api/agents/${encodeURIComponent(name)}/kill`);

export const getAgentTrace = (name: string) =>
  apiGet<AgentTrace>(`/api/agents/${encodeURIComponent(name)}/trace`);

export const getAgentTraceRaw = (name: string) =>
  apiGet<{ tracePath: string | null; raw: string }>(
    `/api/agents/${encodeURIComponent(name)}/trace/raw`
  );
