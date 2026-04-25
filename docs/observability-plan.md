# ldmux × Claude Code — Observability & Debug Plan

**Scope:** design document, không code. Gồm (1) cách ldmux đang wrap Claude Code CLI, (2) mapping giữa ldmux session và Claude Code session, (3) thiết kế Debug page + Turn Timeline để "nhìn thấy Claude Code đang hoạt động", (4) roadmap.

---

## Phần 1 — ldmux đang wrap Claude Code CLI như thế nào

### 1.1 Hai code path spawn `claude`

| Path | File | Hàm | Lệnh | Mục đích |
|---|---|---|---|---|
| **Persistent agent** (ask / chat) | `be/src/agent.ts:216–250` | `askAgent()` | `claude` (resolved path) | Hội thoại nhiều turn, resume session |
| **Batch worker** | `be/src/worker.ts:15–87` | `spawnWorker()` | `claude` / `codex` / custom | One-shot prompt |
| **Windows Terminal pane** | `be/src/orchestrator.ts:123–135` | pane launcher | PowerShell wrap `claude -p` + `Tee-Object` | Tab hiển thị live trong WT |

Tất cả dùng `child_process.spawn` với `stdio: ['ignore', 'pipe', 'pipe']`, `FORCE_COLOR=0`.

### 1.2 Flags truyền vào `claude` (persistent agent — quan trọng nhất)

`agent.ts:102–115`:

```
Turn 1 (lần đầu):
  claude -p <question>
         --output-format json
         --session-id <uuid>           ← tự tạo bằng randomUUID()
         --system-prompt <soul+skill>  ← từ buildSystemPrompt()
         [--model opus|sonnet|haiku]   ← nếu cfg.model

Turn N (>1):
  claude -p <question>
         --output-format json
         --resume <sessionId>          ← lấy từ session.json
         [--model ...]
```

**Nhận xét nặng ký:**
- Dùng **`--output-format json`** (non-streaming). Claude chạy xong mới trả về 1 khối JSON cuối cùng → ldmux chỉ có **kết quả**, không có diễn biến bên trong (tool calls, thinking, token per step).
- Không dùng `--output-format stream-json`, không dùng `--verbose`, không pass `--mcp-config`, không dùng `--allowed-tools` hay `--permission-mode`. → Claude chạy với default permission (tương tác) — sẽ fail nếu yêu cầu tool nhạy cảm trong non-interactive mode.
- Env vars đưa vào process con: `LDMUX_AGENT_NAME`, `LDMUX_BASE_DIR`, `FORCE_COLOR=0` + inherit.

### 1.3 Parse output (`agent.ts:138–157`)

```ts
parsed = JSON.parse(stdout.trim().split('\n').filter(Boolean).pop() || '{}')
```

Chỉ lấy **dòng JSON cuối cùng**, trích:

| Field | Dùng cho |
|---|---|
| `parsed.result` | Answer text lưu vào `history.jsonl` |
| `parsed.session_id` | Persist ở `session.json` (để resume) |
| `parsed.duration_ms` | Hiển thị "12s" trên UI |
| `parsed.total_cost_usd` | Cost cộng dồn |
| `parsed.is_error`, `parsed.type` | Phân loại error turn |

**Bị bỏ lỡ:** `num_turns`, `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens`, tool-call list, per-tool duration. Đây là những thứ debug page cần.

### 1.4 Process lifecycle (mới thêm gần đây)

- `liveProcs: Map<agentName, Set<ChildProcess>>` (`agent.ts:34`)
- `trackProc()` add khi spawn, auto-remove ở `close` / `error`
- `killAgentProcesses(name)` → SIGTERM tất cả, SIGKILL sau 500ms
- `resetAgent()` gọi kill trước khi wipe files

→ **Đây chính là nền tảng cho Debug page** (xem Phần 3.1): map `liveProcs` đã biết từng PID đang chạy.

---

## Phần 2 — Mapping ldmux session ↔ Claude Code session

### 2.1 Thực tế hiện tại

| Phía | File | Schema |
|---|---|---|
| **ldmux** | `.ldmux/workers/<name>/session.json` | `{sessionId, turns, totalCostUsd, lastActiveAt}` |
| **ldmux** | `.ldmux/workers/<name>/history.jsonl` | mỗi dòng: `{role, content, timestamp, durationMs?, costUsd?, from?}` |
| **ldmux** | `.ldmux/workers/<name>/status.json` | `{name, status, pid?, startedAt?, ...}` |
| **ldmux** | `.ldmux/workers/<name>/output.log` | raw stdout+stderr (append) |
| **Claude Code** | `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` | full per-step trace: user msg, assistant msg, tool_use, tool_result, usage, thinking |

### 2.2 Insight then chốt — đã có mapping sẵn

Vì ldmux pass **`--session-id <uuid>`** (turn 1) và **`--resume <uuid>`** (turn N), Claude Code CLI **tự động** lưu file `<sessionId>.jsonl` theo đúng UUID đó trong `~/.claude/projects/<encoded-cwd>/`.

**Hệ quả:**
- `ldmux_agent_name → sessionId` có sẵn trong `session.json`
- `sessionId → claude_code_jsonl_path` xác định được bằng: `~/.claude/projects/${encode(cwd)}/${sessionId}.jsonl`
  - (Cần xác nhận `<encoded-cwd>` dùng quy tắc nào — thường là `cwd.replaceAll('/', '-')` với prefix `-`. VD `/root/learn-claude/ldmux` → `-root-learn-claude-ldmux`.)
- **→ Không cần thay đổi cách spawn. Chỉ cần đọc file JSONL đó để lấy timeline chi tiết.**

### 2.3 Cái `<encoded-cwd>` — ràng buộc

- Với persistent agent, `cwd` có thể là `agent.cwd` (per-agent override) hoặc default. Cần log ra để biết chắc.
- Nếu agent chưa set `cwd`, Claude Code dùng cwd hiện tại của process ldmux → file JSONL nằm ở `~/.claude/projects/-root-learn-claude-ldmux-be/...` (hoặc tương tự).
- **Kế hoạch:** khi spawn, ldmux đã biết `workDir`. Ghi kèm `workDir` vào `session.json` để sau này resolve được path JSONL chính xác, không phải đoán.

### 2.4 Mapping table đầy đủ (sau khi bổ sung `workDir`)

```
ldmux agent name         ← key người dùng biết
  └─ .ldmux/workers/<name>/session.json
        ├─ sessionId            ← UUID dùng cả 2 phía
        ├─ workDir (thêm mới)   ← để resolve path JSONL
        └─ ...
             │
             └──→ ~/.claude/projects/${encode(workDir)}/${sessionId}.jsonl
                    ├─ line 1: {type:"user", message:{content:"..."}}
                    ├─ line 2: {type:"assistant", message:{content:[...]}, usage:{...}}
                    ├─ line 3: {type:"assistant", message:{content:[{type:"tool_use", name:"Bash", input:{...}}]}}
                    ├─ line 4: {type:"user", message:{content:[{type:"tool_result", ...}]}}
                    └─ ...
```

---

## Phần 3 — "Nhìn thấy Claude Code đang hoạt động"

Hai surface bổ sung cho FE, cùng chia sẻ BE endpoints.

### 3.1 Debug page (3b) — Process runtime view

**Mục tiêu:** one-shot nhìn thấy lúc nào có `claude` đang chạy, chạy bao lâu, log cuối cùng là gì.

**Thành phần UI:**
```
┌─ Debug / Live Processes ────────────────────────────────────┐
│                                                              │
│  [Auto-refresh 2s ▾]  [Show stopped ☐]                       │
│                                                              │
│  Agent         PID    Uptime   Status     CMD                │
│  ────────────  ─────  ───────  ─────────  ─────────────────  │
│  researcher    12843  00:04:17 running    claude -p … --res… │
│    └─ tail (last 40 lines of output.log)  [Expand] [Kill]   │
│                                                              │
│  coder         —      —        waiting    (idle)             │
│                                                              │
│  writer        13102  00:00:09 running    claude -p … --sess…│
│    └─ tail …                                                 │
└──────────────────────────────────────────────────────────────┘
```

**BE cần bổ sung:**

| Endpoint | Trả về |
|---|---|
| `GET /api/debug/live-procs` | `[{agentName, pid, startedAt, cmd, argv, uptimeMs, status}]` — đọc từ `liveProcs` registry |
| `GET /api/agents/:name/output/tail?lines=N` | tail N dòng cuối `output.log` (đã có `/output/tail?since=<bytes>`, cần thêm variant theo line) |
| `POST /api/agents/:name/kill` | Expose `killAgentProcesses(name)` tách rời khỏi reset (hiện reset gộp 2 thứ) |

**Không cần streaming:** polling 2s là đủ cho debug page.

### 3.2 Turn Timeline (3c) — Per-turn trace

**Mục tiêu:** với mỗi turn của agent, replay được "input → tool calls → output → cost/tokens".

**Nguồn dữ liệu:** `~/.claude/projects/<encoded>/<sessionId>.jsonl` — Claude Code đã ghi sẵn mọi thứ.

**Thành phần UI:** vào detail của 1 agent → tab **Timeline**:

```
Agent: researcher                                   [Refresh]
Session: 3f2a… (turn 1..7)
──────────────────────────────────────────────────────────────

Turn 3  ·  12.4s  ·  $0.018  ·  5.2k in → 2.1k out (cache: 12k)
├─ 🧑 User: "check the Grafana link"
├─ 🤖 Assistant (thinking, 812 tokens)
├─ 🔧 Tool call: WebFetch
│    url: "https://grafana.internal/..."
│    [result: 4.2KB, 280ms] ▾
├─ 🤖 Assistant (final)
│    "I checked Grafana. The p99 latency..."
└─ 📊 Usage: input=5203, output=2134, cache_read=12801

Turn 4  ·  3.1s  ·  $0.004  ·  ...
└─ ...
```

**BE cần bổ sung:**

| Endpoint | Trả về |
|---|---|
| `GET /api/agents/:name/trace` | Parse JSONL → `[{turnIndex, userMsg, assistantMsgs, toolCalls: [{name, input, result, durationMs?}], usage, costUsd, durationMs, startedAt}]` |
| `GET /api/agents/:name/trace/raw` | raw JSONL (cho user muốn xem pure) |

**Parse logic (pseudo):**
```
for line in jsonl:
  if line.type == "user":            start new turn
  elif line.type == "assistant":
     for block in line.message.content:
        if block.type == "text":     append to final answer
        elif block.type == "thinking": append to thinking
        elif block.type == "tool_use": record pending tool call
  elif line.type == "user" and content is tool_result:
     attach result to last pending tool call
  collect usage from line.message.usage
```

### 3.3 Tại sao tách 3.1 và 3.2

- **3.1 (Debug page)** trả lời: "Bây giờ đang chạy gì? Có treo không?" → process-level, realtime, ngắn hạn.
- **3.2 (Timeline)** trả lời: "Lần đó nó làm gì? Dùng tool gì? Tốn bao nhiêu?" → historical, per-turn, diagnostic.

Cùng một agent name làm key join giữa 2 view.

---

## Phần 4 — Roadmap

Sắp xếp theo **giá trị/effort**, từng bước độc lập:

### Bước 0 — Precondition (nhỏ, chuẩn bị)
- [ ] Ghi thêm `workDir` vào `session.json` khi spawn (BE) để không phải đoán `<encoded-cwd>`.
- [ ] Verify quy tắc encode path của Claude Code trên máy thật (check 1 file `~/.claude/projects/.../*.jsonl` thực tế, so với `cwd` tương ứng).

### Bước 1 — Enrich parsing (giá trị cao, effort thấp)
- [ ] Tại `agent.ts:138–157`: ngoài `result / session_id / duration_ms / total_cost_usd`, trích thêm `num_turns`, `usage.*`. Lưu vào mỗi entry `history.jsonl`.
- [ ] Expose field `usage` lên `/api/agents/:name` response.
- **Kết quả:** card agent hiển thị được "X tokens, Y cache hit" mà chưa cần đụng JSONL.

### Bước 2 — Debug page (3.1)
- [ ] BE: `GET /api/debug/live-procs` đọc `liveProcs` + bổ sung `startedAt/cmd` cache tại thời điểm spawn.
- [ ] BE: `POST /api/agents/:name/kill` tách khỏi reset.
- [ ] FE: tab mới `debug` trong `App.tsx`. Component `DebugTab.tsx` polling 2s, bảng process + tail + kill.
- **Kết quả:** "đang chạy gì" visible realtime.

### Bước 3 — Turn timeline (3.2)
- [ ] BE: `GET /api/agents/:name/trace` — đọc JSONL từ `~/.claude/projects/...`, parse thành cấu trúc per-turn như 3.2.
- [ ] BE: `GET /api/agents/:name/trace/raw` fallback.
- [ ] FE: trong AgentCard / NodeDrawer, thêm button "Timeline" mở modal hoặc route.
- [ ] FE: component render turn list với expandable tool calls.
- **Kết quả:** replay được từng turn, thấy tool calls, cost/token chi tiết.

### Bước 4 — Nâng cấp (optional)
- [ ] SSE (`GET /api/agents/:name/stream`) thay polling cho Live/Debug page — khi quan sát nhiều agent realtime.
- [ ] Chuyển `--output-format json` → `stream-json` cho persistent agent → capture tool calls ngay trong khi chạy (không phụ thuộc Claude Code JSONL) → unlock "watch turn đang diễn ra" trên FE.
- [ ] Merge nguồn data: ldmux history + Claude Code JSONL + output.log vào 1 unified trace view.
- [ ] Permission control: truyền `--allowed-tools`, `--permission-mode` cho phép ldmux quyết định agent được dùng tool gì.

### Rủi ro / câu hỏi mở
1. **Quy tắc `<encoded-cwd>`** của Claude Code có thể thay đổi giữa versions — cần test. Fallback: scan thư mục `~/.claude/projects/*/` tìm file `<sessionId>.jsonl`.
2. **`output.log` append raw có lúc chứa non-JSON** (khi lỗi) — parser phải resilient.
3. **Nhiều user trên cùng máy:** `~/.claude` là per-user. Nếu chạy ldmux dưới user khác với user tạo session, JSONL không tồn tại. → Đọc `process.env.HOME` đúng.
4. **Session rename / resume từ Claude Code khác:** nếu user tự chạy `claude --resume <uuid>` ngoài ldmux, turn mới sẽ thêm vào cùng JSONL → timeline ldmux sẽ thấy extra turns. OK hay không phải quyết định.

---

## Tóm tắt 1 phút

- ldmux hiện chỉ bắt **kết quả cuối** của mỗi turn (`--output-format json`, parse dòng cuối).
- Nhưng vì ldmux truyền `--session-id` / `--resume`, **Claude Code đã tự lưu full trace** tại `~/.claude/projects/.../<sessionId>.jsonl` — miễn phí.
- **Debug page (3.1)** và **Turn Timeline (3.2)** có thể build bằng cách (a) đọc `liveProcs` registry cho runtime view, (b) đọc JSONL của Claude Code cho historical per-turn trace. Không cần đổi cách spawn, không cần stream mode.
- Roadmap 4 bước, mỗi bước độc lập, giá trị tăng dần.
