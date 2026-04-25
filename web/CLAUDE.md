# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Standalone Vite + React 18 + TypeScript. Built artefacts are written into the **sibling backend repo** at `../be/src/gui/public/` (which Express serves). No separate dev server in production.

- `npm install` — install deps.
- `npm run dev` — Vite dev server on **port 5173** with `/api/*` proxied to the BE Express server on `:3700`. Run alongside `npm run dev` in `../be`.
- `npm run build` — `tsc --noEmit` (typecheck) + `vite build` straight into `../be/src/gui/public/` (wipes the dir first).
- `npm run preview` — preview the built bundle locally.

There are no automated tests or linters configured.

## Architecture

The FE is a single-page React app driven entirely by polling the BE's REST API (no websockets, no client store). All cross-component state lives in `App.tsx`'s top-level `usePolling` calls; tabs receive plain props. JSON is the contract — backend types are mirrored manually in `src/types/api.ts` (intentional duplication: keeps the FE buildable independent of BE codegen).

**Folder layout**
```
src/
  api/         typed fetch wrappers (one file per BE area: workers, agents, company, debug, client)
  components/
    workers/   Workers + Errors tabs
    live/      Live tab (per-worker liveness card with auto-tail)
    agents/    Agents tab (cards + edit modal + Timeline button)
    company/   Company tab (org chart, kickoff/assign modals, conversation feed, drawer)
    debug/     Debug tab (live process table) + Timeline modal (shared with Agents)
    common/    Tabs, Modal, StatusDot, EmptyState, Card primitives
  hooks/       usePolling (interval + visibility-aware), useTail (incremental byte tail)
  types/api.ts mirrors BE shapes — keep in sync when BE changes
  utils/       formatters (cost, duration, dates, bytes)
  styles/      tokens.css (GitHub-dark palette, Inter + JetBrains Mono)
  App.tsx      tab shell + global polling for workers/agents
```

**Polling model.** `usePolling<T>(fetcher, intervalMs, paused)` re-fetches every `intervalMs` and pauses when `document.hidden` or the user toggles "Paused" in the header. `useTail` wraps it for byte-incremental log streaming. There is no client cache layer — every poll is a fresh fetch, and the BE responses are small.

**Org chart.** `@xyflow/react` (React Flow v12) renders agents from `/api/company`. `OrgChart.tsx` builds nodes from `agents[]` and edges from `reportsTo`. `AgentNode` renders the card; `AgentContextMenu` and `NodeDrawer` add per-node interactions.

**Conversation threading.** `ConversationFeed` groups `conversations[]` by `groupId` if present, otherwise by sorted `[from, to]` pair. The composer always reuses the active thread's `groupId`; new threads (kicked off via `KickoffModal` / `AssignTaskModal` / `NodeDrawer`) let the BE auto-generate one.

## Conventions

- All API calls go through `src/api/client.ts` (`apiGet/apiPost/apiPatch/apiDelete`). It throws `Error(serverMessage)` on non-2xx — components show `err.message` directly.
- `WorkerStatusValue` and `AgentConfig` types are duplicated from BE's `file-comm.ts` / `agent-config.ts`. When BE adds a field, copy it here.
- Component CSS lives next to the `.tsx` (e.g. `AgentCard.tsx` + `AgentCard.css`). No CSS-in-JS, no Tailwind — design tokens come from `src/styles/tokens.css`.
- Color-per-agent: `colorFor(name)` in `ConversationFeed.tsx` deterministically picks from a fixed palette by hashing the name.

## Features (current capabilities)

### Tabs in `App.tsx`

| Tab | Purpose | Polling |
|---|---|---|
| **Workers** | List one-shot workers, retry/stop, per-worker output viewer | 3 s |
| **Errors** | Subset filter of Workers where `status === 'error'` | shares Workers data |
| **Live** | Per-worker liveness cards (PID alive, idle, output bytes, tail) | 2 s |
| **Agents** | Persistent agent cards, edit/reset/delete, **Timeline** button | 3 s |
| **Company** | Org-chart, conversation feed, kickoff modal, autonomy override | 3 s for agents; conversation tail incremental |
| **Debug** | Live `claude` process table with cmd/argv/uptime, expandable tail (40 lines), Kill button | 1/2/5 s selectable |

Header: global Refresh, Pause auto-refresh, Merge all, Clean.

### Worker views (`components/workers/`, `components/live/`)
- Workers tab: grid of `WorkerCard` with status badge, retry, stop, view output (modal). Errors tab is the same component scoped to `error` status.
- Live tab: `LiveCard` per active worker (status `pending|running|waiting|sleep`) — colour-coded by liveness (`ok | stale | zombie | unknown`), incremental tail via `useTail` (auto-scroll if at bottom), shows PID / uptime / idle / bytes / last output time.

### Agents tab (`components/agents/`)
- `AgentCard` per agent: name + role badge, status dot, soul/skill preview, turns + total cost + last active + reportsTo line.
- Buttons: **Edit** (modal — soul / skill / cwd / model / role / reportsTo / autonomy, optional reset on save), **Timeline** (opens shared `TimelineModal`), **Reset session** (kills in-flight + wipes), **Delete**.

### Company tab (`components/company/`)
- `OrgChart` (React Flow): nodes from agents, edges from `reportsTo`. Right-click for `AgentContextMenu`; click opens `NodeDrawer`.
- `AutonomyHeader` toggles the global autonomy override (auto / manual / off).
- `KickoffModal` + `AssignTaskModal`: send a kickoff task to one or more agents; both already pass `groupId` + `participants` so replies stay in one thread.
- `InitCompanyModal` + `AddAgentModal`: seed CEO/managers or quick-add a single agent.
- `ConversationFeed` (chat surface):
  - Left rail: thread list grouped by `groupId` (or sorted pair fallback) with last-message preview + per-thread delete.
  - Right pane: chronological chat view (`ChatMsg` for `user→agent` and `agent→agent` messages, `system` events for member additions).
  - Composer: `From` selector (user or any thread member), `To` chips (multi-select recipients), Enter-to-send. New threads get a UUID `groupId` on send.
  - `AddMembersPicker`: extend an existing group thread with more agents (writes a `system` marker entry on the BE).

### Debug tab + Timeline modal (`components/debug/`)
- `DebugTab`: polls `/api/debug/live-procs`. Toolbar: refresh interval (1s / 2s / 5s), manual refresh, live count.
- `LiveProcRow`: agent name, PID, uptime, started-at, cmd + argv (truncated, full on hover). **Tail** expands an in-row 40-line tail that auto-refreshes every 2 s. **Kill** confirms then `POST /api/agents/:name/kill`.
- `TimelineModal` (also opened from the `AgentCard` Timeline button): fetches `/api/agents/:name/trace`. Renders one block per turn with header (turn # · duration · time · model), user message, collapsible thinking, expandable tool-call blocks (input + result + duration + error badge), assistant text, and a usage line (`in / out / cache_read / cache_create / total_in`). Footer shows the resolved JSONL path. Read-only — costs zero Anthropic tokens (it just parses Claude Code's local JSONL).

### Shared primitives (`components/common/`)
- `Tabs` — keyboard-navigable tab strip with optional badges (`default` or `error` style).
- `Modal` — portal-based overlay with Esc-to-close, click-outside-to-close, optional footer.
- `StatusDot` / `StatusBadge` — dot or pill for any `WorkerStatusValue`.
- `EmptyState` — title + description illustration shown when a list is empty.

### API surface used by the FE (mirrors BE)
- `api/workers.ts` — list, list-live, output/tail, status, create, stop, retry, mergeAll, cleanAll.
- `api/agents.ts` — list, get, patch (with `?reset=true`), reset, delete, ask (with `from / groupId / participants`), create.
- `api/company.ts` — company snapshot, autonomy override, conversation tail, add thread members, delete thread.
- `api/debug.ts` — `listLiveProcs`, `tailAgentOutputLines(lines)`, `killAgent`, `getAgentTrace`, `getAgentTraceRaw`.
