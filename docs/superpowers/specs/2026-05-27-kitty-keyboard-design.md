# Kitty Keyboard Protocol Support

## Summary

Add full kitty keyboard protocol support to vue-tui, matching Ink's implementation. This covers three layers: protocol lifecycle (enable/disable/auto-detect), useInput Key interface extension, and comprehensive test backfill.

The kitty keyboard protocol is an opt-in terminal enhancement that provides disambiguated key events, additional modifiers (super, hyper, capsLock, numLock), event types (press/repeat/release), and text-as-codepoints fields. vue-tui already has the parsing layer (parse-keypress.ts) but lacks the terminal handshake and useInput integration.

Reference: https://sw.kovidgoyal.net/kitty/keyboard-protocol/

## Current State

| Layer | Status | Details |
|-------|--------|---------|
| Parsing (parse-keypress.ts) | Complete | Decodes CSI u sequences, kitty modifiers, event types, text-as-codepoints |
| useInput Key interface | Partial | Exposes ctrl/shift/meta but not super/hyper/capsLock/numLock/eventType |
| Protocol lifecycle | Missing | No enable/disable sequences, no auto-detect, no MountOptions field |
| Tests | 1 of ~85 | Only Ctrl+C via kitty codepoint-3 form exists |

## Architecture

### New file: `packages/runtime/src/io/kitty-keyboard.ts`

Self-contained module with types, constants, query/response matching, and lifecycle controller.

#### Types & Constants

```ts
export const kittyFlags = {
  disambiguateEscapeCodes: 1,
  reportEventTypes: 2,
  reportAlternateKeys: 4,
  reportAllKeysAsEscapeCodes: 8,
  reportAssociatedText: 16,
} as const;

export type KittyFlagName = keyof typeof kittyFlags;

export type KittyKeyboardOptions = {
  mode?: 'auto' | 'enabled' | 'disabled';
  flags?: KittyFlagName[];
};

export function resolveFlags(flags: KittyFlagName[]): number;
```

**Parser support note**: The current parse-keypress.ts parser fully supports `disambiguateEscapeCodes` (the default and most useful flag). The `reportEventTypes` flag is also supported (press/repeat/release). The `reportAlternateKeys`, `reportAllKeysAsEscapeCodes`, and `reportAssociatedText` flags are accepted in the options but the parser may not handle all edge forms they produce (e.g., colon-separated alternate key fields). These flags are exposed for forward compatibility but users should treat them as experimental until parser coverage is verified.

#### Query/Response Matching

Functions for detecting terminal responses to the `\x1b[?u` capability query:

- `matchKittyQueryResponse(buffer, startIndex)` — detects `\x1b[?<digits>u` pattern in a byte buffer. Returns `{state: 'complete', endIndex}` or `{state: 'partial'}` or `undefined`.
- `hasCompleteKittyQueryResponse(buffer)` — scans entire buffer for any complete response.
- `stripKittyQueryResponsesAndTrailingPartial(buffer)` — removes complete responses and trailing partial sequences, returns remaining bytes to re-emit to the input pipeline.

These operate on `number[]` byte buffers because terminal responses can arrive as raw bytes (Uint8Array) and may be interleaved with user input.

#### Lifecycle Controller

```ts
export function createKittyKeyboardController(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
): KittyKeyboardController;

interface KittyKeyboardController {
  init(options: KittyKeyboardOptions | undefined, interactive: boolean): void;
  dispose(): void;
  readonly isEnabled: boolean;
}
```

**init(options, interactive):**
1. If options not provided or `mode === 'disabled'` — no-op.
2. Resolve flags (default: `['disambiguateEscapeCodes']`).
3. `mode === 'enabled'` — force-enable if both stdin and stdout are TTYs. Write `\x1b[>${resolvedFlags}u`.
4. `mode === 'auto'` (default) — require `interactive === true` + both TTYs, then call `confirmKittySupport()`.

**confirmKittySupport():**
1. Create `responseBuffer: number[]`.
2. Attach `data` listener to stdin (before writing query, to catch sync responses).
3. Write `\x1b[?u` to stdout.
4. Set 200ms timeout.
5. On data: push bytes to buffer. If `hasCompleteKittyQueryResponse(buffer)` → cleanup + enable.
6. On timeout: cleanup only (no enable).
7. Cleanup: remove listener, clear timeout, strip query responses from buffer, re-emit remaining bytes via `stdin.unshift(Uint8Array.from(remaining))`.
8. Guard: don't enable if already disposed (handles unmount-during-detection race).

**dispose():**
1. Cancel in-progress detection (call stored cleanup function).
2. If protocol was enabled, write `\x1b[<u` to stdout (disable sequence).
3. Set enabled = false.

### Modified: `packages/runtime/src/render.ts`

**MountOptions** — add field:

```ts
kittyKeyboard?: KittyKeyboardOptions;
```

**mount()** — after `createStdinController()`:

```ts
const kittyController = createKittyKeyboardController(stdin, stdout);
kittyController.init(options.kittyKeyboard, interactive);
mountedKittyController = kittyController;
```

**teardown()** — after Vue unmount, before terminal restoration:

```ts
// In teardown(), after originalUnmount() and before writer.done() / cursor restore:
mountedKittyController?.dispose();
```

Order matches Ink: final render → restore console → React/Vue unmount → cancel kitty detection → disable kitty protocol → exit alt screen → restore cursor → done.

### Modified: `packages/runtime/src/composables/useInput.ts`

**Key interface** — add 5 fields:

```ts
export interface Key {
  // ... existing fields unchanged ...
  super: boolean;
  hyper: boolean;
  capsLock: boolean;
  numLock: boolean;
  eventType?: 'press' | 'repeat' | 'release';
}
```

**listener() function** — after building the Key object, add kitty modifier mapping:

```ts
const key: Key = {
  // ... existing fields ...
  super: keypress.super ?? false,
  hyper: keypress.hyper ?? false,
  capsLock: keypress.capsLock ?? false,
  numLock: keypress.numLock ?? false,
  eventType: keypress.eventType,
};
```

**Input string logic** — replace the current logic with kitty-aware branching (matching Ink):

```ts
let input: string;
if (keypress.isKittyProtocol) {
  if (keypress.isPrintable) {
    input = keypress.text ?? keypress.name;
  } else if (keypress.ctrl && keypress.name.length === 1) {
    input = keypress.name;
  } else {
    input = '';
  }
} else if (keypress.ctrl) {
  input = keypress.name ?? '';
} else {
  input = keypress.sequence;
}

if (!keypress.isKittyProtocol && nonAlphanumericKeys.includes(keypress.name)) {
  input = '';
}
```

The key change: when kitty protocol is active, non-printable keys (capslock, media keys, F13+, modifier-only keys) produce empty input instead of leaking raw escape sequences. The `nonAlphanumericKeys` filter only applies to legacy sequences.

### Exports

Re-export from package entry point:
- `KittyKeyboardOptions` type
- `KittyFlagName` type
- `kittyFlags` constant (matching Ink's exports)

## Escape Sequences Reference

| Purpose | Sequence | Example |
|---------|----------|---------|
| Query terminal support | `\x1b[?u` | Sent to stdout during auto-detect |
| Terminal response | `\x1b[?<flags>u` | `\x1b[?1u` — terminal supports disambiguate |
| Enable protocol | `\x1b[><flags>u` | `\x1b[>1u` — enable disambiguateEscapeCodes |
| Disable protocol | `\x1b[<u` | Sent on unmount/dispose |

## Test Suite

### File 1: `packages/runtime/tests/io/parse-keypress-kitty.test.ts` (~55 unit tests)

Tests kitty parsing in isolation — no rendering, no Vue. Each test calls `parseKeypress()` directly with a CSI u sequence and asserts the returned keypress object.

Helper function `kittyKey(codepoint, modifiers?, eventType?, textCodepoints?)` constructs CSI u sequences for testing.

**Basic character + modifier parsing (11 tests):**
- Simple character 'a' (`\x1b[97u`)
- Uppercase with shift (`\x1b[65;2u`)
- Ctrl modifier (`\x1b[97;5u`)
- Alt/option modifier (`\x1b[97;3u`)
- Super modifier (`\x1b[97;9u`)
- Hyper modifier (`\x1b[97;17u`)
- Meta modifier (`\x1b[97;33u`)
- Caps lock flag (`\x1b[97;65u`)
- Num lock flag (`\x1b[97;129u`)
- Combined: ctrl+shift (`\x1b[97;6u`)
- Combined: super+ctrl (`\x1b[97;13u`)

**Special keys (7 tests):**
- Escape (codepoint 27)
- Return/enter (codepoint 13)
- Tab (codepoint 9)
- Backspace (codepoint 8)
- Backspace (codepoint 127)
- Legacy meta+backspace (0x1b 0x7f)
- Space (codepoint 32)

**Event types (3 tests):**
- Press (eventType 1)
- Repeat (eventType 2)
- Release (eventType 3)

**Text & unicode (8 tests):**
- Number keys
- Special character (@)
- Ctrl+letter via codepoint 1-26
- Sequence and raw preservation
- Text-as-codepoints: single, multiple, supplementary unicode
- Text defaults to character from codepoint

**Arrow & function keys (5 tests):**
- Arrow keys with event type (CSI enhanced special key format)
- Arrow keys with modifiers
- Home and end keys
- Tilde-terminated special keys (delete, insert, pageup, f5)
- Tilde keys with modifiers

**Error handling (4 tests):**
- Invalid codepoint above U+10FFFF → safe empty keypress
- Surrogate codepoint → safe empty keypress
- Invalid text codepoint → replaced with '?'
- Malformed modifier 0 → does not set all flags

**Legacy fallback (2 tests):**
- Non-kitty sequences fall back to legacy parsing
- Ctrl+c legacy fallback

**isPrintable field (11 tests):**
- True for: regular chars, digits, symbols, emoji, return, space
- False for: escape, tab, backspace, ctrl+letter, special keys (arrows)

**Non-printable key suppression (10 tests):**
- Capslock (57358), printscreen (57361), f13 (57376)
- Media key (57428 mediaplay)
- Modifier-only keys (57441 leftshift, 57442 leftcontrol)
- Keypad keys (57399 kp0)
- Scrolllock (57359), numlock (57360), pause (57362)
- Volume keys (lower, raise, mute)

### File 2: `packages/runtime-tests/integration/pty/input-kitty.test.ts` (~17 integration tests)

Tests useInput with kitty protocol sequences through the full PTY pipeline. Uses the same PTY test helper infrastructure as existing `input.test.ts`.

**Kitty modifiers through useInput (5 tests):**
- Super modifier → `input='s'`, `key.super=true`
- Hyper modifier → `input='h'`, `key.hyper=true`
- CapsLock → `key.capsLock=true`
- NumLock → `key.numLock=true`
- Super+ctrl → `input='s'`, `key.super=true`, `key.ctrl=true`

**Event types through useInput (3 tests):**
- Press → `key.eventType='press'`
- Repeat → `key.eventType='repeat'`
- Release → `key.eventType='release'`

**Special keys through useInput (3 tests):**
- Escape key → `key.escape=true`, empty input
- Backspace (codepoint 127) → `key.backspace=true`, empty input
- Delete → `key.delete=true`, empty input

**Non-printable keys produce empty input (3 tests):**
- Capslock (57358) → `input=''`
- F13 (57376) → `input=''`
- Printscreen (57361) → `input=''`

**Text input (3 tests):**
- Space → `input=' '`
- Return → `input='\r'`
- Ctrl+letter via codepoint 1-26 → `input='a'`, `key.ctrl=true`

### File 3: `packages/runtime-tests/integration/kitty-lifecycle.test.ts` (~22 integration tests)

Tests the protocol enable/disable/auto-detect flow. Uses fake stdin/stdout streams to verify escape sequences written.

**Init/cleanup (3 tests):**
- Writes enable sequence (`\x1b[>1u`) when `mode: 'enabled'` and both streams are TTY
- Writes disable sequence (`\x1b[<u`) on unmount
- Not enabled when stdin or stdout is not a TTY

**Auto-detection happy path (3 tests):**
- Auto detection enables protocol when terminal responds with `\x1b[?1u`
- Auto detection handles synchronous (immediate) query response
- Auto detection handles Uint8Array response

**Auto-detection edge cases (5 tests):**
- Does not enable protocol after unmount (race condition guard)
- Preserves split UTF-8 input bytes during detection (re-emitted via unshift)
- Timeout does not leak partial query response (`\x1b[?1` without terminator)
- Timeout preserves query prefix without digits (`\x1b[?` alone)
- Ignores response without digits (`\x1b[?u` — missing flags)

**Opt-in behavior (2 tests):**
- No-op when `kittyKeyboard` is absent from mount options (no sequences written)
- No-op when `kittyKeyboard: { mode: 'disabled' }` (no sequences written)

**Custom flags (2 tests):**
- Enabled mode with custom flags writes correct bitmask (e.g., `flags: ['disambiguateEscapeCodes', 'reportEventTypes']` → `\x1b[>3u`)
- Auto mode with custom flags passes them through to enable sequence

**Invalid response handling (3 tests):**
- Preserves invalid query-like escape sequence (wrong terminator)
- Non-query bytes interleaved with response are re-emitted
- Response `\x1b[?0u` (zero flags) — still treated as valid support confirmation

**Split response (1 test):**
- Query response split across two stdin data chunks — bytes reassembled correctly

**Late response after timeout (1 test):**
- Terminal responds after 200ms timeout — response bytes discarded, protocol not enabled

**End-to-end byte delivery (1 test):**
- User input during detection window is delivered to useInput exactly once after detection completes

## Implementation Notes

- The kitty-keyboard.ts `kittyModifiers` constant already exists in parse-keypress.ts. The new module only needs the flag constants and lifecycle logic; it imports nothing from parse-keypress.ts.
- The `isKittyProtocol`, `isPrintable`, `text`, `super`, `hyper`, `capsLock`, `numLock`, `eventType` fields are already set by `parseKittyKeypress()` in parse-keypress.ts. No changes needed to the parser.
- Auto-detect's stdin `data` listener is temporary (removed after detection completes or times out). It runs during the brief init window and is cleaned up before the main input pipeline processes events, so there's no conflict.
- The `stdin.unshift()` call to re-emit non-query bytes pushes them back to the front of the readable stream. This works because the kitty controller's listener is removed during cleanup, and the re-emitted bytes are picked up by the normal input pipeline (createStdinController's handleData) on the next read.
- **Risk**: attaching a `data` listener puts stdin into flowing mode. If user input arrives during the 200ms detection window, it goes into the response buffer but is NOT query-response data. The `stripKittyQueryResponsesAndTrailingPartial` function preserves these non-query bytes, and `unshift()` re-emits them. An end-to-end test must verify that user bytes sent during detection are delivered to useInput exactly once.

## Files Changed

| File | Change |
|------|--------|
| `packages/runtime/src/io/kitty-keyboard.ts` | **New** — types, constants, query matchers, lifecycle controller |
| `packages/runtime/src/render.ts` | Add `kittyKeyboard` to MountOptions, wire controller in mount/teardown |
| `packages/runtime/src/composables/useInput.ts` | Extend Key interface, add kitty-aware input logic |
| `packages/runtime/src/index.ts` | Re-export KittyKeyboardOptions, KittyFlagName, kittyFlags |
| `packages/runtime/tests/io/parse-keypress-kitty.test.ts` | **New** — 55 unit tests |
| `packages/runtime-tests/integration/pty/input-kitty.test.ts` | **New** — 17 integration tests |
| `packages/runtime-tests/integration/kitty-lifecycle.test.ts` | **New** — 22 integration tests |
