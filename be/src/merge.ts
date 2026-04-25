import fs from 'fs';
import path from 'path';
import { listWorkers, readOutput, getWorkersDir, getLdmuxDir } from './file-comm';

export function mergeOutputs(baseDir: string): string {
  const workers = listWorkers(baseDir);

  if (workers.length === 0) {
    console.log('  No workers found to merge.\n');
    return '';
  }

  const sections: string[] = [];
  sections.push('# ldmux - Merged Output\n');
  sections.push(`Generated: ${new Date().toISOString()}\n`);
  sections.push(`Workers: ${workers.length}\n`);
  sections.push('---\n');

  for (const worker of workers) {
    const output = readOutput(baseDir, worker.name);
    const statusIcon = worker.status === 'done' ? 'DONE' : worker.status === 'error' ? 'ERROR' : 'RUNNING';

    sections.push(`## [${statusIcon}] ${worker.name}\n`);

    if (worker.startedAt) {
      sections.push(`Started: ${worker.startedAt}`);
    }
    if (worker.finishedAt) {
      sections.push(`Finished: ${worker.finishedAt}`);
    }

    sections.push('');

    if (output.trim()) {
      sections.push('```');
      sections.push(output.trim());
      sections.push('```');
    } else {
      sections.push('_No output yet._');
    }

    sections.push('\n---\n');
  }

  const merged = sections.join('\n');

  // Write to file
  const outputPath = path.join(getLdmuxDir(baseDir), 'merged-output.md');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, merged);

  console.log(`  Merged output written to: ${outputPath}`);
  console.log(`  Workers merged: ${workers.length}\n`);

  return merged;
}
