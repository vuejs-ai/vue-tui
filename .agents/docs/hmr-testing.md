# Testing the dev server and HMR

This record defines the evidence required for [the dev-server architecture](./hmr-architecture.md). Exact fixture names, event encodings, and harness implementation belong beside the suites under `tests/vite` rather than in PCR.

## Evidence model

An HMR system claim usually crosses Vite, a Vue compiler, Runtime, process lifecycle, and a physical terminal. No single observation proves all of those layers.

Use three independent channels:

| Channel                                     | Proves                                                                                                       | Does not prove alone                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Structured test events                      | Which application version mounted, whether a component instance survived, which lifecycle or update path ran | What the user actually saw or whether terminal controls were restored |
| Emulated terminal screen and raw PTY output | Visible Inline or Fullscreen result, alternate-screen transitions, cursor and cleanup behavior               | Internal component identity or update classification                  |
| Child-process result and stderr             | Startup failure, fatal exit, fallback logging, and absence of duplicate process-level reports                | A successful in-place HMR transition                                  |

Assert the channel that owns the claim. Do not infer component identity from screen text or infer terminal restoration from a structured event.

## System-test boundary

Dev-server end-to-end tests launch the real published-style plugin path in a child attached to a PTY. The child runs Vite and the vue-tui application in their production one-process topology. The parent edits fixture files, observes named events, reads the terminal through the emulator, and owns timeout and cleanup.

The PTY is required for claims about TTY detection, Inline history, alternate-screen ownership, cursor state, resize, console coordination, and restoration. A pipe-only child can cover transform or process behavior but cannot prove those terminal contracts.

Tests use forced color only when the diagnostic styling itself is under test. They otherwise model the same public color request and terminal capability as a real consumer and do not inherit ambient worker color variables.

## Waiting and causality

Wait for a named causal event before asserting a resulting screen:

1. establish the baseline application version and visible frame;
2. perform one source edit;
3. wait for the event that proves the update, reload, or failure path completed;
4. then assert the screen, output, or process result owned by the claim.

Do not sleep for an assumed HMR duration or treat an arbitrary output substring as proof that the intended update path ran. One test should exercise one primary transition so a failure identifies the broken boundary.

## Required journeys

The system suite keeps focused coverage for:

- SFC template edits preserving the component instance;
- SFC script edits and JSX edits recreating it;
- accepted hot updates versus full reload;
- compile, transform, evaluation, and accept-callback failures;
- dev-overlay recovery without unmounting the user root;
- Inline and Fullscreen error presentation and output ownership;
- terminal release and reacquisition during configuration restart;
- concurrent-server rejection and ownership handoff;
- clean shutdown and fatal restoration.

Each claim should be covered in both rendering modes when the screen model can change the observable result. Shared architecture does not excuse testing only one mode.

## Test layering

- Pure option validation, peer-version checks, event normalization, and ownership primitives stay package-local unit tests.
- Compiler/plugin integration that does not require a terminal stays package integration coverage.
- Cross-package update, process, screen, or restoration behavior belongs in `tests/vite`.
- Runtime rendering-mode behavior that does not depend on Vite stays in Runtime deterministic or PTY suites instead of being duplicated here.

## Packed starter

The isolated starter smoke installs packed first-party packages into a clean temporary consumer and exercises both development startup and production build. It proves published exports, dependency metadata, compiler pairing, and the documented setup without workspace source imports.

The starter is not a second HMR matrix. It covers one representative happy path; focused repository suites own failure seams and mode-specific behavior.

## Platform boundary

Run terminal-system journeys on platforms where the PTY harness and signal behavior are supported. Platform-specific skips must name the unavailable capability. Cross-platform pure plugin and build behavior remains covered outside the PTY-only layer.
