import fs from 'fs';
import path from 'path';
import { ensureWorkerDir, getWorkerDir, getWorkersDir, readCompanyConfig } from './file-comm';

export type Autonomy = 'auto' | 'manual';

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

export function writeAgentConfig(baseDir: string, cfg: AgentConfig): void {
  const dir = ensureWorkerDir(baseDir, cfg.name);
  fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(cfg, null, 2));
}

export function readAgentConfig(baseDir: string, name: string): AgentConfig | null {
  const p = path.join(getWorkerDir(baseDir, name), 'agent.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function agentExists(baseDir: string, name: string): boolean {
  return readAgentConfig(baseDir, name) !== null;
}

export function createAgent(
  baseDir: string,
  params: {
    name: string;
    soul?: string;
    skill?: string;
    cwd?: string;
    model?: string;
    role?: string;
    reportsTo?: string;
    autonomy?: Autonomy;
    overwrite?: boolean;
  }
): AgentConfig {
  if (!params.name) throw new Error('name is required');
  if (!/^[a-zA-Z0-9._-]+$/.test(params.name)) {
    throw new Error('name must be alphanumeric, dot, dash or underscore only');
  }
  if (!params.overwrite && agentExists(baseDir, params.name)) {
    throw new Error(`Agent "${params.name}" already exists. Use overwrite: true or pick a different name.`);
  }
  const cfg: AgentConfig = {
    name: params.name,
    soul: params.soul || undefined,
    skill: params.skill || undefined,
    cwd: params.cwd || undefined,
    model: params.model || undefined,
    role: params.role || undefined,
    reportsTo: params.reportsTo || undefined,
    autonomy: params.autonomy,
    createdAt: new Date().toISOString(),
  };
  writeAgentConfig(baseDir, cfg);
  return cfg;
}

export function listAgents(baseDir: string): AgentConfig[] {
  const workersDir = getWorkersDir(baseDir);
  if (!fs.existsSync(workersDir)) return [];
  return fs.readdirSync(workersDir)
    .map(name => readAgentConfig(baseDir, name))
    .filter((cfg): cfg is AgentConfig => cfg !== null);
}

export interface AgentUpdate {
  soul?: string | null;
  skill?: string | null;
  cwd?: string | null;
  model?: string | null;
  role?: string | null;
  reportsTo?: string | null;
  autonomy?: Autonomy | null;
}

// Returns { updated, soulOrSkillChanged } — caller decides whether to reset session.
// soulOrSkillChanged is true if any field baked into system-prompt changed.
// Pass `null` on a field to clear it; omit to leave unchanged.
export function updateAgentConfig(
  baseDir: string,
  name: string,
  patch: AgentUpdate
): { updated: AgentConfig; soulOrSkillChanged: boolean } {
  const existing = readAgentConfig(baseDir, name);
  if (!existing) throw new Error(`Agent "${name}" not found`);

  const applyStr = (cur: string | undefined, next: string | null | undefined): string | undefined => {
    if (next === undefined) return cur;
    if (next === null || next === '') return undefined;
    return next;
  };
  const applyAutonomy = (cur: Autonomy | undefined, next: Autonomy | null | undefined): Autonomy | undefined => {
    if (next === undefined) return cur;
    if (next === null) return undefined;
    return next;
  };

  const updated: AgentConfig = {
    ...existing,
    soul: applyStr(existing.soul, patch.soul),
    skill: applyStr(existing.skill, patch.skill),
    cwd: applyStr(existing.cwd, patch.cwd),
    model: applyStr(existing.model, patch.model),
    role: applyStr(existing.role, patch.role),
    reportsTo: applyStr(existing.reportsTo, patch.reportsTo),
    autonomy: applyAutonomy(existing.autonomy, patch.autonomy),
  };

  const soulOrSkillChanged =
    (updated.soul ?? '') !== (existing.soul ?? '') ||
    (updated.skill ?? '') !== (existing.skill ?? '') ||
    (updated.role ?? '') !== (existing.role ?? '') ||
    (updated.reportsTo ?? '') !== (existing.reportsTo ?? '') ||
    (updated.autonomy ?? '') !== (existing.autonomy ?? '');

  writeAgentConfig(baseDir, updated);
  return { updated, soulOrSkillChanged };
}

export function deleteAgent(baseDir: string, name: string): void {
  const dir = getWorkerDir(baseDir, name);
  if (!fs.existsSync(dir)) throw new Error(`Agent "${name}" not found`);
  if (!agentExists(baseDir, name)) {
    throw new Error(`"${name}" is a batch worker, not a persistent agent. Use cleanWorkers for that.`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

export function resolveEffectiveAutonomy(baseDir: string | undefined, cfg: AgentConfig): Autonomy {
  if (baseDir) {
    const company = readCompanyConfig(baseDir);
    if (company.autonomyOverride === 'auto' || company.autonomyOverride === 'manual') {
      return company.autonomyOverride;
    }
  }
  return cfg.autonomy ?? 'auto';
}

export function buildSystemPrompt(cfg: AgentConfig, baseDir?: string): string | undefined {
  const parts: string[] = [];
  if (cfg.soul) parts.push(cfg.soul);
  if (cfg.skill) parts.push(`Your expertise: ${cfg.skill}`);

  // Inject hierarchy block if this agent has a role and we can see the org
  if (baseDir && cfg.role) {
    const siblings = listAgents(baseDir).filter(a => a.name !== cfg.name);
    const subordinates = siblings.filter(a => a.reportsTo === cfg.name);
    const peers = cfg.reportsTo
      ? siblings.filter(a => a.reportsTo === cfg.reportsTo)
      : [];
    const autonomy = resolveEffectiveAutonomy(baseDir, cfg);

    const lines: string[] = [`You are the ${cfg.role} at an AI-run software company. Your handle is "${cfg.name}".`];

    if (cfg.reportsTo) {
      lines.push(
        `Your manager: "${cfg.reportsTo}". When you finish a task, send a concise report back by calling the MCP tool ask_agent with name="${cfg.reportsTo}" and a question starting with "Report:".`
      );
    } else {
      lines.push('You are at the top of the org — you answer to the human user.');
    }

    if (subordinates.length > 0) {
      const names = subordinates.map(s => `"${s.name}"${s.role ? ` (${s.role})` : ''}`).join(', ');
      if (autonomy === 'auto') {
        lines.push(
          `Your direct reports: ${names}. When a request is outside your own expertise or needs parallel work, delegate by calling ask_agent with the subordinate's name. Wait for their answer, then synthesize the final response.`
        );
      } else {
        lines.push(
          `Your direct reports: ${names}. (You are in MANUAL mode — do NOT call ask_agent to delegate. Answer based on your own knowledge; a human will route follow-ups.)`
        );
      }
    }

    if (peers.length > 0) {
      const names = peers.map(p => `"${p.name}"${p.role ? ` (${p.role})` : ''}`).join(', ');
      if (autonomy === 'auto') {
        lines.push(
          `Your peers (same manager): ${names}. For cross-functional handoffs (e.g. backend ↔ frontend), call ask_agent on the relevant peer.`
        );
      } else {
        lines.push(`Your peers: ${names}. (Manual mode — do not call ask_agent.)`);
      }
    }

    if (autonomy === 'manual') {
      lines.push(
        'IMPORTANT: You are in manual routing mode. Do not invoke the ask_agent tool. Give your own best answer only.'
      );
    }

    parts.push(lines.join('\n'));
  }

  if (parts.length === 0) return undefined;
  return parts.join('\n\n');
}
