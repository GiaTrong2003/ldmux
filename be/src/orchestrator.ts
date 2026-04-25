import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { spawnWorker, WorkerConfig } from './worker';
import { openPane, openPaneGrid } from './pane-manager';
import { listWorkers, getOutputPath } from './file-comm';

export interface TaskPlan {
  name: string;
  workers: PlanWorker[];
  gitWorktree?: boolean;
  layout?: 'vertical' | 'horizontal' | 'grid';
}

export interface PlanWorker {
  name: string;
  prompt: string;
  cwd?: string;
  agent?: string;
}

export function loadPlan(planPath: string): TaskPlan {
  const raw = fs.readFileSync(path.resolve(planPath), 'utf-8');
  const plan: TaskPlan = JSON.parse(raw);

  if (!plan.name) throw new Error('Plan must have a "name" field');
  if (!plan.workers || plan.workers.length === 0) throw new Error('Plan must have at least one worker');

  for (const w of plan.workers) {
    if (!w.name) throw new Error('Each worker must have a "name"');
    if (!w.prompt) throw new Error(`Worker "${w.name}" must have a "prompt"`);
  }

  return plan;
}

export async function executePlan(baseDir: string, plan: TaskPlan, usePane: boolean = true): Promise<void> {
  console.log(`\n  ldmux - Executing plan: ${plan.name}`);
  console.log(`  Workers: ${plan.workers.length}`);
  console.log('');

  // Create git worktrees if requested
  if (plan.gitWorktree) {
    console.log('  Creating git worktrees...');
    for (const worker of plan.workers) {
      const worktreePath = path.join(baseDir, '..', `ldmux-${plan.name}-${worker.name}`);
      const branch = `ldmux/${plan.name}/${worker.name}`;

      try {
        execSync(`git worktree add -b "${branch}" "${worktreePath}" HEAD`, {
          cwd: baseDir,
          stdio: 'pipe',
        });
        worker.cwd = worktreePath;
        console.log(`    Worktree: ${worker.name} -> ${worktreePath}`);
      } catch (err: any) {
        console.log(`    Warning: Could not create worktree for ${worker.name}: ${err.message}`);
      }
    }
    console.log('');
  }

  // Spawn workers
  if (usePane) {
    await spawnWithPanes(baseDir, plan);
  } else {
    await spawnBackground(baseDir, plan);
  }
}

async function spawnWithPanes(baseDir: string, plan: TaskPlan): Promise<void> {
  const paneOptions = plan.workers.map(worker => {
    const outputLog = getOutputPath(baseDir, worker.name);
    const agent = worker.agent || 'claude';
    const cwd = worker.cwd || baseDir;

    // The pane runs the agent and tees output to log file
    const command = buildPaneCommand(agent, worker.prompt, outputLog);

    return {
      title: worker.name,
      cwd,
      command,
    };
  });

  console.log('  Opening panes...\n');

  await openPaneGrid(paneOptions, plan.layout || 'vertical');

  // Also spawn background workers for status tracking
  for (const worker of plan.workers) {
    spawnWorker(baseDir, {
      name: worker.name,
      prompt: worker.prompt,
      cwd: worker.cwd,
      agent: worker.agent,
    });
    console.log(`    [${worker.name}] Started`);
  }

  console.log(`\n  All ${plan.workers.length} workers started.`);
  console.log('  Run "npx ts-node src/index.ts list" to check status.');
  console.log('  Run "npx ts-node src/index.ts gui" for web dashboard.\n');
}

async function spawnBackground(baseDir: string, plan: TaskPlan): Promise<void> {
  console.log('  Spawning background workers...\n');

  for (const worker of plan.workers) {
    spawnWorker(baseDir, {
      name: worker.name,
      prompt: worker.prompt,
      cwd: worker.cwd,
      agent: worker.agent,
    });
    console.log(`    [${worker.name}] Started (background)`);
  }

  console.log(`\n  All ${plan.workers.length} workers started in background.`);
}

function buildPaneCommand(agent: string, prompt: string, outputLog: string): string {
  const escaped = prompt.replace(/'/g, "''").replace(/"/g, '`"');

  // PowerShell command that runs agent and tees output to log
  switch (agent) {
    case 'claude':
      return `claude -p '${escaped}' 2>&1 | Tee-Object -FilePath '${outputLog}'`;
    case 'codex':
      return `codex exec --task '${escaped}' 2>&1 | Tee-Object -FilePath '${outputLog}'`;
    default:
      return `${agent} '${escaped}' 2>&1 | Tee-Object -FilePath '${outputLog}'`;
  }
}

export function listPlanWorkers(baseDir: string): void {
  const workers = listWorkers(baseDir);

  if (workers.length === 0) {
    console.log('  No workers found.\n');
    return;
  }

  console.log('\n  Workers:\n');
  for (const w of workers) {
    const icon = w.status === 'running' ? '>' : w.status === 'done' ? '+' : '!';
    const time = w.startedAt ? ` (started: ${new Date(w.startedAt).toLocaleTimeString()})` : '';
    console.log(`    [${icon}] ${w.name} - ${w.status}${time}`);
  }
  console.log('');
}
