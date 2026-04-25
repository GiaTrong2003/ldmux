import { useState, useEffect, useCallback, useRef } from 'react';
import { tailAgentOutputLines } from '../../api/debug';
import { formatDurationMs, formatDateTime } from '../../utils/format';
import type { LiveProcInfo } from '../../types/api';

interface Props { proc: LiveProcInfo; onKill: () => void }

export function LiveProcRow({ proc, onKill }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tail, setTail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const tailRef = useRef<HTMLPreElement>(null);

  const loadTail = useCallback(async () => {
    setLoading(true);
    try {
      const r = await tailAgentOutputLines(proc.agentName, 40);
      setTail(r.chunk || '(empty)');
    } catch (err: any) {
      setTail(`(error: ${err.message})`);
    } finally {
      setLoading(false);
    }
  }, [proc.agentName]);

  useEffect(() => {
    if (!expanded) return;
    loadTail();
    const id = window.setInterval(() => {
      if (!document.hidden) loadTail();
    }, 2000);
    return () => window.clearInterval(id);
  }, [expanded, loadTail]);

  useEffect(() => {
    if (!expanded || !tailRef.current) return;
    tailRef.current.scrollTop = tailRef.current.scrollHeight;
  }, [tail, expanded]);

  const argvStr = `${proc.cmd} ${proc.argv.join(' ')}`;
  const argvShort = argvStr.length > 120 ? argvStr.slice(0, 120) + '…' : argvStr;

  return (
    <div className="live-proc-row">
      <div className="live-proc-main">
        <div className="live-proc-cell name"><strong>{proc.agentName}</strong></div>
        <div className="live-proc-cell">PID {proc.pid ?? '—'}</div>
        <div className="live-proc-cell">⏱ {formatDurationMs(proc.uptimeMs)}</div>
        <div className="live-proc-cell muted" title={proc.startedAt}>
          since {formatDateTime(proc.startedAt)}
        </div>
        <div className="live-proc-cell cmd" title={argvStr}>{argvShort}</div>
        <div className="live-proc-cell actions">
          <button onClick={() => setExpanded(e => !e)}>{expanded ? 'Hide' : 'Tail'}</button>
          <button className="danger" onClick={onKill}>Kill</button>
        </div>
      </div>
      {expanded && (
        <div className="live-proc-tail">
          <div className="live-proc-tail-meta">
            <span>cwd: <code>{proc.cwd}</code></span>
            <span>{loading ? 'loading…' : 'tail (last 40 lines, 2s refresh)'}</span>
          </div>
          <pre ref={tailRef}>{tail}</pre>
        </div>
      )}
    </div>
  );
}
