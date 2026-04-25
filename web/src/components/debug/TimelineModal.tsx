import { useEffect, useState, useCallback } from 'react';
import { Modal } from '../common/Modal';
import { getAgentTrace } from '../../api/debug';
import { formatDurationMs, formatTimeHMS } from '../../utils/format';
import type { AgentTrace, TurnTrace, ToolCall } from '../../types/api';
import './TimelineModal.css';

interface Props { open: boolean; onClose: () => void; agentName: string }

export function TimelineModal({ open, onClose, agentName }: Props) {
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTrace(await getAgentTrace(agentName)); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [agentName]);

  useEffect(() => { if (open) load(); }, [open, load]);

  return (
    <Modal
      open={open}
      title={`Timeline · ${agentName}`}
      onClose={onClose}
      width={900}
      footer={
        <div className="timeline-footer">
          {trace?.tracePath && <code className="timeline-path" title={trace.tracePath}>{trace.tracePath}</code>}
          <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      }
    >
      {error && <div className="timeline-error">Error: {error}</div>}
      {!error && !trace && <div className="timeline-empty">Loading…</div>}
      {trace && !trace.exists && (
        <div className="timeline-empty">
          No Claude Code trace found for session <code>{trace.sessionId || '(none)'}</code>.
          {trace.workDir && <div className="muted">Looked under: <code>{trace.workDir}</code></div>}
          <div className="muted" style={{ marginTop: 8 }}>
            Run an `ask` first — Claude Code only writes the JSONL after the first turn.
          </div>
        </div>
      )}
      {trace && trace.exists && trace.turns.length === 0 && (
        <div className="timeline-empty">Trace file is present but contains no parsable turns.</div>
      )}
      {trace && trace.turns.map(t => <TurnBlock key={t.turnIndex} turn={t} />)}
    </Modal>
  );
}

function TurnBlock({ turn }: { turn: TurnTrace }) {
  const u = turn.usage;
  const totalIn = u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
  return (
    <div className="turn-block">
      <div className="turn-header">
        <span className="turn-index">Turn {turn.turnIndex + 1}</span>
        {turn.durationMs !== null && <span>· {formatDurationMs(turn.durationMs)}</span>}
        {turn.startedAt && <span className="muted">· {formatTimeHMS(turn.startedAt)}</span>}
        {turn.model && <span className="muted">· {turn.model}</span>}
      </div>
      {turn.userMsg && (
        <div className="turn-row user">
          <span className="role">🧑 User</span>
          <pre>{truncate(turn.userMsg, 1200)}</pre>
        </div>
      )}
      {turn.thinking && (
        <details className="turn-row thinking">
          <summary><span className="role">🧠 Thinking</span> ({turn.thinking.length} chars)</summary>
          <pre>{truncate(turn.thinking, 4000)}</pre>
        </details>
      )}
      {turn.toolCalls.map((tc, i) => <ToolCallBlock key={tc.id || i} call={tc} />)}
      {turn.assistantText && (
        <div className="turn-row assistant">
          <span className="role">🤖 Assistant</span>
          <pre>{truncate(turn.assistantText, 4000)}</pre>
        </div>
      )}
      <div className="turn-usage">
        📊 in={u.inputTokens} · out={u.outputTokens}
        {u.cacheReadInputTokens > 0 && ` · cache_read=${u.cacheReadInputTokens}`}
        {u.cacheCreationInputTokens > 0 && ` · cache_create=${u.cacheCreationInputTokens}`}
        {totalIn > 0 && ` · total_in=${totalIn}`}
      </div>
    </div>
  );
}

function ToolCallBlock({ call }: { call: ToolCall }) {
  const inputStr = (() => {
    try { return JSON.stringify(call.input, null, 2); } catch { return String(call.input); }
  })();
  return (
    <details className={`tool-call ${call.isError ? 'err' : ''}`}>
      <summary>
        🔧 <strong>{call.name}</strong>
        {call.durationMs !== undefined && <span className="muted"> · {formatDurationMs(call.durationMs)}</span>}
        {call.isError && <span className="err-badge"> · ERROR</span>}
      </summary>
      <div className="tool-call-body">
        <div className="tool-input">
          <label>input</label>
          <pre>{truncate(inputStr, 2000)}</pre>
        </div>
        {call.result !== undefined && (
          <div className="tool-result">
            <label>result</label>
            <pre>{truncate(call.result, 4000)}</pre>
          </div>
        )}
      </div>
    </details>
  );
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max) + `\n…(truncated, ${s.length - max} more chars)`;
}
