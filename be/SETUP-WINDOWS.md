# Hướng dẫn cài đặt & chạy ldmux BE trên Windows

Tài liệu này hướng dẫn từ con số 0 trên Windows 10/11. Dự án đã tách thành 2 repo — phần **BE** (repo này) chạy Express + CLI; phần **FE** (repo `ldmux-fe`) là dashboard React. Bạn cần clone cả 2 và để **sibling** (cùng cha), không có gì phải cấu hình thêm.

---

## ⚠️ Đọc trước — các ổ gà thường gặp trên Windows

- **PowerShell chặn chạy script.** Lần đầu bật `npm` trong PowerShell có thể báo `npm.ps1 cannot be loaded because running scripts is disabled on this system`. Mở PowerShell **as Administrator** một lần, chạy:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```
  Xong đóng, mở lại PowerShell thường.
- **Tránh path có dấu cách và tiếng Việt.** Dùng `D:\work\ldmux\` chứ đừng dùng `D:\Tài liệu\...`. Node/npm xử lý được, nhưng vài npm script nội bộ vẫn hay vấp.
- **Lệnh `ldmux run` mở panes chỉ chạy được bên trong Windows Terminal.** Nếu bạn mở PowerShell từ Start Menu (không phải từ tab trong Windows Terminal), `wt -w 0 sp` không split được. Luôn mở **Windows Terminal → tab PowerShell** rồi mới chạy.
- **Claude Code CLI trên máy enterprise:** `npm install -g @anthropic-ai/claude-code` cần quyền global. Nếu IT chặn, hỏi IT đã cài sẵn chưa (chạy `where.exe claude`) — thường đã có.
- **Nếu bạn giao guide này cho Claude Code chạy:** có mấy bước **Claude không tự làm được**, phải tự tay:
  - `claude login` — mở browser OAuth (Claude Code không điều khiển được browser login flow).
  - `npm link` — đôi khi đòi quyền admin tùy cấu hình npm prefix.
  - Bất kỳ bước nào cần khởi động lại PowerShell sau khi đổi ExecutionPolicy/PATH.

  Trong Claude Code, để chạy thủ công mà vẫn thấy output trong conversation, gõ `! <lệnh>` (có dấu cách sau `!`). Ví dụ: `! claude login`.

  **Lệnh long-running** (`npm run dev`, `vite`, `node release\index.js gui`) — nhắc Claude chạy ở **background** (tool có flag `run_in_background`) và đọc output bằng `Monitor`/`Read`. Nếu Claude chạy foreground, conversation sẽ treo đến khi bạn Ctrl+C, rất khó chịu. Dặn Claude đại loại: *"chạy `npm run dev` background rồi curl localhost:3700 để kiểm tra"*.

- **Windows Defender quét real-time làm `npm install` chậm gấp 3–5 lần.** `node_modules` có hàng chục nghìn file nhỏ, Defender quét từng cái. Nếu máy cá nhân, thêm exclusion:
  ```powershell
  Add-MpPreference -ExclusionPath "D:\work\ldmux"
  ```
  (chạy as Administrator). Máy enterprise thì không đụng được Defender — chấp nhận chậm.

- **Git line-endings.** Git trên Windows mặc định convert LF ↔ CRLF khi checkout. Với repo này hiện không có shebang script nên không vấn đề, nhưng nếu sau này build ra file shell, đặt trong repo 1 file `.gitattributes`:
  ```
  * text=auto eol=lf
  *.ps1 text eol=crlf
  *.cmd text eol=crlf
  ```
  Hoặc 1 lần / máy: `git config --global core.autocrlf input`.

---

## 1. Chuẩn bị máy (1 lần / máy)

| Thành phần | Bắt buộc? | Cài thế nào |
|---|---|---|
| **Windows Terminal** | ✔ (để lệnh `ldmux run` mở panes) | Mặc định có trên Win 11. Win 10: Microsoft Store → "Windows Terminal" |
| **Node.js ≥ 18** | ✔ | <https://nodejs.org/> → LTS (.msi installer). Sau khi cài, mở PowerShell và chạy `node -v`, `npm -v` để kiểm tra |
| **Git for Windows** | ✔ | <https://git-scm.com/download/win>. Cài mặc định là đủ |
| **Claude Code CLI** | ✔ (để agent thật chạy) | `npm install -g @anthropic-ai/claude-code` → rồi `claude login` |
| **PowerShell 7** (khuyên dùng) | ✘ (PowerShell 5 sẵn có cũng được) | `winget install Microsoft.PowerShell` |

> Nếu máy công ty **không cho cài npm global**, xem mục **6 — Offline / Enterprise** cuối file.

---

## 2. Clone 2 repo theo đúng layout

Mở PowerShell, chọn một thư mục gốc (ví dụ `D:\work\`), rồi:

```powershell
cd D:\work
mkdir ldmux
cd ldmux
git clone https://github.com/GiaTrong2003/tmux-clone-for-enterprise-machine.git be
git clone https://github.com/GiaTrong2003/ldmux-fe.git web
```

Kiểm tra:

```powershell
D:\work\ldmux> dir
    Mode  ...    Name
    d---- ...    be
    d---- ...    web
```

**Bắt buộc đúng tên 2 thư mục `be` và `web`** — script build ở cả 2 bên đều tham chiếu đường dẫn tương đối (`cd ..\web`, `outDir: ../be/src/gui/public`).

---

## 3. Cài dependencies (1 lần / máy)

Trong PowerShell, từ `D:\work\ldmux\be`:

```powershell
npm install                 # BE dependencies
npm run web:install         # Tương đương cd ..\web && npm install
```

Kiểm tra:

```powershell
dir node_modules\express    # nên thấy được (BE OK)
dir ..\web\node_modules\vite # FE OK
```

---

## 4. Chạy dev (2 cửa sổ PowerShell)

### Cửa sổ #1 — Backend (port 3700)

```powershell
cd D:\work\ldmux\be
npm run dev
```

Khi thấy box **"ldmux - Web Dashboard — http://localhost:3700"** là BE đã chạy. BE đang serve file FE đã-build-sẵn từ `src/gui/public/` — mở thẳng trình duyệt vào http://localhost:3700 là thấy dashboard.

### Cửa sổ #2 — Frontend dev server (nếu muốn hot-reload FE)

```powershell
cd D:\work\ldmux\web
npm run dev
```

Vite chạy ở **http://localhost:5173** và tự proxy `/api/*` sang :3700. Sửa file trong `web\src\` là trình duyệt reload liền. Khi nào vừa ý thì build FE để BE serve bản tĩnh (xem mục 5).

> **Không có cửa sổ #2 vẫn dùng được.** BE đã có bản FE build sẵn trong `be\src\gui\public\`. Chỉ mở cửa sổ #2 khi bạn đang sửa code FE.

---

## 5. Build production / phân phối

### 5a. Build thường (output = `dist/`)

```powershell
cd D:\work\ldmux\be
npm run build:all         # build FE (sang be\src\gui\public\) + BE (sang be\dist\)
node dist\index.js gui    # chạy thử
```

### 5b. Build bundle (output = `release/`, zero runtime deps)

Khuyên dùng khi mang đi máy khác — chỉ cần 1 file JS + folder static, không cần `node_modules`:

```powershell
cd D:\work\ldmux\be
npm run build:bundle
```

Kết quả:

```
be\release\
  index.js          # 1.4MB — inline toàn bộ express, chalk, chokidar...
  public\           # FE static
```

Test:

```powershell
node release\index.js gui
```

Zip `release\` lại mang đi đâu cũng chạy được, miễn có **Node.js ≥ 18** trên máy đích.

---

## 6. Offline / Enterprise machine (không cài được npm global)

Kịch bản: máy cty không cho cài package toàn cục, không truy cập npm registry.

1. **Ở nhà:** clone + `npm install` + `npm run build:bundle`.
2. Zip folder `be\release\` (khoảng 5MB).
3. Copy file zip lên máy cty (USB / OneDrive / SharePoint — miễn không qua registry).
4. **Ở máy cty:** giải nén → `node release\index.js gui`.

Xong. Không cần FE repo, không cần npm install, không cần internet. Giới hạn duy nhất: cần Node.js trên máy cty (nếu cty không cho cài Node, bạn có thể dùng Node portable — tải ZIP từ nodejs.org, giải nén, chạy `node.exe` trực tiếp).

Nếu bạn muốn sửa/rebuild tại máy cty (hiếm), xem thêm README.md cũ ở phần "Cách 2: Máy không có npm" — zip `node_modules` của BE (**không phải** của FE) kèm theo.

---

## 7. Dùng `ldmux` như lệnh global (tuỳ chọn)

```powershell
cd D:\work\ldmux\be
npm run build
npm link                        # đăng ký lệnh `ldmux` toàn máy
```

Sau đó gõ `ldmux gui`, `ldmux list`, `ldmux run plan.json` ở **bất kỳ thư mục project nào** — `.ldmux\workers\` sẽ được tạo ngay tại thư mục đó.

Gỡ: `npm unlink -g ldmux`.

---

## 8. Các lệnh hay dùng

Tất cả chạy trong `D:\work\ldmux\be`:

| Mục đích | Lệnh |
|---|---|
| Mở dashboard web | `npm run dev` |
| Tạo 1 worker | `npx ts-node src/index.ts new "fix bug X" --name bug-x` |
| Liệt kê worker | `npx ts-node src/index.ts list` |
| Chạy plan nhiều worker | `npx ts-node src/index.ts run plan.json` |
| Merge output | `npx ts-node src/index.ts merge` |
| Khởi tạo company agents | `npx ts-node src/index.ts company init` |

Sau khi `npm link` (mục 7), thay `npx ts-node src/index.ts` bằng `ldmux`.

---

## 9. Troubleshooting

| Lỗi | Nguyên nhân | Khắc phục |
|---|---|---|
| `'wt' is not recognized` | Chưa có Windows Terminal | Cài từ Microsoft Store. Hoặc chạy `ldmux run plan.json --no-pane` (chỉ background, không mở panes) |
| `'claude' is not recognized` | Chưa cài Claude Code CLI | `where.exe claude` — nếu không ra gì: máy cá nhân chạy `npm install -g @anthropic-ai/claude-code && claude login`; máy enterprise hỏi IT vì có thể chặn npm global |
| `EADDRINUSE :3700` | Port 3700 đang bị chiếm | **Đừng** stop tất cả node — có thể dính VS Code/Claude Code. Tìm đúng PID: `netstat -ano \| findstr :3700`, rồi `Stop-Process -Id <pid>`. Hoặc đổi `PORT` trong `src\gui\server.ts` |
| `Set-ExecutionPolicy` / `npm.ps1 cannot be loaded` | PowerShell khóa script | Xem mục "Đọc trước" ở đầu file |
| `ldmux run` không mở pane dù đã có Windows Terminal | Đang chạy trong PowerShell Start-Menu, không phải tab trong Windows Terminal | Mở Windows Terminal → tab PowerShell → chạy lại |
| `ENOENT ..\web` khi `npm run web:build` | Thiếu repo FE sibling | Clone `ldmux-fe` thành folder `web` như ở mục 2 |
| Vite dev không thấy API | BE chưa chạy | Bật cửa sổ #1 trước, rồi mới `npm run dev` bên `web` |
| Build FE ghi sai chỗ | Bạn đổi tên folder BE khác `be` | Đổi lại thành `be` hoặc sửa `outDir` trong `web\vite.config.ts` |
| Sửa `src\*.ts` xong `ldmux` không đổi | Lệnh `ldmux` toàn cục trỏ `dist\` | Chạy `npm run build` lại (không cần `npm link` lại) |
| Agent báo "autonomous loop" / không trả lời | Chưa `claude login` | `claude login` rồi thử lại |

---

## 10. Tóm tắt flow nhanh

```powershell
# 1 lần / máy
git clone ...tmux-clone-for-enterprise-machine.git be
git clone ...ldmux-fe.git web
cd be
npm install
npm run web:install

# mỗi ngày
npm run dev     # (+ mở http://localhost:3700)

# khi muốn hot-reload FE
# mở tab khác: cd ..\web && npm run dev  → http://localhost:5173

# khi cần mang đi máy khác
npm run build:bundle
# → zip be\release\ → copy → node release\index.js gui
```
