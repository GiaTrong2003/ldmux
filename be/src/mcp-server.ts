import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getAgentBaseDir,
  listWorkers,
  readSession,
  readHistory,
  readStatus,
} from './file-comm';
import { readAgentConfig, createAgent } from './agent-config';
import { askAgent } from './agent';

export async function startMcpServer(): Promise<void> {
  const baseDir = getAgentBaseDir();

  const server = new McpServer({
    name: 'ldmux',
    version: '1.1.0',
  });

  // Tool: list_agents
  server.registerTool(
    'list_agents',
    {
      description:
        'List all persistent agents managed by ldmux, with their status, skill, and session stats. Use this to discover which sub-agents are available to ask.',
      inputSchema: {},
    },
    async () => {
      const agents = listWorkers(baseDir)
        .filter(w => readAgentConfig(baseDir, w.name))
        .map(w => {
          const cfg = readAgentConfig(baseDir, w.name)!;
          const s = readSession(baseDir, w.name);
          return {
            name: cfg.name,
            soul: cfg.soul,
            skill: cfg.skill,
            cwd: cfg.cwd,
            model: cfg.model,
            status: w.status,
            turns: s?.turns ?? 0,
            totalCostUsd: s?.totalCostUsd ?? 0,
            lastActiveAt: s?.lastActiveAt,
          };
        });
      return {
        content: [{ type: 'text', text: JSON.stringify(agents, null, 2) }],
      };
    }
  );

  // Tool: ask_agent
  server.registerTool(
    'ask_agent',
    {
      description:
        'Send a question to a persistent ldmux agent and get its answer. The agent remembers prior turns via session resume. Use this when you need specialized knowledge from another agent (e.g. a backend-focused agent while you are working on frontend).',
      inputSchema: {
        name: z.string().describe('Agent name (from list_agents)'),
        question: z.string().describe('Question or instruction to send to the agent'),
      },
    },
    async ({ name, question }) => {
      try {
        const from = process.env.LDMUX_AGENT_NAME || 'user';
        // Inherit the parent thread so this sub-call's reply lands in the
        // same Conversation Feed thread as the user's original ask, instead
        // of spawning a new pair-thread for every hop.
        const groupId = process.env.LDMUX_GROUP_ID || undefined;
        const inherited = (process.env.LDMUX_PARTICIPANTS || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const participants = inherited.length > 0
          ? Array.from(new Set([...inherited, from, name])).sort()
          : undefined;
        const r = await askAgent(baseDir, name, question, { from, groupId, participants });
        return {
          content: [
            {
              type: 'text',
              text: r.answer,
            },
            {
              type: 'text',
              text: `\n---\n[session ${r.sessionId.slice(0, 8)}, ${(r.durationMs / 1000).toFixed(2)}s, $${r.costUsd.toFixed(4)}]`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${err.message}` }],
        };
      }
    }
  );

  // Tool: get_agent_history
  server.registerTool(
    'get_agent_history',
    {
      description:
        'Fetch the conversation history of an agent. Each entry has role (user/assistant), content, timestamp, and cost/duration for assistant turns.',
      inputSchema: {
        name: z.string().describe('Agent name'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Return only the last N turns (default: all)'),
      },
    },
    async ({ name, limit }) => {
      const cfg = readAgentConfig(baseDir, name);
      if (!cfg) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Agent "${name}" not found.` }],
        };
      }
      let history = readHistory(baseDir, name);
      if (limit) history = history.slice(-limit);
      return {
        content: [{ type: 'text', text: JSON.stringify(history, null, 2) }],
      };
    }
  );

  // Tool: create_agent
  server.registerTool(
    'create_agent',
    {
      description:
        'Create a new persistent agent with a name, optional soul (personality/role), skill (expertise), cwd (working directory), and model. Soul and skill are baked into the first session; changing them later requires a reset.',
      inputSchema: {
        name: z
          .string()
          .regex(/^[a-zA-Z0-9._-]+$/)
          .describe('Unique name (alphanumeric, dot, dash, underscore)'),
        soul: z
          .string()
          .optional()
          .describe('Personality or role, e.g. "You are a concise backend architect who reads code before answering."'),
        skill: z
          .string()
          .optional()
          .describe('Area of expertise, e.g. "Java Spring Boot, PostgreSQL, OAuth2"'),
        cwd: z
          .string()
          .optional()
          .describe('Working directory for the agent to operate in (absolute path recommended)'),
        model: z
          .string()
          .optional()
          .describe('Model alias: opus, sonnet, haiku'),
        overwrite: z
          .boolean()
          .optional()
          .describe('Overwrite if agent already exists (default false)'),
      },
    },
    async ({ name, soul, skill, cwd, model, overwrite }) => {
      try {
        const cfg = createAgent(baseDir, { name, soul, skill, cwd, model, overwrite });
        return {
          content: [
            { type: 'text', text: `Agent "${cfg.name}" created.` },
            { type: 'text', text: JSON.stringify(cfg, null, 2) },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${err.message}` }],
        };
      }
    }
  );

  // Connect via stdio — stdout is reserved for JSON-RPC framing, stderr for logs
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr only (never stdout)
  process.stderr.write('ldmux MCP server ready. Tools: list_agents, ask_agent, get_agent_history, create_agent\n');
}
