#!/usr/bin/env node
import path from 'path';
import { loadPlan, executePlan, listPlanWorkers } from './orchestrator';
import { spawnWorker } from './worker';
import { mergeOutputs } from './merge';
import { cleanWorkers, listWorkers, readSession, getAgentBaseDir } from './file-comm';
import { startGui } from './gui/server';
import { runCreateWizard, runEditWizard } from './wizard';
import { startMcpServer } from './mcp-server';
import { startChat } from './repl';
import { askAgent, resetAgent } from './agent';
import { readAgentConfig, createAgent, agentExists } from './agent-config';
import { writeStatus } from './file-comm';
import readline from 'readline';

const BASE_DIR = process.cwd();
const AGENT_DIR = getAgentBaseDir();

function printHelp(): void {
  console.log(`
  ldmux - Local dmux for Windows Terminal
  ========================================

  Multi-agent orchestrator that runs Claude Code sessions in parallel.

  Usage:
    npx ts-node src/index.ts <command> [options]

  Persistent agents (Layer 1 - session resume):
    create                Interactive wizard to create a new agent
    edit <name>           Edit an existing agent (soul/skill/cwd/model)
    ask <name> <question> Ask a question to an agent (reuses session)
    chat <name>           Open a REPL chat with an agent
    agents                List all agents with their session info
    reset <name>          Clear session + history, keep soul/skill
    mcp                   Run MCP server on stdio (for Claude Code integration)

  Batch workers (original one-shot mode):
    new <prompt>          Create a single worker with the given prompt
    run <plan.json>       Execute a task plan from JSON file
    list                  List all workers and their status
    merge                 Merge all worker outputs into one file
    gui                   Start the web dashboard (http://localhost:3700)
    clean                 Remove all worker data
    help                  Show this help message

  Company (hierarchy of agents):
    company init          Seed CEO + BE/FE/QA managers (add --no-qa, --no-be, --no-fe, --with-engineers to tune)

  Examples:
    ldmux create
    ldmux ask backend-expert "how does auth work?"
    ldmux chat backend-expert
    ldmux run plan.json
    ldmux gui

  Options:
    --no-pane             Don't open Windows Terminal panes (background only)
    --name <name>         Worker name (for 'new' command)
  `);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'create': {
      await runCreateWizard(AGENT_DIR);
      break;
    }

    case 'mcp': {
      await startMcpServer();
      // startMcpServer keeps the stdio transport alive; do not break
      return;
    }

    case 'edit': {
      const name = args[1];
      if (!name) {
        console.error('  Usage: ldmux edit <name>');
        process.exit(1);
      }
      await runEditWizard(AGENT_DIR, name);
      break;
    }

    case 'reset': {
      const name = args[1];
      if (!name) {
        console.error('  Usage: ldmux reset <name>');
        process.exit(1);
      }
      const cfg = readAgentConfig(AGENT_DIR, name);
      if (!cfg) {
        console.error(`  Agent "${name}" not found.\n`);
        process.exit(1);
      }
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ans: string = await new Promise(res =>
        rl.question(`  Reset session + history for "${name}"? Soul/skill will be kept. (y/N): `, a => res(a.trim()))
      );
      rl.close();
      if (ans.toLowerCase() !== 'y') {
        console.log('  Cancelled.\n');
        break;
      }
      resetAgent(AGENT_DIR, name);
      console.log(`  Agent "${name}" reset. Next ask starts a fresh session.\n`);
      break;
    }

    case 'ask': {
      const name = args[1];
      const question = args.slice(2).join(' ');
      if (!name || !question) {
        console.error('  Usage: ldmux ask <name> "<question>"');
        process.exit(1);
      }
      try {
        const r = await askAgent(AGENT_DIR, name, question);
        console.log(`\n${r.answer}\n`);
        console.log(`  [${(r.durationMs / 1000).toFixed(2)}s, $${r.costUsd.toFixed(4)}, session ${r.sessionId.slice(0, 8)}...]\n`);
      } catch (err: any) {
        console.error(`  Error: ${err.message}\n`);
        process.exit(1);
      }
      break;
    }

    case 'chat': {
      const name = args[1];
      if (!name) {
        console.error('  Usage: ldmux chat <name>');
        process.exit(1);
      }
      await startChat(AGENT_DIR, name);
      break;
    }

    case 'agents': {
      const all = listWorkers(AGENT_DIR).filter(w => readAgentConfig(AGENT_DIR, w.name));
      if (all.length === 0) {
        console.log('  No agents yet. Create one with: ldmux create\n');
        break;
      }
      console.log('\n  Agents:\n');
      for (const w of all) {
        const cfg = readAgentConfig(AGENT_DIR, w.name)!;
        const s = readSession(AGENT_DIR, w.name);
        const icon = w.status === 'waiting' ? 'W' : w.status === 'running' ? 'R' : w.status === 'sleep' ? 'S' : w.status === 'error' ? '!' : '?';
        const turns = s ? `${s.turns} turns, $${s.totalCostUsd.toFixed(4)}` : 'no session';
        const skill = cfg.skill ? ` [${cfg.skill.slice(0, 30)}]` : '';
        console.log(`    [${icon}] ${w.name} - ${w.status}${skill} (${turns})`);
      }
      console.log('');
      break;
    }

    case 'new': {
      const prompt = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
      if (!prompt) {
        console.error('  Error: Please provide a prompt.\n');
        console.error('  Usage: npx ts-node src/index.ts new "Your prompt here"');
        process.exit(1);
      }
      const nameFlag = args.indexOf('--name');
      const name = nameFlag >= 0 ? args[nameFlag + 1] : `worker-${Date.now()}`;
      console.log(`\n  Creating worker: ${name}`);
      spawnWorker(BASE_DIR, { name, prompt });
      console.log(`  Worker "${name}" started.\n`);
      break;
    }

    case 'run': {
      const planPath = args[1];
      if (!planPath) {
        console.error('  Error: Please provide a plan file.\n');
        console.error('  Usage: npx ts-node src/index.ts run plan.json');
        process.exit(1);
      }
      const usePane = !args.includes('--no-pane');
      const plan = loadPlan(planPath);
      await executePlan(BASE_DIR, plan, usePane);
      break;
    }

    case 'list': {
      listPlanWorkers(BASE_DIR);
      break;
    }

    case 'merge': {
      mergeOutputs(BASE_DIR);
      break;
    }

    case 'gui': {
      startGui(BASE_DIR, AGENT_DIR);
      break;
    }

    case 'clean': {
      cleanWorkers(BASE_DIR);
      console.log('  All worker data cleaned.\n');
      break;
    }

    case 'company': {
      const sub = args[1];
      if (sub !== 'init') {
        console.error('  Usage: ldmux company init [--no-qa] [--no-be] [--no-fe] [--with-engineers]');
        process.exit(1);
      }
      const skip = new Set(args.filter(a => a.startsWith('--no-')).map(a => a.slice(5)));
      const withEngineers = args.includes('--with-engineers');
      const seed: Array<{ name: string; role: string; reportsTo?: string; soul: string; skill: string; skipKey?: string }> = [
        {
          name: 'ceo',
          role: 'CEO',
          soul: 'You are the CEO of a small AI-run software team. Think high-level: break the user\'s request into concrete workstreams, delegate to your managers, wait for their reports, and synthesize an executive summary for the user. Be decisive and concise.',
          skill: 'Product strategy, decomposition, synthesizing cross-functional reports',
        },
        {
          name: 'be-manager',
          role: 'Backend Manager',
          reportsTo: 'ceo',
          soul: 'You are the Backend Manager. Design APIs, data models, and server architecture. Coordinate with the Frontend Manager when contracts need to be defined. Always end with a concise report for your manager.',
          skill: 'REST/GraphQL API design, databases, auth, server frameworks (Node/Go/Java)',
          skipKey: 'be',
        },
        {
          name: 'fe-manager',
          role: 'Frontend Manager',
          reportsTo: 'ceo',
          soul: 'You are the Frontend Manager. Design UI flows, component structure, and client-side state. Ask the Backend Manager for API shapes when you need them. Report back succinctly.',
          skill: 'React/Vue UI design, UX flows, client state management, accessibility',
          skipKey: 'fe',
        },
        {
          name: 'qa-manager',
          role: 'QA Manager',
          reportsTo: 'ceo',
          soul: 'You are the QA/QC Manager. Review plans and implementations for testability, edge cases, race conditions, and security gaps. Call out risks explicitly. Report findings to the CEO.',
          skill: 'Test strategy, edge cases, regression risk, security review',
          skipKey: 'qa',
        },
      ];
      if (withEngineers) {
        seed.push(
          {
            name: 'be-engineer',
            role: 'Backend Engineer',
            reportsTo: 'be-manager',
            soul: 'You are a Backend Engineer reporting to the Backend Manager. Implement the designs your manager gives you. Ask for clarification if specs are ambiguous. Report progress and blockers.',
            skill: 'Hands-on backend coding, writing endpoints, migrations, unit tests',
          },
          {
            name: 'fe-engineer',
            role: 'Frontend Engineer',
            reportsTo: 'fe-manager',
            soul: 'You are a Frontend Engineer reporting to the Frontend Manager. Implement UI components per spec. Flag UX concerns as you build. Report progress and blockers.',
            skill: 'Hands-on UI coding, components, styling, frontend tests',
          },
        );
      }

      let created = 0, skipped = 0;
      for (const s of seed) {
        if (s.skipKey && skip.has(s.skipKey)) {
          console.log(`  skipping ${s.name} (--no-${s.skipKey})`);
          continue;
        }
        if (agentExists(AGENT_DIR, s.name)) {
          console.log(`  ${s.name} already exists — skipping`);
          skipped++;
          continue;
        }
        const cfg = createAgent(AGENT_DIR, {
          name: s.name,
          soul: s.soul,
          skill: s.skill,
          role: s.role,
          reportsTo: s.reportsTo,
          autonomy: 'auto',
        });
        writeStatus(AGENT_DIR, s.name, {
          name: s.name,
          status: 'sleep',
          startedAt: cfg.createdAt,
        });
        console.log(`  created ${s.name} (${s.role}${s.reportsTo ? ` → ${s.reportsTo}` : ''})`);
        created++;
      }
      console.log(`\n  Done. ${created} created, ${skipped} skipped. Open 'ldmux gui' → Company tab.\n`);
      break;
    }

    default: {
      console.error(`  Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('  Fatal error:', err.message);
  process.exit(1);
});
