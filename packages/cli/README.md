# @vue-tui/cli

> **Early stage** — under active development. Bug reports welcome, but not recommended for production use yet.

Development server for vue-tui — Vite-powered HMR for Vue 3 terminal apps.

[![npm version](https://img.shields.io/npm/v/@vue-tui/cli?color=%2342b883)](https://www.npmjs.com/package/@vue-tui/cli)
[![npm downloads](https://img.shields.io/npm/dm/@vue-tui/cli)](https://www.npmjs.com/package/@vue-tui/cli)

## Why

- **Terminal HMR** — edit a `.vue` file, see the terminal update instantly
- **Works with your Vite config** — just run `vue-tui dev` in a project with `index.html` and your existing Vite plugins
- **Crash recovery** — auto-restarts the process after a crash

Built on Vite's `bundledDev` mode. Bundles your vue-tui app into a single Node.js process with hot module replacement — the same edit-save-see loop you get with Vite on the web, but for TUI development.

## Install

```bash
npm install -D @vue-tui/cli
```

## Usage

```bash
vue-tui dev
```

Starts a Vite dev server in `bundledDev` mode, builds your app, and runs it in a managed child process. Most file changes are applied via HMR; changes that require a full reload restart the process automatically.

### package.json script

```json
{
  "scripts": {
    "dev": "vue-tui dev"
  }
}
```

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui) — monorepo root
- [`@vue-tui/runtime`](https://www.npmjs.com/package/@vue-tui/runtime) — the core framework
- [`@vue-tui/testing`](https://www.npmjs.com/package/@vue-tui/testing) — test harness for terminal components

## License

MIT
