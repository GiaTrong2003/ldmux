# ldmux - Local dmux for Windows Terminal

Multi-agent orchestrator cho phép chạy nhiều Claude Code sessions song song trên Windows Terminal + PowerShell. Không cần cài npm global — chỉ cần clone về và chạy.

> 👉 **Setup lần đầu trên Windows (từ A–Z):** xem [`SETUP-WINDOWS.md`](./SETUP-WINDOWS.md). Nhanh hơn nhiều so với đọc toàn bộ README này.
>
> Dự án đã tách thành 2 repo: BE này + [ldmux-fe](https://github.com/GiaTrong2003/ldmux-fe) (dashboard). Clone cả 2 làm sibling dưới cùng 1 thư mục cha.

## Tại sao cần ldmux?

Khi làm dự án lớn, bạn có thể chia công việc cho nhiều AI agent chạy cùng lúc:
- 1 agent làm database schema
- 1 agent làm API endpoints
- 1 agent làm UI components

Thay vì làm tuần tự (30 phút), chạy song song chỉ mất ~10 phút.

## Yêu cầu hệ thống

- **OS:** Windows 10/11
- **Terminal:** Windows Terminal (có sẵn trên Windows 11, hoặc tải từ Microsoft Store)
- **Node.js:** >= 18.0.0 ([tải tại đây](https://nodejs.org/))
- **Claude Code CLI:** Đã cài đặt và đăng nhập

## Cài đặt

### Cách 1: Clone từ GitHub

```powershell
git clone https://github.com/GiaTrong2003/tmux-clone-for-enterprise-machine.git
cd tmux-clone-for-enterprise-machine
npm install
```

### Cách 2: Máy không có npm (enterprise machine)

Nếu máy không cho cài npm global, làm theo các bước:

1. Tải ZIP từ GitHub: **Code > Download ZIP**
2. Giải nén vào thư mục bất kỳ
3. Copy `node_modules` từ máy khác (hoặc tải file `node_modules.zip` từ Releases)
4. Giải nén `node_modules` vào thư mục dự án

### Cách 3: Cài làm lệnh global `ldmux`

Sau khi đã clone/giải nén và `npm install`, chạy 1 lần duy nhất:

```powershell
npm run build    # Biên dịch TypeScript -> dist/
npm link         # Đăng ký lệnh `ldmux` toàn cục
```

Sau đó mở **bất kỳ terminal nào** và gõ trực tiếp:

```powershell
ldmux help
ldmux new "Implement auth middleware"
ldmux run plan.json
ldmux gui
```

Không cần `npx ts-node src/index.ts ...` nữa. Mỗi lần sửa code TypeScript trong `src/` chỉ cần chạy lại `npm run build` — không cần `npm link` lại.

**Lệnh `ldmux` chạy trong thư mục hiện tại (`cwd`)**, nên thư mục `.ldmux/workers/` sẽ được tạo ngay tại project bạn đang dùng. Đứng project nào, chạy ở project đó.

**Gỡ bỏ:** `npm unlink -g ldmux`

**Windows:** `npm link` tự động tạo `ldmux.cmd` trong thư mục npm global (đã có sẵn trong PATH).
**Mac/Linux:** `npm link` tạo symlink trong `$(npm config get prefix)/bin`. Nếu gõ `ldmux` không thấy, kiểm tra PATH có thư mục đó chưa.

## Cấu trúc dự án

```
ldmux/
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── plan.example.json         # Ví dụ task plan
└── src/
    ├── index.ts              # CLI entry point
    ├── file-comm.ts          # Đọc/ghi file trong .ldmux/
    ├── worker.ts             # Spawn và quản lý agent process
    ├── pane-manager.ts       # Mở Windows Terminal panes qua wt CLI
    ├── orchestrator.ts       # Đọc plan.json, tạo workers
    ├── merge.ts              # Gộp output từ tất cả workers
    └── gui/
        ├── server.ts         # Express API server
        └── public/
            └── index.html    # Web Dashboard
```

## Sử dụng

> **Ghi chú về cú pháp:** Tất cả ví dụ dưới đây đều dùng lệnh global `ldmux` (sau khi đã `npm link`). Nếu bạn chưa cài global, thay `ldmux` bằng `npx ts-node src/index.ts` — kết quả giống hệt.

### Tổng quan các lệnh

| Lệnh | Mục đích |
|------|----------|
| `ldmux new <prompt>` | Tạo 1 worker đơn lẻ ở background |
| `ldmux run <plan.json>` | Chạy nhiều worker theo plan (mở panes + background) |
| `ldmux list` | Liệt kê tất cả worker và trạng thái |
| `ldmux merge` | Gộp output tất cả worker vào `.ldmux/merged-output.md` |
| `ldmux gui` | Mở web dashboard ở http://localhost:3700 |
| `ldmux clean` | Xóa toàn bộ `.ldmux/workers/` |
| `ldmux help` | In hướng dẫn |

### 1. Tạo 1 worker đơn lẻ

```powershell
ldmux new "Implement auth middleware for Express"
```

Đặt tên cho worker:

```powershell
ldmux new "Implement auth middleware" --name auth-worker
```

Worker chạy ngầm ở background, output ghi vào `.ldmux/workers/<name>/output.log`.

### 2. Chạy từ file plan (JSON)

Tạo file `plan.json`:

```json
{
  "name": "my-feature",
  "layout": "vertical",
  "gitWorktree": false,
  "workers": [
    {
      "name": "db-schema",
      "prompt": "Create database schema and migrations for billing feature",
      "cwd": "."
    },
    {
      "name": "api",
      "prompt": "Build REST API endpoints for billing",
      "cwd": "."
    },
    {
      "name": "ui",
      "prompt": "Create React components for billing dashboard",
      "cwd": "."
    }
  ]
}
```

Chạy plan:

```powershell
ldmux run plan.json
```

Chạy không mở pane (background only) — hữu ích khi đang dùng Linux/Mac hoặc khi không muốn mở nhiều cửa sổ:

```powershell
ldmux run plan.json --no-pane
```

**Luồng thực thi nội bộ:**
1. Nếu `gitWorktree: true`, tạo `git worktree` + branch riêng (`ldmux/<plan>/<worker>`) cho mỗi worker.
2. Với mỗi worker: mở 1 Windows Terminal pane chạy `claude -p '<prompt>'` (nếu bật `--pane`).
3. **Đồng thời** spawn 1 tiến trình background cùng nhiệm vụ — để ghi log vào `.ldmux/workers/<name>/output.log` cho `list`/`merge`/GUI đọc.

### 3. Xem trạng thái workers

```powershell
ldmux list
```

Output:

```
  Workers:

    [>] db-schema - running (started: 10:30:15 AM)
    [+] api - done (started: 10:30:16 AM)
    [!] ui - error (started: 10:30:17 AM)
```

### 4. Mở Web Dashboard (GUI)

```powershell
ldmux gui
```

Mở trình duyệt tại: **http://localhost:3700**

**Web chỉ để xem/thao tác** — CLI và GUI đọc chung `.ldmux/workers/`, nên mọi thay đổi ở một phía đều phản ánh bên kia. Bạn không bắt buộc phải mở GUI; chỉ cần thích thì mở.

Dashboard cho phép:
- Xem danh sách workers real-time (tự động refresh mỗi 3 giây)
- Tạo worker mới từ giao diện web
- Xem output log của từng worker
- Stop worker đang chạy
- Merge kết quả tất cả workers
- Xóa toàn bộ worker data

**REST API** (hữu ích nếu muốn tích hợp script khác):

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/workers` | Danh sách workers |
| GET | `/api/workers/:name/status` | Status 1 worker |
| GET | `/api/workers/:name/output` | Output log 1 worker |
| POST | `/api/workers` | Tạo worker mới (`{name, prompt, cwd?, agent?}`) |
| POST | `/api/workers/:name/stop` | Dừng 1 worker |
| POST | `/api/merge` | Merge tất cả outputs |
| POST | `/api/clean` | Xóa worker data |

### 5. Gộp kết quả (Merge)

```powershell
ldmux merge
```

Kết quả được ghi vào `.ldmux/merged-output.md` — file Markdown có heading cho mỗi worker, kèm status, timestamp và full output trong code block.

### 6. Dọn dẹp

```powershell
ldmux clean
```

Xóa toàn bộ thư mục `.ldmux/workers/`. Không xóa file `.ldmux/merged-output.md` đã tạo trước đó.

## Cấu hình Plan JSON

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `name` | string | có | Tên của plan (dùng làm prefix branch khi `gitWorktree: true`) |
| `layout` | `"vertical"` \| `"horizontal"` \| `"grid"` | không | Cách sắp xếp panes — mặc định `vertical` |
| `gitWorktree` | boolean | không | Tạo git worktree riêng cho mỗi worker — mặc định `false` |
| `workers` | array | có | Danh sách workers (tối thiểu 1) |
| `workers[].name` | string | có | Tên worker, duy nhất, filesystem-safe (không chứa `/`, `\`, space) |
| `workers[].prompt` | string | có | Prompt gửi cho AI agent |
| `workers[].cwd` | string | không | Thư mục làm việc — mặc định là thư mục gốc của plan |
| `workers[].agent` | string | không | `"claude"` (mặc định), `"codex"`, hoặc lệnh bất kỳ trên PATH |

**Cách worker gọi agent:**
- `claude` → `claude -p "<prompt>"`
- `codex` → `codex exec --task "<prompt>"`
- Khác → `<agent> "<prompt>"`

## Git Worktree

Khi các worker có thể chỉnh sửa cùng file, bật `gitWorktree: true` để tạo nhánh riêng cho mỗi worker:

```json
{
  "name": "big-feature",
  "gitWorktree": true,
  "workers": [
    { "name": "auth", "prompt": "Implement auth module" },
    { "name": "billing", "prompt": "Implement billing module" }
  ]
}
```

ldmux sẽ tự động:
1. Tạo branch `ldmux/big-feature/auth` và `ldmux/big-feature/billing`
2. Tạo worktree riêng cho mỗi branch
3. Chạy agent trong worktree tương ứng

Sau khi xong, merge bằng git:

```powershell
git merge ldmux/big-feature/auth
git merge ldmux/big-feature/billing
```

## Các mẫu quy trình (Workflow Patterns)

### Pattern 1: Nghiên cứu + Triển khai

```json
{
  "name": "research-implement",
  "workers": [
    { "name": "research", "prompt": "Research best practices for rate limiting in Node.js. Write findings to /tmp/research.md" },
    { "name": "implement", "prompt": "Implement rate limiting middleware for Express API" }
  ]
}
```

### Pattern 2: Test + Fix

```json
{
  "name": "test-fix",
  "workers": [
    { "name": "tester", "prompt": "Run the test suite and summarize all failures" },
    { "name": "fixer", "prompt": "Fix the failing tests in src/api/" }
  ]
}
```

### Pattern 3: Code Review song song

```json
{
  "name": "review-pipeline",
  "workers": [
    { "name": "security", "prompt": "Review src/api/ for security vulnerabilities" },
    { "name": "performance", "prompt": "Review src/api/ for performance issues" },
    { "name": "coverage", "prompt": "Review src/api/ for test coverage gaps" }
  ]
}
```

## Cấu trúc thư mục `.ldmux/`

Khi chạy, ldmux tạo thư mục sau trong project:

```
.ldmux/
├── merged-output.md              # Tạo bởi `ldmux merge`
└── workers/
    └── <worker-name>/
        ├── task.md               # Prompt đã gửi cho agent
        ├── status.json           # { name, status, pid, startedAt, finishedAt, error? }
        └── output.log            # stdout + stderr của agent
```

Thư mục `.ldmux/` đã có trong `.gitignore` nên không bị commit lên repo.

**Giao thức IPC:** CLI và GUI không giao tiếp trực tiếp với nhau — cả 2 đều đọc/ghi thư mục này. Nhờ vậy không cần daemon, không có state trong memory, và bạn có thể đóng cửa CLI bất cứ lúc nào mà worker background vẫn chạy tiếp.

## Lưu ý quan trọng

1. **Chỉ chạy song song các task độc lập** — không chia task có phụ thuộc lẫn nhau (worker A cần kết quả worker B thì phải chạy tuần tự).
2. **Mỗi pane làm việc trên file riêng** — tránh xung đột khi 2 worker cùng ghi 1 file.
3. **Giữ số pane dưới 5-6** — mỗi pane tiêu tốn API token và RAM riêng.
4. **Kiểm tra output trước khi merge** — tránh merge code lỗi; dùng `ldmux list` xem có worker nào `error` không.
5. **Dùng git worktree** khi các worker có thể chỉnh sửa cùng file — mỗi worker có branch riêng, merge bằng `git merge` sau.
6. **Worker name phải duy nhất** — chạy 2 lần cùng tên sẽ ghi đè status của lần trước.
7. **Khi dừng CLI, tiến trình background vẫn tiếp tục** — muốn dừng hãy gõ `ldmux` qua web GUI hoặc `ldmux clean` rồi chạy lại.

## Xử lý sự cố

| Vấn đề | Giải pháp |
|--------|-----------|
| `wt` không tìm thấy | Cài Windows Terminal từ Microsoft Store |
| `claude` không tìm thấy | Cài Claude Code CLI: `npm install -g @anthropic-ai/claude-code` |
| `ldmux` không tìm thấy | Chưa chạy `npm link`, hoặc thư mục npm global chưa có trong PATH (kiểm tra: `npm config get prefix`) |
| Worker không phản hồi | Chạy `ldmux list` để kiểm tra status, hoặc `ldmux clean` rồi chạy lại |
| Port 3700 đã dùng | Sửa hằng số `PORT` trong `src/gui/server.ts` và build lại |
| Permission denied khi tạo worktree | Kiểm tra quyền git và thư mục hiện tại |
| Pane không mở trên Mac/Linux | Đúng — `wt` chỉ có trên Windows. Dùng `ldmux run plan.json --no-pane` và xem output qua `ldmux gui` |
| Sửa code TS xong không thấy cập nhật | Quên chạy `npm run build` — lệnh `ldmux` toàn cục trỏ tới `dist/` chứ không phải `src/` |

## Persistent Agents + MCP (Layer 2)

Ngoài batch workers (one-shot), ldmux hỗ trợ **persistent agents** — mỗi agent là một conversation claude giữ qua session, có thể hỏi-đáp nhiều lần, nhớ context. Các agent lưu tại `<ldmux-install>/.ldmux/workers/` — **ngay bên trong thư mục ldmux đã cài**, sống sót qua `npm run build` (build chỉ ghi `dist/`), chỉ bị xoá khi bạn xoá thủ công hoặc `rm -rf .ldmux/` trong folder ldmux.

### Tạo và dùng agent qua CLI

```bash
# 1. Tạo agent mới (interactive wizard)
ldmux create
#   - Name:  backend-expert
#   - Soul:  "You are a pragmatic backend architect..."
#   - Skill: "Java Spring, PostgreSQL"
#   - Cwd, Model: optional

# 2. Hỏi agent
ldmux ask backend-expert "how does JWT validation work?"

# 3. Chat REPL
ldmux chat backend-expert
#   You > ...
#   /history   -> xem lịch sử
#   /session   -> xem session info
#   /exit      -> thoát

# 4. Quản lý
ldmux agents                # liệt kê tất cả agent + session stats
ldmux edit backend-expert   # đổi soul/skill/model (sẽ hỏi reset nếu soul/skill đổi)
ldmux reset backend-expert  # xóa session + history, giữ nguyên soul/skill
```

**Lưu ý:** `--system-prompt` của claude chỉ gắn vào conversation khi tạo session. Nếu đổi soul/skill mà muốn hiệu lực, phải `ldmux reset` để tạo session mới.

### Tích hợp với Claude Code qua MCP

ldmux expose MCP stdio server với 4 tool: `list_agents`, `ask_agent`, `get_agent_history`, `create_agent`. Parent Claude Code sẽ thấy các tool này như tool thuần và tự gọi khi cần.

**Bước 1** — Tạo file MCP config (hoặc thêm vào `~/.claude.json` > `mcpServers`):

```json
{
  "mcpServers": {
    "ldmux": {
      "command": "ldmux",
      "args": ["mcp"]
    }
  }
}
```

Nếu chưa `npm link`, dùng full path:

```json
{
  "mcpServers": {
    "ldmux": {
      "command": "node",
      "args": ["/abs/path/to/ldmux/dist/index.js", "mcp"]
    }
  }
}
```

**Bước 2** — Khởi động Claude Code với MCP config:

```bash
# Dùng file config riêng
claude --mcp-config /path/to/ldmux-mcp.json

# Hoặc nếu đã thêm vào ~/.claude.json thì chỉ cần
claude
```

**Bước 3** — Parent Claude tự động có các tool `mcp__ldmux__list_agents`, `mcp__ldmux__ask_agent`, ... Bật allowed tools bằng setting trong `~/.claude/settings.json`:

```json
{
  "allowedTools": ["mcp__ldmux"]
}
```

Hoặc chạy 1 lần với flag:

```bash
claude --allowedTools "mcp__ldmux" --permission-mode dontAsk
```

### Ví dụ use case

Bạn đang làm frontend trong `/repo/fe`. Parent Claude cần biết auth flow của backend.

```
User  : "How does the backend validate my JWT?"
Parent: [calls list_agents] -> sees backend-expert with skill "Spring Boot, OAuth"
Parent: [calls ask_agent(backend-expert, "explain JWT validation flow")]
Agent : <answer từ backend-expert, dùng cwd=/repo/be của chính nó>
Parent: [tổng hợp answer + implement trên frontend]
```

Luồng này điểm khác biệt so với mở cửa sổ claude thứ 2 thủ công: parent tự quyết định gọi, tự tổng hợp, conversation giữa user và parent không bị gián đoạn.

### MCP tools reference

| Tool | Input | Output |
|------|-------|--------|
| `list_agents` | (none) | JSON array: name, soul, skill, cwd, model, status, turns, totalCostUsd |
| `ask_agent` | `name`, `question` | Agent's answer + session meta |
| `get_agent_history` | `name`, `limit?` | JSONL: role, content, timestamp, durationMs, costUsd |
| `create_agent` | `name`, `soul?`, `skill?`, `cwd?`, `model?`, `overwrite?` | Created config |

### Cấu trúc file agent

```
<ldmux-install>/.ldmux/workers/<agent-name>/
├── agent.json      # { name, soul, skill, cwd, model, createdAt }
├── session.json    # { sessionId, turns, totalCostUsd, lastActiveAt }
├── status.json     # sleep | running | waiting | done | error
├── history.jsonl   # mỗi dòng = 1 turn (user/assistant)
└── output.log      # raw JSON output của claude mỗi lần ask (debug)
```

## License

MIT
