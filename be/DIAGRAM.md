# Sơ đồ sử dụng ldmux

File này chứa sơ đồ ASCII mô tả cách ldmux hoạt động. Dùng kèm với `GUIDE.md` cho người mới.

---

## 1. Bức tranh tổng thể — ldmux giải quyết gì?

### TRƯỚC khi có ldmux

```
  ┌────────────────────────────────────────────────────────────┐
  │                     Máy của bạn                            │
  │                                                            │
  │   Terminal 1                       Terminal 2              │
  │  ┌────────────────┐              ┌────────────────┐        │
  │  │ claude trong   │              │ claude trong   │        │
  │  │ /repo/frontend │              │ /repo/backend  │        │
  │  └────────┬───────┘              └────────▲───────┘        │
  │           │                               │                │
  │           │ "Cần hỏi BE..."               │                │
  │           │                               │                │
  │           │   ── Copy câu hỏi bằng tay ──►│                │
  │           │                               │                │
  │           │                               │ (agent trả)    │
  │           │                               │                │
  │           │◄── Copy answer bằng tay ──────│                │
  │           │                               │                │
  │           ▼                               ▼                │
  │    (chậm, mất tập trung)        (lặp lại N lần)            │
  └────────────────────────────────────────────────────────────┘
```

### SAU khi có ldmux + MCP

```
  ┌────────────────────────────────────────────────────────────┐
  │                     Máy của bạn                            │
  │                                                            │
  │   ┌─────────────┐                                          │
  │   │    Bạn      │                                          │
  │   │  (User)     │                                          │
  │   └──────┬──────┘                                          │
  │          │ "Cần BE giải thích auth"                        │
  │          ▼                                                 │
  │   ┌───────────────────────────┐                            │
  │   │  Claude Code (parent)     │                            │
  │   │  đang mở trong /repo/fe   │                            │
  │   └──────────┬────────────────┘                            │
  │              │ tự gọi MCP tool                             │
  │              │ ask_agent("backend-expert", "...")          │
  │              ▼                                             │
  │   ┌───────────────────────────┐                            │
  │   │  ldmux MCP server         │                            │
  │   │  (stdio subprocess)       │                            │
  │   └──────────┬────────────────┘                            │
  │              │ spawn với --resume                          │
  │              ▼                                             │
  │   ┌───────────────────────────┐                            │
  │   │  claude -p "..."           │                           │
  │   │  --session-id <uuid>       │                           │
  │   │  (backend-expert agent)    │                           │
  │   │  chạy trong /repo/be       │                           │
  │   └──────────┬─────────────────┘                           │
  │              │ answer JSON                                 │
  │              ▼                                             │
  │        Parent Claude tổng hợp                              │
  │              │                                             │
  │              ▼                                             │
  │          Bạn nhận kết quả                                  │
  │                                                            │
  │   → Không phải mở terminal thứ 2                           │
  │   → Không phải copy/paste                                  │
  │   → Context frontend không bị gián đoạn                    │
  └────────────────────────────────────────────────────────────┘
```

---

## 2. Cài đặt lần đầu — 5 bước

```
  ┌─────────────────────────────────────────────────────────┐
  │ BƯỚC 1:  Cài Claude Code CLI                            │
  │          npm install -g @anthropic-ai/claude-code       │
  │          claude   # đăng nhập lần đầu                   │
  │          ────────► có lệnh `claude` toàn cục            │
  └─────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────┐
  │ BƯỚC 2:  Clone + build ldmux                            │
  │          git clone <repo>                               │
  │          cd <folder>                                    │
  │          npm install                                    │
  │          npm run build                                  │
  │          npm link                                       │
  │          ────────► có lệnh `ldmux` toàn cục             │
  └─────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────┐
  │ BƯỚC 3:  Tạo agent đầu tiên                             │
  │          ldmux create                                   │
  │          (wizard hỏi: name, soul, skill, cwd, model)    │
  │          ────────► <ldmux-install>/.ldmux/workers/<name>/agent.json   │
  └─────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────┐
  │ BƯỚC 4:  Đăng ký MCP với Claude Code                    │
  │          Thêm vào ~/.claude.json:                       │
  │          {                                              │
  │            "mcpServers": {                              │
  │              "ldmux": {                                 │
  │                "command": "ldmux",                      │
  │                "args": ["mcp"]                          │
  │              }                                          │
  │            }                                            │
  │          }                                              │
  │          ────────► Parent Claude biết ldmux             │
  └─────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────┐
  │ BƯỚC 5:  Auto-approve tools                             │
  │          Thêm vào ~/.claude/settings.json:              │
  │          { "allowedTools": ["mcp__ldmux"] }             │
  │          ────────► Không cần approve từng lần           │
  └─────────────────────────────────────────────────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────┐
  │       claude   # chạy Parent Claude, sẵn sàng!          │
  └─────────────────────────────────────────────────────────┘
```

---

## 3. Vòng đời của một Agent — các trạng thái

```
                     ldmux create
                  ┌────────────────┐
                  │   wizard hỏi   │
                  │  soul, skill,  │
                  │   name, cwd    │
                  └────────┬───────┘
                           │
                           ▼
                  ┌─────────────────┐
           ┌─────►│      sleep      │   Agent tồn tại,
           │      │  (chưa ask lần) │   chưa có session
           │      └────────┬────────┘
           │               │ ldmux ask <name> "..."
           │               ▼
           │      ┌─────────────────┐   Đang spawn child
           │      │     running     │   claude + chờ answer
           │      └────────┬────────┘
           │               │ answer về
           │               ▼
           │      ┌─────────────────┐   Có answer,
           │      │     waiting     │◄─┐ rảnh chờ câu tiếp
           │      └────────┬────────┘  │
           │               │           │
           │               │ ldmux ask │
           │               │ (lần nữa) │
           │               ▼           │
           │      ┌─────────────────┐  │
           │      │     running     │──┘
           │      └─────────────────┘
           │
           │               │
           │  ldmux reset  │  (xoá session,
           │               │   giữ soul/skill)
           └───────────────┘
                           │
                           │ có lỗi (claude crash,
                           │  parse JSON fail, ...)
                           ▼
                  ┌─────────────────┐
                  │      error      │   Cần xem output.log
                  │                 │   và reset để chạy lại
                  └─────────────────┘
```

**Ý nghĩa từng state:**

| State | Nghĩa | Ở khi nào |
|-------|-------|-----------|
| `sleep` | Agent mới tạo, chưa ask lần nào, hoặc vừa `reset` | Sau `create` / `reset` |
| `running` | Đang spawn child claude, chờ output | Trong lúc `ask` thực thi |
| `waiting` | Đã có answer, sẵn sàng nhận câu hỏi kế | Sau khi `ask` thành công |
| `error` | Gặp lỗi (network, auth, parse) | Khi ask thất bại |

---

## 4. Flow ldmux + Claude Code hằng ngày

```
  ┌────────────────────────────────────────────────────────┐
  │ Bạn đang sửa frontend trong /repo/fe                   │
  └────────────────┬───────────────────────────────────────┘
                   │
                   │ $ cd /repo/fe && claude
                   ▼
  ┌────────────────────────────────────────────────────────┐
  │ Parent Claude mở ra, có context của /repo/fe          │
  └────────────────┬───────────────────────────────────────┘
                   │
                   │ Gõ tự nhiên:
                   │ "How does backend validate JWT?"
                   ▼
  ┌────────────────────────────────────────────────────────┐
  │ Parent Claude quyết định tự:                           │
  │                                                        │
  │   1. Gọi mcp__ldmux__list_agents                       │
  │      ────► thấy: backend-expert, db-expert, ...        │
  │                                                        │
  │   2. Gọi mcp__ldmux__ask_agent(                        │
  │        name: "backend-expert",                         │
  │        question: "explain JWT validation flow"         │
  │      )                                                 │
  │                                                        │
  │   3. Nhận answer từ backend-expert                     │
  │                                                        │
  │   4. Tổng hợp + áp dụng vào frontend code              │
  └────────────────┬───────────────────────────────────────┘
                   │
                   ▼
  ┌────────────────────────────────────────────────────────┐
  │ Bạn nhận câu trả lời + patch frontend sẵn sàng dùng    │
  │ (vẫn đứng ở /repo/fe, không cần mở terminal thứ 2)     │
  └────────────────────────────────────────────────────────┘
```

---

## 5. Agent mode vs Batch mode — khi nào dùng gì?

```
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   CÂU HỎI: Bạn muốn làm gì?                                 │
  │                                                             │
  └─────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────────┐
         │ Muốn tạo chuyên gia dùng lâu dài,        │
         │ nhớ context, hỏi nhiều lần               │
         │ (backend-expert, db-expert, ...)         │
         └──────────────────┬───────────────────────┘
                            │
                YES         │         NO
              ┌─────────────┼────────────┐
              ▼                          ▼
  ┌───────────────────────┐   ┌─────────────────────────┐
  │   AGENT MODE          │   │   BATCH MODE            │
  │                       │   │                         │
  │   ldmux create        │   │   ldmux new "<prompt>"  │
  │   ldmux ask           │   │   ldmux run plan.json   │
  │   ldmux chat          │   │   ldmux list            │
  │   ldmux agents        │   │   ldmux merge           │
  │   ldmux edit          │   │   ldmux gui             │
  │   ldmux reset         │   │   ldmux clean           │
  │                       │   │                         │
  │   Lưu tại:            │   │   Lưu tại:              │
  │   <ldmux-install>/.ldmux/           │   │   ./cwd/.ldmux/         │
  │   (global)            │   │   (per-project)         │
  │                       │   │                         │
  │   Kết hợp Claude Code │   │   Chạy 1 lần xong       │
  │   qua MCP             │   │   không nhớ gì          │
  └───────────────────────┘   └─────────────────────────┘
```

**Ví dụ cụ thể:**

- "Tôi muốn tạo một agent backend-expert để hỏi trong nhiều tuần"
  → **Agent mode** (`ldmux create backend-expert`)

- "Tôi muốn 3 agent song song: db, api, ui cho tính năng billing xong trong 1 giờ"
  → **Batch mode** (`ldmux run billing.json`)

- "Parent Claude của tôi cần hỏi BE giữa lúc sửa FE"
  → **Agent mode + MCP**

---

## 6. Cấu trúc file — biết ở đâu để debug

```
  <ldmux-install>/.ldmux/                         ← AGENT MODE (global)
  └── workers/
      └── backend-expert/
          ├── agent.json            # name, soul, skill, cwd, model
          ├── session.json          # sessionId, turns, totalCostUsd
          ├── status.json           # sleep | running | waiting | error
          ├── history.jsonl         # 1 dòng = 1 turn (role, content, cost)
          └── output.log            # raw JSON của claude (debug)

  /project/.ldmux/                  ← BATCH MODE (per-project)
  ├── merged-output.md              # từ `ldmux merge`
  └── workers/
      └── db/
          ├── task.md               # prompt gốc
          ├── status.json           # pending | running | done | error
          └── output.log            # stdout + stderr của claude
```

---

## 7. Luồng gọi chi tiết — khi parent Claude ask_agent

```
  ┌──────────────────────────────────────────────────────────────┐
  │ Parent Claude                                                │
  │                                                              │
  │  ask_agent(name="backend-expert", question="explain JWT")    │
  └──────────────────┬───────────────────────────────────────────┘
                     │ JSON-RPC qua stdio
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ ldmux MCP server (src/mcp-server.ts)                         │
  │                                                              │
  │  1. Đọc <ldmux-install>/.ldmux/workers/backend-expert/agent.json           │
  │  2. Đọc <ldmux-install>/.ldmux/workers/backend-expert/session.json         │
  │     (nếu đã có sessionId)                                    │
  │  3. Gọi askAgent(baseDir, name, question)                    │
  └──────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ askAgent (src/agent.ts)                                      │
  │                                                              │
  │  Nếu lần đầu (chưa có session):                              │
  │    spawn('claude', [                                         │
  │      '-p', question,                                         │
  │      '--output-format', 'json',                              │
  │      '--session-id', <new UUID>,                             │
  │      '--system-prompt', <soul + skill>                       │
  │    ])                                                        │
  │                                                              │
  │  Nếu đã có session:                                          │
  │    spawn('claude', [                                         │
  │      '-p', question,                                         │
  │      '--output-format', 'json',                              │
  │      '--resume', <sessionId>                                 │
  │    ])                                                        │
  └──────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ Child claude process                                         │
  │                                                              │
  │  Chạy trong agent.cwd (nếu có) hoặc homedir                  │
  │  Xử lý prompt → in JSON result ra stdout → exit              │
  │                                                              │
  │  Output JSON gồm:                                            │
  │    { type: "result",                                         │
  │      result: "<answer text>",                                │
  │      session_id: "...",                                      │
  │      duration_ms: ...,                                       │
  │      total_cost_usd: ...,                                    │
  │      is_error: false }                                       │
  └──────────────────┬───────────────────────────────────────────┘
                     │ stdout (JSON)
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ askAgent nhận JSON:                                          │
  │                                                              │
  │  - Ghi output.log (debug)                                    │
  │  - Parse JSON → session_id, result, cost, duration           │
  │  - Update session.json (turns++, totalCostUsd += ...)        │
  │  - Append history.jsonl (user turn + assistant turn)         │
  │  - Update status.json → "waiting"                            │
  │  - Trả về { sessionId, answer, durationMs, costUsd }         │
  └──────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ MCP server wrap answer → trả về qua JSON-RPC                 │
  └──────────────────┬───────────────────────────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ Parent Claude nhận answer → dùng để trả lời user             │
  └──────────────────────────────────────────────────────────────┘
```

---

## 8. Các pattern phổ biến

### Pattern A: Hỏi chuyên gia khác repo

```
  Bạn sửa /repo/fe ──► Parent Claude ──► ask_agent("backend-expert")
                                         ├── backend-expert cwd=/repo/be
                                         └── trả về dựa trên code BE
                       ◄── tổng hợp ──
```

### Pattern B: Multi-expert review

```
  Bạn vừa viết xong PaymentForm.tsx
         │
         ▼
  Parent Claude nhận code
         │
         ├──► ask_agent("security-reviewer", code)
         ├──► ask_agent("perf-reviewer", code)
         └──► ask_agent("a11y-reviewer", code)
              (3 agent chạy song song)
         │
         ▼
  Parent tổng hợp 3 review → trả user
```

### Pattern C: Long-running design session

```
  Day 1:  ldmux chat architect
          You > "Giúp tôi design notification service"
          architect > "Scale? Push/email/SMS? ..."
          You > "..."
          ... 20 phút chat ...
          You > /exit

  Day 2:  ldmux chat architect
          (resume session cũ tự động)
          You > "Tiếp tục phần queue design"
          architect > (nhớ toàn bộ bối cảnh ngày trước)
```

### Pattern D: Batch workers + Agent song song

```
  Terminal 1:  ldmux run implement-feature.json  (chạy 3 worker)
                     │
                     │ (đang chạy...)
                     ▼
  Terminal 2:  ldmux chat architect
                     │
                     │ "Giải thích lại quyết định X"
                     ▼
                     (agent mode không đụng batch mode)
```

---

## 9. Troubleshoot nhanh — luồng xử lý lỗi

```
  Lệnh ldmux gặp lỗi?
         │
         ▼
  ┌───────────────────┐
  │ ldmux: not found  │──► npm run build && npm link
  └───────────────────┘
         │ không phải
         ▼
  ┌───────────────────┐
  │ claude: not found │──► npm install -g @anthropic-ai/claude-code
  └───────────────────┘      claude  # login
         │ không phải
         ▼
  ┌───────────────────┐
  │ Agent "error"     │──► cat <ldmux-install>/.ldmux/workers/<name>/output.log
  │ state             │     rồi ldmux reset <name>
  └───────────────────┘
         │ không phải
         ▼
  ┌───────────────────┐
  │ Parent Claude     │──► claude --debug
  │ không thấy MCP    │     Kiểm tra ~/.claude.json có đúng
  │ tool              │     Kiểm tra `ldmux mcp` chạy được
  └───────────────────┘
         │ không phải
         ▼
  ┌───────────────────┐
  │ Session lạ, agent │──► ldmux reset <name>
  │ trả lời không đúng│     (tạo session mới với soul/skill)
  │ persona           │
  └───────────────────┘
```

---

## 10. Tóm tắt 1 trang — Cheat sheet

```
  ╔══════════════════════════════════════════════════════════════╗
  ║                     LDMUX CHEAT SHEET                        ║
  ╠══════════════════════════════════════════════════════════════╣
  ║                                                              ║
  ║   SETUP 1 LẦN:                                               ║
  ║     npm install && npm run build && npm link                 ║
  ║                                                              ║
  ║   TẠO AGENT:                                                 ║
  ║     ldmux create           (wizard)                          ║
  ║                                                              ║
  ║   DÙNG AGENT:                                                ║
  ║     ldmux ask <name> "<câu hỏi>"                             ║
  ║     ldmux chat <name>      (REPL)                            ║
  ║     ldmux agents           (list)                            ║
  ║                                                              ║
  ║   QUẢN LÝ:                                                   ║
  ║     ldmux edit <name>      (đổi soul/skill/cwd/model)        ║
  ║     ldmux reset <name>     (xoá session, giữ config)         ║
  ║                                                              ║
  ║   MCP (với Claude Code):                                     ║
  ║     ldmux mcp              (thường Claude tự spawn)          ║
  ║     claude --allowedTools "mcp__ldmux" --permission-mode     ║
  ║       dontAsk                                                ║
  ║                                                              ║
  ║   BATCH (one-shot):                                          ║
  ║     ldmux new "<prompt>"                                     ║
  ║     ldmux run plan.json                                      ║
  ║     ldmux gui              (dashboard port 3700)             ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝
```

---

**Đọc thêm:** `GUIDE.md` cho hướng dẫn đầy đủ, `README.md` cho quick reference, `CLAUDE.md` là hướng dẫn cho Claude Code agents làm việc trong repo này.
