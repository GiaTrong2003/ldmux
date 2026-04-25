import { apiGet, apiPost } from './client';
import type { WorkerStatus, LiveWorker, TailResponse } from '../types/api';

export const listWorkers = () => apiGet<WorkerStatus[]>('/api/workers');
export const listLive = () => apiGet<LiveWorker[]>('/api/workers/live');
export const getOutput = (name: string) =>
  apiGet<{ name: string; output: string }>(`/api/workers/${encodeURIComponent(name)}/output`);
export const tailOutput = (name: string, since: number) =>
  apiGet<TailResponse & { name: string }>(`/api/workers/${encodeURIComponent(name)}/tail?since=${since}`);
export const createWorker = (body: { name: string; prompt: string; cwd?: string; agent?: string }) =>
  apiPost<{ success: boolean; name: string }>('/api/workers', body);
export const stopWorker = (name: string) =>
  apiPost<{ success: boolean; name: string }>(`/api/workers/${encodeURIComponent(name)}/stop`);
export const retryWorker = (name: string) =>
  apiPost<{ success: boolean; name: string }>(`/api/workers/${encodeURIComponent(name)}/retry`);
export const mergeAll = () => apiPost<{ success: boolean; output: string }>('/api/merge');
export const cleanAll = () => apiPost<{ success: boolean }>('/api/clean');
