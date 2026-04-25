import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { writeTask, writeStatus, getOutputPath, WorkerStatus } from './file-comm';

export interface WorkerConfig {
  name: string;
  prompt: string;
  cwd?: string;
  agent?: string; // default: 'claude'
}

const activeProcesses = new Map<string, ChildProcess>();

export function spawnWorker(baseDir: string, config: WorkerConfig): ChildProcess {
  const { name, prompt, cwd, agent = 'claude' } = config;
  const workDir = cwd ? path.resolve(baseDir, cwd) : baseDir;

  // Write task file
  writeTask(baseDir, name, prompt);

  // Write initial status
  const status: WorkerStatus = {
    name,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  writeStatus(baseDir, name, status);

  // Output log path
  const outputPath = getOutputPath(baseDir, name);
  const outputStream = fs.createWriteStream(outputPath, { flags: 'a' });

  // Build command based on agent type
  const { cmd, args } = buildAgentCommand(agent, prompt);

  // Spawn the agent process
  const child = spawn(cmd, args, {
    cwd: workDir,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  if (child.pid) {
    status.pid = child.pid;
    writeStatus(baseDir, name, status);
  }

  // Capture stdout
  child.stdout?.on('data', (data: Buffer) => {
    outputStream.write(data);
  });

  // Capture stderr
  child.stderr?.on('data', (data: Buffer) => {
    outputStream.write(data);
  });

  // Handle exit
  child.on('close', (code) => {
    outputStream.end();
    const finalStatus: WorkerStatus = {
      ...status,
      status: code === 0 ? 'done' : 'error',
      finishedAt: new Date().toISOString(),
      error: code !== 0 ? `Exit code: ${code}` : undefined,
    };
    writeStatus(baseDir, name, finalStatus);
    activeProcesses.delete(name);
  });

  child.on('error', (err) => {
    outputStream.end();
    const errorStatus: WorkerStatus = {
      ...status,
      status: 'error',
      finishedAt: new Date().toISOString(),
      error: err.message,
    };
    writeStatus(baseDir, name, errorStatus);
    activeProcesses.delete(name);
  });

  activeProcesses.set(name, child);
  return child;
}

function buildAgentCommand(agent: string, prompt: string): { cmd: string; args: string[] } {
  const escapedPrompt = prompt.replace(/"/g, '\\"');

  switch (agent) {
    case 'claude':
      return { cmd: 'claude', args: ['-p', `"${escapedPrompt}"`] };
    case 'codex':
      return { cmd: 'codex', args: ['exec', '--task', `"${escapedPrompt}"`] };
    default:
      return { cmd: agent, args: [`"${escapedPrompt}"`] };
  }
}

export function stopWorker(name: string): boolean {
  const child = activeProcesses.get(name);
  if (child) {
    child.kill('SIGTERM');
    activeProcesses.delete(name);
    return true;
  }
  return false;
}

export function getActiveWorkers(): string[] {
  return Array.from(activeProcesses.keys());
}
