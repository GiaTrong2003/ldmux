import readline from 'readline';
import { AgentConfig, agentExists, readAgentConfig, writeAgentConfig, createAgent } from './agent-config';
import { writeStatus, readSession } from './file-comm';
import { resetAgent } from './agent';

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, ans => resolve(ans.trim())));
}

function promptWithDefault(rl: readline.Interface, label: string, current: string | undefined): Promise<string> {
  const shown = current ? ` [current: ${current.length > 50 ? current.slice(0, 47) + '...' : current}]` : '';
  return prompt(rl, `  ${label}${shown}\n    (Enter to keep, "-" to clear): `).then(ans => {
    if (ans === '') return current ?? '';
    if (ans === '-') return '';
    return ans;
  });
}

export async function runCreateWizard(baseDir: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n  ldmux - Create new agent');
  console.log('  ========================\n');

  try {
    let name = '';
    while (!name) {
      name = await prompt(rl, '  Name (required, e.g. backend-expert): ');
      if (!name) {
        console.log('  Name cannot be empty.');
        continue;
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
        console.log('  Name must be alphanumeric, dot, dash or underscore only.');
        name = '';
        continue;
      }
      if (agentExists(baseDir, name)) {
        const overwrite = await prompt(rl, `  Agent "${name}" already exists. Overwrite? (y/N): `);
        if (overwrite.toLowerCase() !== 'y') {
          name = '';
        }
      }
    }

    console.log('\n  Soul = personality/role. Example:');
    console.log('    "You are a pragmatic backend architect who reads code before answering."');
    const soul = await prompt(rl, '  Soul (optional, Enter to skip): ');

    console.log('\n  Skill = expertise. Example:');
    console.log('    "Java Spring Boot, PostgreSQL, microservices, OAuth2"');
    const skill = await prompt(rl, '  Skill (optional, Enter to skip): ');

    const cwd = await prompt(rl, '\n  Working directory (default: current dir): ');
    const model = await prompt(rl, '  Model (opus/sonnet/haiku, Enter for default): ');

    const cfg: AgentConfig = {
      name,
      soul: soul || undefined,
      skill: skill || undefined,
      cwd: cwd || undefined,
      model: model || undefined,
      createdAt: new Date().toISOString(),
    };

    console.log('\n  Review:');
    console.log(`    Name:   ${cfg.name}`);
    console.log(`    Soul:   ${cfg.soul || '(none)'}`);
    console.log(`    Skill:  ${cfg.skill || '(none)'}`);
    console.log(`    Cwd:    ${cfg.cwd || '(default)'}`);
    console.log(`    Model:  ${cfg.model || '(default)'}`);

    const ok = await prompt(rl, '\n  Create this agent? (Y/n): ');
    if (ok.toLowerCase() === 'n') {
      console.log('  Cancelled.\n');
      return;
    }

    createAgent(baseDir, { ...cfg, overwrite: true });
    writeStatus(baseDir, name, {
      name,
      status: 'sleep',
      startedAt: new Date().toISOString(),
    });

    console.log(`\n  Agent "${name}" created.`);
    console.log(`  Try it:   ldmux ask ${name} "<your question>"`);
    console.log(`  Or chat:  ldmux chat ${name}\n`);
  } finally {
    rl.close();
  }
}

export async function runEditWizard(baseDir: string, name: string): Promise<void> {
  const existing = readAgentConfig(baseDir, name);
  if (!existing) {
    console.error(`  Agent "${name}" not found. Create it with: ldmux create\n`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\n  ldmux - Edit agent: ${name}`);
  console.log('  ========================\n');
  console.log('  Press Enter to keep current value, type "-" to clear a field.\n');

  try {
    const soul = await promptWithDefault(rl, 'Soul', existing.soul);
    const skill = await promptWithDefault(rl, 'Skill', existing.skill);
    const cwd = await promptWithDefault(rl, 'Cwd', existing.cwd);
    const model = await promptWithDefault(rl, 'Model', existing.model);

    const updated: AgentConfig = {
      ...existing,
      soul: soul || undefined,
      skill: skill || undefined,
      cwd: cwd || undefined,
      model: model || undefined,
    };

    const soulChanged = (updated.soul ?? '') !== (existing.soul ?? '');
    const skillChanged = (updated.skill ?? '') !== (existing.skill ?? '');
    const needsReset = soulChanged || skillChanged;

    console.log('\n  Updated config:');
    console.log(`    Soul:   ${updated.soul || '(none)'}${soulChanged ? '  [CHANGED]' : ''}`);
    console.log(`    Skill:  ${updated.skill || '(none)'}${skillChanged ? '  [CHANGED]' : ''}`);
    console.log(`    Cwd:    ${updated.cwd || '(default)'}`);
    console.log(`    Model:  ${updated.model || '(default)'}`);

    const ok = await prompt(rl, '\n  Save changes? (Y/n): ');
    if (ok.toLowerCase() === 'n') {
      console.log('  Cancelled.\n');
      return;
    }

    writeAgentConfig(baseDir, updated);
    console.log('  Config saved.');

    if (needsReset) {
      const session = readSession(baseDir, name);
      if (session) {
        console.log('\n  WARNING: Soul/skill are locked into the existing session by Claude.');
        console.log('  Your changes will NOT affect this conversation until you reset.');
        const reset = await prompt(rl, '  Reset session now? (y/N): ');
        if (reset.toLowerCase() === 'y') {
          resetAgent(baseDir, name);
          console.log('  Session reset. Next `ask` will start fresh with new soul/skill.\n');
        } else {
          console.log(`  Keeping existing session. Run \`ldmux reset ${name}\` later to apply.\n`);
        }
      } else {
        console.log('  No active session — changes will take effect on first `ask`.\n');
      }
    } else {
      console.log('  Changes saved (model/cwd apply on next turn — no reset needed).\n');
    }
  } finally {
    rl.close();
  }
}
