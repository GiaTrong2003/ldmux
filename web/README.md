# ldmux-fe

Frontend (Vite + React + TypeScript) for [ldmux](https://github.com/GiaTrong2003/tmux-clone-for-enterprise-machine).

> 👉 **Hướng dẫn chi tiết cho Windows:** xem [`SETUP-WINDOWS.md`](./SETUP-WINDOWS.md).

## Layout

This repo is the FE half of ldmux. Check it out as a sibling of the BE repo:

```
ldmux/
  be/   ← https://github.com/GiaTrong2003/tmux-clone-for-enterprise-machine
  web/  ← this repo
```

The Vite build writes static assets into `../be/src/gui/public/`, which the Express backend serves directly.

## Dev

```bash
npm install
npm run dev    # Vite on :5173, /api proxied to :3700
```

Run the BE backend in the sibling folder: `cd ../be && npm run dev`.

## Build

```bash
npm run build  # outputs to ../be/src/gui/public/
```
