# StoryNote

A Windows desktop note-taking app for fast, organized, and secure personal note management.

## Developer Installation Guide

### Prerequisites

- Windows
- [Node.js](https://nodejs.org/) v22 or later
- [Git](https://git-scm.com/)

> `better-sqlite3-multiple-ciphers` requires Node ≥22 and will fail to build/run on older versions.

### Setup

```bash
git clone https://github.com/PiemEscy/story-note.git
cd story-note
npm install
```

`npm install` triggers `postinstall` (`electron-builder install-app-deps`), which rebuilds native modules against Electron's ABI.

### Run in development

```bash
npm run dev
```

### Build

```bash
npm run build       # typecheck + electron-vite build
npm run build:win   # build + package a Windows installer
```

### Test

```bash
npm run lint
npm run typecheck
npm run test         # Vitest (unit/component)
npm run test:e2e     # Playwright (builds first)
```

### Notes

- No backend, no cloud sync — all data is stored locally in an encrypted SQLite database.
- AI features are optional and require your own Anthropic API key, entered in-app and stored via the OS credential manager (no `.env` file needed).
