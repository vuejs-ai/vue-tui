# Dev-server and HMR architecture

This record defines how `@vue-tui/vite` runs a terminal application during development, how updates reach it, and how terminal ownership survives errors and reloads. Verification strategy lives in [hmr-testing.md](./hmr-testing.md); production rendering-mode behavior lives in [rendering-modes.md](./rendering-modes.md).

Compatibility is pinned exactly to Vite 8.2.1, `@vitejs/plugin-vue-jsx` 5.1.5, and `unplugin-vue` 7.2.0. Moving a pin requires rechecking compiler configuration, the module-runner HMR seams, real SFC and JSX updates, and the packed starter.

## Governing invariant

A terminal is one shared modal device. Raw input, alternate screen, cursor visibility, bracketed paste, and output bytes cannot be isolated between competing owners.

The dev architecture therefore has one rule: **one coordinated terminal writer at a time, with explicit acquisition and release points**. Compilation, module delivery, error presentation, reload, server replacement, and process exit must preserve that rule.

## Process model

The Vite server and the application run in the one Node process launched by the user. Vite watches and compiles; its module runner evaluates the application in memory; Runtime alone owns the terminal session.

There is no child application process or inherited terminal shared between parent and child. A child topology would leave Vite's TTY-aware shortcuts and diagnostics in one process while another process mutates the same terminal modes and paints the same screen.

## Lifetimes

Three lifetimes are sufficient:

| Lifetime                 | Owns                                                 | Replacement boundary                     |
| ------------------------ | ---------------------------------------------------- | ---------------------------------------- |
| Process terminal session | terminal modes, output coordination, input resources | mount, suspension, full reload, and exit |
| Runtime tree             | host nodes, Yoga layout, paint state, input dispatch | application mount and full reload        |
| Vue component instance   | component-local reactive state                       | Vue's own HMR decision                   |

**Ruling:** vue-tui follows Vue's HMR state semantics. An SFC template edit keeps the affected component instance and its local state. An SFC script edit recreates the affected component instance, and every JSX edit does the same because JSX has no separate template-only update. This is not a vue-tui gap; revisit it only if Vue changes these semantics or vue-tui diverges from them. [VOUCHED @hyfdev 2026-08-09]

There is no fourth Runtime layer that restores focus, scroll position, or arbitrary component state after Vue recreates an instance.

## Update and failure flow

| Stage                                                                           | Result                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source compilation, transform, fetch, or module evaluation fails                | The previous application remains mounted when one exists. The official dev overlay reports the failure through the current rendering mode; otherwise the designated Vite fallback logger reports it. |
| A hot update is accepted                                                        | Vue applies its ordinary template-rerender or component-reload semantics inside the existing Runtime session.                                                                                        |
| Otherwise-unhandled component setup or render fails in the official dev session | The dev-only Vue boundary keeps the user root mounted and presents the error so a later successful update can recover. User error boundaries retain priority.                                        |
| Event handler, watcher, or lifecycle callback fails                             | Vue and application error handling remain authoritative; the dev wrapper does not swallow unrelated failures.                                                                                        |
| Runtime output or an actively used stream fails                                 | Runtime follows its fatal path: release terminal ownership, settle with the cause, then report it.                                                                                                   |
| No module accepts the update                                                    | The plugin performs a full reload.                                                                                                                                                                   |

Compiler and evaluator errors are normalized for presentation without replacing the original thrown value used by the update machinery. One propagation chain produces one diagnostic.

## Full reload

A full reload releases the old terminal session and Runtime tree before clearing evaluated modules and importing the replacement application. The replacement then acquires a fresh session.

Nothing in the user tree crosses that boundary. Inline continues below history already delegated to the terminal; Fullscreen leaves and later reacquires the alternate screen. This complete release-and-reacquire cycle distinguishes full reload from an in-place hot update.

## Output ownership and server handoff

While a Runtime session exists, application and plugin diagnostics pass through its output coordinator. When no application session exists because entry evaluation failed, exactly one designated Vite error writer may use the terminal.

The process-wide dev ownership registry lives on `globalThis` so duplicate module URLs cannot create independent owners. A Vite configuration restart may create the incoming server before the outgoing server closes, so the registry supports a bounded serialized handoff. A genuinely concurrent second server does not receive the terminal and closes rather than retaining watchers or ports for an application it cannot mount.

Direct process-stream writes remain outside Runtime coordination. The invariant is coordinated ownership, not suppression of every diagnostic byte.

## Vite boundary

Vite supplies modules: it watches, compiles, evaluates, determines update reachability, and delivers updates. Runtime owns terminal and Vue application behavior.

Development uses Vite's server environment for Node resolution and the module runner. Vue SFC compilation uses `unplugin-vue` in its supported client-output mode. The JSX compiler lacks the same supported option, so the plugin supplies only the narrow client-mode adaptation needed by the pinned version. The plugin rejects incompatible compiler configuration and missing private HMR seams by named compatibility errors rather than guessing from generated code.

## Rejected topologies

- **Child application process:** creates two TTY-aware processes sharing one terminal and does not solve compiler or HMR transport issues.
- **Custom Vite client-consumer environment:** couples browser built-in resolution and websocket HMR transport to a process that needs Node built-ins and the runner channel.
- **Runtime-owned view-position restoration:** conflicts with Vue's component-recreation semantics and lacks stable identities for generic focus and scroll state.
- **Rollback to a previous module:** Vite and Vue mutate module/component records before an accept callback can provide a safe rollback, and module evaluation may already have side effects.
- **Freeze the last frame after failure:** leaves input, timers, and reactive state live behind stale output and is unsafe for stream failures that require terminal restoration.

## Evidence

Package tests pin supported peer versions and configuration failures. The system suites under [`tests/vite`](../../tests/vite) exercise real SFC and JSX compilation, hot updates, full reload, error recovery, ownership conflicts, and terminal restoration. The isolated packed starter verifies the published package path. Which evidence channel proves each claim is defined in [hmr-testing.md](./hmr-testing.md).
