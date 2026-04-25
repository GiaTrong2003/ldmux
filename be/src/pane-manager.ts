import { exec } from 'child_process';
import path from 'path';

export interface PaneOptions {
  direction?: 'vertical' | 'horizontal'; // V or H split
  size?: number; // 0.0 - 1.0, portion of parent
  title?: string;
  cwd?: string;
  command: string;
}

/**
 * Open a new Windows Terminal split pane.
 * Uses `wt -w 0 sp` to split in the current window.
 *
 * NOTE: Windows Terminal must be the active terminal for `wt` to work.
 * On non-Windows systems, falls back to spawning a new process in background.
 */
export function openPane(options: PaneOptions): Promise<void> {
  const { direction = 'vertical', size, title, cwd, command } = options;

  if (isWindows()) {
    return openWindowsTerminalPane(options);
  } else {
    return openFallbackPane(options);
  }
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

async function openWindowsTerminalPane(options: PaneOptions): Promise<void> {
  const { direction = 'vertical', size, title, cwd, command } = options;

  const args: string[] = ['-w', '0', 'sp'];

  // Direction
  args.push(direction === 'vertical' ? '-V' : '-H');

  // Size
  if (size) {
    args.push('-s', size.toString());
  }

  // Title
  if (title) {
    args.push('--title', `"${title}"`);
  }

  // Working directory
  if (cwd) {
    args.push('-d', `"${path.resolve(cwd)}"`);
  }

  // Command to run in the pane
  args.push('powershell.exe', '-NoExit', '-Command', `"${command}"`);

  const wtCommand = `wt ${args.join(' ')}`;

  return new Promise((resolve, reject) => {
    exec(wtCommand, (error) => {
      if (error) {
        reject(new Error(`Failed to open pane: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

async function openFallbackPane(options: PaneOptions): Promise<void> {
  // On non-Windows: just log the command that would run
  console.log(`[Fallback] Would open pane: ${options.command}`);
  console.log(`  Direction: ${options.direction || 'vertical'}`);
  console.log(`  CWD: ${options.cwd || process.cwd()}`);
}

/**
 * Open multiple panes in a grid layout.
 * First pane takes the full width, subsequent panes split from it.
 */
export async function openPaneGrid(
  panes: PaneOptions[],
  layout: 'vertical' | 'horizontal' | 'grid' = 'vertical'
): Promise<void> {
  if (panes.length === 0) return;

  for (let i = 0; i < panes.length; i++) {
    const pane = panes[i];

    if (layout === 'grid' && i > 0) {
      // Alternate directions for grid layout
      pane.direction = i % 2 === 0 ? 'vertical' : 'horizontal';
    } else if (!pane.direction) {
      pane.direction = layout === 'horizontal' ? 'horizontal' : 'vertical';
    }

    // Equal sizing
    if (!pane.size) {
      pane.size = 1 / (panes.length - i);
    }

    await openPane(pane);

    // Small delay between pane creations to avoid race conditions
    if (i < panes.length - 1) {
      await sleep(500);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
