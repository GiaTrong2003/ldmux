import readline from 'readline';
import { askAgent } from './agent';
import { readAgentConfig } from './agent-config';
import { readSession, readHistory } from './file-comm';

export async function startChat(baseDir: string, name: string): Promise<void> {
  const cfg = readAgentConfig(baseDir, name);
  if (!cfg) {
    console.error(`  Agent "${name}" not found. Create it with: ldmux create\n`);
    process.exit(1);
  }

  const session = readSession(baseDir, name);
  const history = readHistory(baseDir, name);

  console.log(`\n  ldmux - Chat with agent: ${name}`);
  console.log(`  ${'='.repeat(40)}`);
  if (cfg.soul) console.log(`  Soul:  ${cfg.soul}`);
  if (cfg.skill) console.log(`  Skill: ${cfg.skill}`);
  if (session) {
    console.log(`  Resuming session ${session.sessionId.slice(0, 8)}... (${session.turns} turns, $${session.totalCostUsd.toFixed(4)})`);
  } else {
    console.log('  New session will start on first message.');
  }
  console.log('  Commands: /exit to quit, /history to show past turns, /session to show session info');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You > ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }

    if (text === '/exit' || text === '/quit') { rl.close(); return; }

    if (text === '/history') {
      const h = readHistory(baseDir, name);
      if (h.length === 0) console.log('  (no history yet)');
      else h.forEach(entry => {
        const who = entry.role === 'user' ? 'You' : name;
        console.log(`  ${who}: ${entry.content}`);
      });
      rl.prompt();
      return;
    }

    if (text === '/session') {
      const s = readSession(baseDir, name);
      console.log(s ? JSON.stringify(s, null, 2) : '  (no session yet)');
      rl.prompt();
      return;
    }

    rl.pause();
    process.stdout.write('... thinking ...\r');
    try {
      const r = await askAgent(baseDir, name, text);
      process.stdout.write(' '.repeat(40) + '\r');
      console.log(`\n${name} > ${r.answer}`);
      console.log(`  [${(r.durationMs / 1000).toFixed(2)}s, $${r.costUsd.toFixed(4)}]\n`);
    } catch (err: any) {
      process.stdout.write(' '.repeat(40) + '\r');
      console.error(`\n  Error: ${err.message}\n`);
    }
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n  Bye.\n');
    process.exit(0);
  });
}
