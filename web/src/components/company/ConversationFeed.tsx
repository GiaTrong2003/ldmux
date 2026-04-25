import { useEffect, useMemo, useRef, useState } from 'react';
import { askAgent } from '../../api/agents';
import { deleteConversationThread, addThreadMembers } from '../../api/company';
import { formatTimeHMS, formatDurationMs, formatCost, formatDateTime } from '../../utils/format';
import type { AgentWithSession, ConversationEntry } from '../../types/api';
import './ConversationFeed.css';

interface Props {
  conversations: ConversationEntry[];
  agents: AgentWithSession[];
  onSent: () => void;
}

interface Thread {
  key: string;              // groupId or sorted pair
  groupId?: string;
  participants: string[];   // sorted
  entries: ConversationEntry[];
  lastTs: string;
}

function threadKeyFor(c: ConversationEntry): { key: string; groupId?: string; participants: string[] } {
  if (c.groupId) {
    const participants = (c.participants && c.participants.length > 0
      ? c.participants
      : [c.from, c.to]
    ).slice().sort();
    return { key: c.groupId, groupId: c.groupId, participants };
  }
  const pair = [c.from, c.to].sort();
  return { key: `pair:${pair.join('|')}`, participants: pair };
}

function buildThreads(conversations: ConversationEntry[]): Thread[] {
  const map = new Map<string, Thread>();
  for (const c of conversations) {
    const { key, groupId, participants } = threadKeyFor(c);
    const t = map.get(key);
    if (t) {
      t.entries.push(c);
      if (c.timestamp > t.lastTs) t.lastTs = c.timestamp;
      // union participants (denorm may differ across entries)
      const set = new Set([...t.participants, ...participants]);
      t.participants = [...set].sort();
    } else {
      map.set(key, { key, groupId, participants, entries: [c], lastTs: c.timestamp });
    }
  }
  return [...map.values()].sort((a, b) => b.lastTs.localeCompare(a.lastTs));
}

const COLORS = ['#58a6ff', '#f0a55f', '#3fb950', '#d2a8ff', '#ff7b72', '#79c0ff', '#ffd166', '#7ee787'];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function ConversationFeed({ conversations, agents, onSent }: Props) {
  const threads = useMemo(() => buildThreads(conversations), [conversations]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeKey == null && threads.length > 0) setActiveKey(threads[0].key);
    if (activeKey && !threads.some(t => t.key === activeKey) && threads.length > 0) {
      setActiveKey(threads[0].key);
    }
  }, [threads, activeKey]);

  const active = threads.find(t => t.key === activeKey) ?? null;
  const sortedEntries = useMemo(
    () => (active ? [...active.entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) : []),
    [active]
  );
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [activeKey, sortedEntries.length]);

  const handleDelete = async (t: Thread, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const label = t.participants.join(' · ');
    if (!confirm(`Delete entire thread "${label}"? (${t.entries.length} message${t.entries.length === 1 ? '' : 's'})`)) return;
    try {
      if (t.groupId) {
        await deleteConversationThread({ groupId: t.groupId });
      } else {
        const pair = t.participants.slice(0, 2) as [string, string];
        await deleteConversationThread({ pair });
      }
      if (t.key === activeKey) setActiveKey(null);
      onSent();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="conv-feed">
      <div className="conv-feed-header">
        <h3>Conversation feed</h3>
        <span className="conv-feed-count">
          {threads.length} thread{threads.length === 1 ? '' : 's'} · {conversations.length} message{conversations.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="conv-feed-grid">
        <aside className="conv-thread-list">
          {threads.length === 0 ? (
            <div className="conv-feed-empty">No conversations yet.</div>
          ) : (
            threads.map(t => {
              const last = t.entries.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
              return (
                <div
                  key={t.key}
                  className={`conv-thread-row${t.key === activeKey ? ' is-active' : ''}`}
                  onClick={() => setActiveKey(t.key)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="conv-thread-title">
                    {t.participants.map((p, i) => (
                      <span key={p}>
                        {i > 0 && <span className="conv-thread-sep"> · </span>}
                        <span style={{ color: colorFor(p), fontWeight: 600 }}>{p}</span>
                      </span>
                    ))}
                  </div>
                  <div className="conv-thread-preview">
                    <span className="conv-thread-who" style={{ color: colorFor(last.from) }}>{last.from}:</span> {last.question.slice(0, 60)}
                  </div>
                  <div className="conv-thread-meta">
                    <span>{formatTimeHMS(last.timestamp)}</span>
                    <span>{t.entries.length} msg · {t.participants.length}p</span>
                  </div>
                  <button
                    type="button"
                    className="conv-thread-del"
                    title="Delete thread"
                    aria-label="Delete thread"
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(t); }}
                  >🗑</button>
                </div>
              );
            })
          )}
        </aside>

        <section className="conv-chat">
          {!active ? (
            <div className="conv-feed-empty">Pick a conversation on the left.</div>
          ) : (
            <>
              <div className="conv-chat-header">
                {active.participants.map((p, i) => (
                  <span key={p}>
                    {i > 0 && <span className="conv-chat-sep"> · </span>}
                    <span style={{ color: colorFor(p), fontWeight: 600 }}>{p}</span>
                  </span>
                ))}
                {active.groupId && <span className="conv-chat-gid">group</span>}
                <button
                  className="conv-chat-add"
                  title={active.groupId ? 'Add agent to this thread' : 'Only group threads support adding members'}
                  disabled={!active.groupId}
                  onClick={() => setAddPickerOpen(v => !v)}
                >＋ Add agent</button>
                <button
                  type="button"
                  className="conv-chat-del"
                  title="Delete this thread"
                  onClick={(e) => { e.stopPropagation(); handleDelete(active); }}
                >🗑 Delete</button>
              </div>
              {addPickerOpen && active.groupId && (
                <AddMembersPicker
                  thread={active}
                  agents={agents}
                  onClose={() => setAddPickerOpen(false)}
                  onDone={() => { setAddPickerOpen(false); onSent(); }}
                />
              )}
              <div className="conv-chat-body" ref={bodyRef}>
                {sortedEntries.map((c, i) => {
                  if (c.from === 'system') {
                    return (
                      <div key={`${c.timestamp}-${i}`} className="conv-sys-row">
                        <span>{c.answer || 'system event'} · {formatTimeHMS(c.timestamp)}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={`${c.timestamp}-${i}`} className="conv-msg-group">
                      <ChatMsg author={c.from} text={c.question} timestamp={c.timestamp} />
                      <ChatMsg
                        author={c.to}
                        text={c.answer}
                        timestamp={c.timestamp}
                        meta={`${formatDurationMs(c.durationMs)} · ${formatCost(c.costUsd)}`}
                        isAnswer
                      />
                    </div>
                  );
                })}
              </div>
              <Composer thread={active} agents={agents} onSent={onSent} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function AddMembersPicker({ thread, agents, onClose, onDone }: {
  thread: Thread;
  agents: AgentWithSession[];
  onClose: () => void;
  onDone: () => void;
}) {
  const candidates = useMemo(
    () => agents.filter(a => !thread.participants.includes(a.name)),
    [agents, thread.participants]
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (name: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const submit = async () => {
    if (!thread.groupId || picked.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      await addThreadMembers(thread.groupId, [...picked]);
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="conv-add-picker">
      <div className="conv-add-picker-head">
        <span>Add agents to thread</span>
        <button className="ghost" onClick={onClose} disabled={busy}>✕</button>
      </div>
      {candidates.length === 0 ? (
        <div className="conv-feed-empty" style={{ padding: '12px' }}>All agents are already in this thread.</div>
      ) : (
        <div className="conv-add-chips">
          {candidates.map(a => {
            const active = picked.has(a.name);
            return (
              <button
                key={a.name}
                type="button"
                disabled={busy}
                className={`conv-chip${active ? ' is-on' : ''}`}
                onClick={() => toggle(a.name)}
                style={{ borderColor: active ? colorFor(a.name) : undefined, color: active ? colorFor(a.name) : undefined }}
              >
                {a.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="conv-add-picker-foot">
        {err && <span className="conv-composer-err">{err}</span>}
        <button
          className="primary"
          disabled={busy || picked.size === 0}
          onClick={submit}
        >
          {busy ? 'Adding…' : `Add ${picked.size || 0}`}
        </button>
      </div>
    </div>
  );
}

function ChatMsg({ author, text, timestamp, meta, isAnswer }: {
  author: string; text: string; timestamp: string; meta?: string; isAnswer?: boolean;
}) {
  const color = colorFor(author);
  return (
    <div className={`conv-msg${isAnswer ? ' is-answer' : ''}`}>
      <div className="conv-msg-avatar" style={{ background: color }}>
        {author.slice(0, 2).toUpperCase()}
      </div>
      <div className="conv-msg-body">
        <div className="conv-msg-head">
          <span className="conv-msg-author" style={{ color }}>{author}</span>
          <span className="conv-msg-ts" title={formatDateTime(timestamp)}>{formatTimeHMS(timestamp)}</span>
          {meta && <span className="conv-msg-meta">{meta}</span>}
        </div>
        <pre className="conv-msg-text">{text}</pre>
      </div>
    </div>
  );
}

function Composer({ thread, agents, onSent }: { thread: Thread; agents: AgentWithSession[]; onSent: () => void }) {
  const agentNames = useMemo(() => new Set(agents.map(a => a.name)), [agents]);
  // Thread members that still exist as agents (can receive).
  const memberAgents = useMemo(
    () => thread.participants.filter(p => agentNames.has(p) && p !== 'system'),
    [thread.participants, agentNames]
  );
  // Senders: 'user' + any member (minus pseudo-identities like 'system' / '*').
  const senderOptions = useMemo(() => {
    const s = new Set<string>(['user']);
    for (const p of thread.participants) {
      if (p === 'system' || p === '*') continue;
      s.add(p);
    }
    return [...s];
  }, [thread.participants]);

  const [from, setFrom] = useState<string>('user');
  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset composer state when switching threads.
  useEffect(() => {
    const defaultFrom = senderOptions.includes('user') ? 'user' : senderOptions[0];
    setFrom(defaultFrom);
    setRecipients(new Set(memberAgents.filter(p => p !== defaultFrom)));
    setText('');
    setErr(null);
  }, [thread.key, senderOptions, memberAgents]);

  // Keep recipients valid when sender changes.
  useEffect(() => {
    setRecipients(prev => {
      const next = new Set(prev);
      next.delete(from);
      if (next.size === 0) {
        memberAgents.filter(p => p !== from).forEach(p => next.add(p));
      }
      return next;
    });
  }, [from, memberAgents]);

  const toggle = (name: string) => {
    setRecipients(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const send = async () => {
    const targets = [...recipients];
    if (targets.length === 0 || !text.trim()) return;
    setBusy(true);
    setErr(null);
    const q = text.trim();
    const fromValue = from === 'user' ? undefined : from;
    const groupId = thread.groupId ?? ((crypto as any).randomUUID?.() ?? `g-${Date.now()}`);
    const participants = Array.from(new Set([from, ...thread.participants, ...targets])).sort();

    try {
      await Promise.all(targets.map(t =>
        askAgent(t, q, { from: fromValue, groupId, participants })
      ));
      setText('');
      onSent();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="conv-composer">
      <div className="conv-composer-row">
        <label className="conv-composer-from">
          <span>From</span>
          <select value={from} onChange={e => setFrom(e.target.value)} disabled={busy}>
            {senderOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <div className="conv-composer-to">
          <span>To</span>
          <div className="conv-composer-chips">
            {memberAgents.length === 0 && <span className="conv-composer-hint">(no agents in thread)</span>}
            {memberAgents.map(p => {
              const disabled = busy || p === from;
              const active = recipients.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  disabled={disabled}
                  className={`conv-chip${active ? ' is-on' : ''}`}
                  onClick={() => toggle(p)}
                  style={{ borderColor: active ? colorFor(p) : undefined, color: active ? colorFor(p) : undefined }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="conv-composer-row conv-composer-input-row">
        <textarea
          rows={2}
          placeholder={`Message ${recipients.size || 0} agent${recipients.size === 1 ? '' : 's'}…  (Enter to send, Shift+Enter newline)`}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter' || e.shiftKey || e.altKey) return;
            if ((e.nativeEvent as any).isComposing) return;
            e.preventDefault();
            send();
          }}
          disabled={busy}
        />
        <button
          className="primary"
          onClick={send}
          disabled={busy || !text.trim() || recipients.size === 0}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {err && <div className="conv-composer-err">Error: {err}</div>}
    </div>
  );
}
