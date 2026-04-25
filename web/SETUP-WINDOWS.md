# Hướng dẫn cài đặt & chạy ldmux FE trên Windows

Repo này là **frontend** (Vite + React + TypeScript) của ldmux. Dashboard dùng React Flow v12 để vẽ Company org-chart. Repo BE chạy Express ở cổng 3700; khi build, FE output được ghi thẳng vào `..\be\src\gui\public\` để Express serve.

> **Chỉ riêng repo này không chạy được dashboard thật** — bạn cần BE để có API. Repo BE: <https://github.com/GiaTrong2003/tmux-clone-for-enterprise-machine>.

---

## ⚠️ Đọc trước — ổ gà Windows

- **PowerShell khóa script.** Nếu `npm` báo `npm.ps1 cannot be loaded because running scripts is disabled`, mở PowerShell **as Administrator** chạy 1 lần:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```
- **Path nên không có dấu cách và tiếng Việt.** Dùng `D:\work\ldmux\` thay vì `D:\Tài liệu\...`.
- **Repo này không tự chạy được** — phải có BE (repo `tmux-clone-for-enterprise-machine`) đặt sibling ở folder tên `be`. Xem mục 2.
- **Nếu giao guide cho Claude Code chạy:** các bước thuần `npm install` Claude tự chạy được. Riêng `npm run dev` là long-running — dặn Claude chạy **background** (`run_in_background: true`) rồi kiểm tra bằng curl/fetch, tránh Claude block conversation cho đến khi bạn Ctrl+C.
- **Windows Defender làm `npm install` chậm 3–5 lần.** Máy cá nhân có thể thêm exclusion:
  ```powershell
  Add-MpPreference -ExclusionPath "D:\work\ldmux"
  ```
  (as Administrator). Máy enterprise thì bỏ qua.

---

## 1. Chuẩn bị

| Thành phần | Cài thế nào |
|---|---|
| **Node.js ≥ 18** | <https://nodejs.org/> → LTS (.msi). Kiểm tra: `node -v`, `npm -v` |
| **Git for Windows** | <https://git-scm.com/download/win> |
| **VS Code** (khuyên dùng) | <https://code.visualstudio.com/>. Extension hữu ích: ESLint, Prettier, Vitest |

---

## 2. Layout bắt buộc — 2 repo là sibling

Vite build ghi output ra `..\be\src\gui\public\` (xem `vite.config.ts`), nên 2 repo phải đặt cạnh nhau:

```
D:\work\ldmux\
    be\      ← clone ldmux BE vào đây
    web\     ← clone repo NÀY vào đây
```

Clone đủ 2:

```powershell
cd D:\work
mkdir ldmux; cd ldmux
git clone https://github.com/GiaTrong2003/tmux-clone-for-enterprise-machine.git be
git clone https://github.com/GiaTrong2003/ldmux-fe.git web
```

Nếu bạn đặt tên folder khác `be`, phải sửa dòng `outDir` trong `web\vite.config.ts`:

```ts
outDir: path.resolve(__dirname, '../<ten-folder-be>/src/gui/public'),
```

---

## 3. Cài dependencies

```powershell
cd D:\work\ldmux\web
npm install
```

Mất 1-2 phút. Sinh ra `node_modules\` (~80MB) — đã có `.gitignore` chặn rồi.

---

## 4. Chạy dev

Cần **BE chạy trước** (nó cung cấp `/api`). Dùng 2 cửa sổ PowerShell:

### Cửa sổ #1 — BE

```powershell
cd D:\work\ldmux\be
npm run dev                        # Express :3700
```

### Cửa sổ #2 — FE (hot-reload)

```powershell
cd D:\work\ldmux\web
npm run dev                        # Vite :5173
```

Mở trình duyệt: **http://localhost:5173**. Vite tự proxy `/api/*` sang :3700. Sửa file trong `src\` → trình duyệt reload ngay.

> Muốn chỉ xem dashboard mà **không sửa FE**? Khỏi chạy cửa sổ #2 — BE đã serve sẵn bản build trước ở http://localhost:3700.

---

## 5. Build production

```powershell
cd D:\work\ldmux\web
npm run build
```

Vite sẽ:
1. Chạy `tsc --noEmit` kiểm type.
2. Build + minify → ghi vào `..\be\src\gui\public\` (xóa nội dung cũ trước khi ghi).

Kiểm tra:

```powershell
dir ..\be\src\gui\public
    index.html
    assets\
        index-<hash>.js
        index-<hash>.css
```

Sau đó qua bên `be`, chạy `npm run dev` hoặc `npm run build:bundle` — BE sẽ serve bản FE mới này.

---

## 6. Cấu trúc thư mục

```
web\
├── index.html                    # Vite entry HTML
├── vite.config.ts                # Proxy :5173→:3700, outDir → ..\be\src\gui\public
├── tsconfig.json
├── package.json
└── src\
    ├── main.tsx                  # React entry
    ├── App.tsx                   # Top-level layout + tab switcher
    ├── api\                      # fetch wrapper + endpoint clients
    │   ├── client.ts             # apiGet/apiPost/apiPatch/apiDelete
    │   ├── workers.ts
    │   ├── agents.ts
    │   └── company.ts
    ├── components\
    │   ├── workers\              # Tab "Workers"
    │   ├── live\                 # Tab "Live"
    │   ├── agents\               # Tab "Agents" (persistent agents)
    │   ├── company\              # Tab "Company" (org-chart React Flow)
    │   └── common\               # Modal, EmptyState, StatusDot...
    ├── hooks\
    │   ├── usePolling.ts         # Interval polling hook
    │   └── useTail.ts            # Incremental byte-offset tail
    ├── types\api.ts              # Mirror các interface từ BE (JSON = contract)
    ├── styles\tokens.css         # Design tokens (color/radius/space)
    └── utils\format.ts           # formatCost, formatDurationMs
```

---

## 7. Luồng công việc thường gặp

### Thêm một API endpoint mới
1. Bên `be`: thêm route trong `src\gui\server.ts`.
2. Bên `web`: thêm typed wrapper trong `src\api\<feature>.ts`, cập nhật `src\types\api.ts` cho giống interface của BE.
3. Gọi wrapper trong component (thường qua `usePolling`).

### Thêm một tab mới
1. Tạo folder `src\components\<tab>\` với `<Tab>Tab.tsx` làm entry.
2. Đăng ký trong `src\App.tsx` (mảng `TABS`).
3. Thêm icon/nhãn trong header tab nếu cần.

### Debug FE
- Vite HMR tự reload. Lỗi compile hiện ngay overlay đỏ trong trình duyệt.
- React DevTools: cài extension Chrome/Edge.
- Inspect request `/api/...` qua Network tab — 404/500 thường do BE chưa chạy hoặc endpoint chưa đúng.

---

## 8. Troubleshooting

| Lỗi | Nguyên nhân | Khắc phục |
|---|---|---|
| `Cannot find module '@xyflow/react'` | Chưa `npm install` | `npm install` lại |
| `ENOENT ..\be\src\gui\public` khi build | Folder `be` không tồn tại sibling | Clone BE repo, đúng tên `be`, hoặc sửa `outDir` trong `vite.config.ts` |
| Dashboard trắng, console báo 404 `/api/...` | BE chưa chạy | Bật `npm run dev` bên `be` trước |
| `EADDRINUSE :5173` | Port 5173 bị chiếm | Đóng Vite cũ, hoặc đổi `server.port` trong `vite.config.ts` |
| Proxy `/api` → `ECONNREFUSED` | BE chạy ở port khác | Sửa `server.proxy` trong `vite.config.ts` |
| Nút hay link không update khi sửa code | HMR bị gián đoạn | Ctrl+C Vite, `npm run dev` lại |
| `TS2307` thiếu type | `npm install` thiếu devDeps | Xóa `node_modules\ package-lock.json` rồi `npm install` lại |
| Build chậm / crash heap | Máy RAM thấp | `set NODE_OPTIONS=--max-old-space-size=4096` rồi `npm run build` |

---

## 9. Phân phối cùng BE

Người dùng cuối **không cần** repo FE này. Khi bạn `npm run build:bundle` ở `be`, BE sẽ:
1. Tự `cd ..\web && npm run build` (cần node_modules của FE có sẵn).
2. Sinh `be\release\` chứa sẵn cả bundle backend + FE static.

Zip `be\release\` → copy đi máy khác → `node release\index.js gui`. **Máy đích không cần npm, không cần FE repo, không cần internet.** Xem [`be/SETUP-WINDOWS.md`](https://github.com/GiaTrong2003/tmux-clone-for-enterprise-machine/blob/main/SETUP-WINDOWS.md) phần 6 để rõ hơn.

---

## 10. Tóm tắt flow nhanh

```powershell
# 1 lần / máy
cd D:\work
mkdir ldmux; cd ldmux
git clone ...tmux-clone-for-enterprise-machine.git be
git clone ...ldmux-fe.git web
cd web
npm install

# mỗi ngày
# Cửa sổ 1
cd D:\work\ldmux\be
npm run dev
# Cửa sổ 2
cd D:\work\ldmux\web
npm run dev
# → http://localhost:5173

# release FE cho BE serve
npm run build       # trong web\
```
