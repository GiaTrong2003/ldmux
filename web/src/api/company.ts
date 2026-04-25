import { apiGet, apiPost, apiDelete } from './client';
import type { CompanyResponse, TailResponse, Autonomy } from '../types/api';

export const getCompany = () => apiGet<CompanyResponse>('/api/company');

export const setAutonomyOverride = (override: Autonomy | null) =>
  apiPost<{ success: boolean; autonomyOverride: Autonomy | null }>('/api/company/autonomy', { override });

export const tailConversations = (since: number) =>
  apiGet<TailResponse>(`/api/conversations?since=${since}`);

export const deleteConversationThread = (filter: { groupId?: string; pair?: [string, string] }) =>
  apiDelete<{ success: boolean; removed: number }>(`/api/conversations`, filter);

export const addThreadMembers = (groupId: string, agents: string[]) =>
  apiPost<{ success: boolean; participants: string[] }>(
    `/api/conversations/${encodeURIComponent(groupId)}/members`,
    { agents }
  );
