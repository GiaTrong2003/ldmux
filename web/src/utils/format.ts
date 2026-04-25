export function formatCost(usd: number | undefined): string {
  return '$' + (usd ?? 0).toFixed(4);
}

export function formatDurationMs(ms: number | undefined): string {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function formatBytes(n: number | undefined): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTimeHMS(iso: string): string {
  const d = new Date(iso);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
