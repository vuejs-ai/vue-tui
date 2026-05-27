# Kitty Keyboard Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add kitty keyboard protocol support — lifecycle (enable/disable/auto-detect), useInput Key extension, and ~96 tests.

**Architecture:** New `kitty-keyboard.ts` module handles types, query/response matching, and lifecycle controller. `render.ts` wires it into mount/teardown. `useInput.ts` extends the Key interface and adds kitty-aware input logic. `parse-keypress.ts` gains a query response filter.

**Tech Stack:** TypeScript, Vue 3, vitest (via vite-plus), node-pty (PTY integration tests)

**Reference:** Ink source at `/tmp/ink` — port the patterns, adapt to Vue idioms.

---

### Task 1: Create kitty-keyboard.ts — types, constants, query/response matching

**Files:**
- Create: `packages/runtime/src/io/kitty-keyboard.ts`

- [ ] **Step 1: Create the module with types, constants, and resolveFlags**

```ts
// packages/runtime/src/io/kitty-keyboard.ts

const textEncoder = new TextEncoder();

export const kittyFlags = {
  disambiguateEscapeCodes: 1,
  reportEventTypes: 2,
  reportAlternateKeys: 4,
  reportAllKeysAsEscapeCodes: 8,
  reportAssociatedText: 16,
} as const;

export type KittyFlagName = keyof typeof kittyFlags;

export type KittyKeyboardOptions = {
  mode?: "auto" | "enabled" | "disabled";
  flags?: KittyFlagName[];
};

export function resolveFlags(flags: KittyFlagName[]): number {
  let result = 0;
  for (const flag of flags) {
    result |= kittyFlags[flag];
  }
  return result;
}
```

- [ ] **Step 2: Add query/response matching functions**

Append to `kitty-keyboard.ts`:

```ts
const ESC = 0x1b;
const OPEN_BRACKET = 0x5b;
const QUESTION_MARK = 0x3f;
const LETTER_U = 0x75;
const ZERO = 0x30;
const NINE = 0x39;

const isDigitByte = (byte: number): boolean => byte >= ZERO && byte <= NINE;

type KittyQueryMatch = { state: "complete"; endIndex: number } | { state: "partial" };

export function matchKittyQueryResponse(
  buffer: number[],
  startIndex: number,
): KittyQueryMatch | undefined {
  if (
    buffer[startIndex] !== ESC ||
    buffer[startIndex + 1] !== OPEN_BRACKET ||
    buffer[startIndex + 2] !== QUESTION_MARK
  ) {
    return undefined;
  }

  let index = startIndex + 3;
  const digitsStart = index;
  while (index < buffer.length && isDigitByte(buffer[index]!)) {
    index++;
  }

  if (index === digitsStart) {
    return undefined;
  }

  if (index === buffer.length) {
    return { state: "partial" };
  }

  if (buffer[index] === LETTER_U) {
    return { state: "complete", endIndex: index };
  }

  return undefined;
}

export function hasCompleteKittyQueryResponse(buffer: number[]): boolean {
  for (let index = 0; index < buffer.length; index++) {
    const match = matchKittyQueryResponse(buffer, index);
    if (match?.state === "complete") {
      return true;
    }
  }
  return false;
}

export function stripKittyQueryResponsesAndTrailingPartial(buffer: number[]): number[] {
  const kept: number[] = [];
  let index = 0;
  while (index < buffer.length) {
    const match = matchKittyQueryResponse(buffer, index);
    if (match?.state === "complete") {
      index = match.endIndex + 1;
      continue;
    }
    if (match?.state === "partial") {
      break;
    }
    kept.push(buffer[index]!);
    index++;
  }
  return kept;
}
```

- [ ] **Step 3: Add the lifecycle controller**

Append to `kitty-keyboard.ts`:

```ts
export interface KittyKeyboardController {
  init(options: KittyKeyboardOptions | undefined, interactive: boolean): void;
  dispose(): void;
  readonly isEnabled: boolean;
}

export function createKittyKeyboardController(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
): KittyKeyboardController {
  let enabled = false;
  let disposed = false;
  let cancelDetection: (() => void) | undefined;

  function enableProtocol(flags: KittyFlagName[]): void {
    stdout.write(`\x1b[>${resolveFlags(flags)}u`);
    enabled = true;
  }

  function confirmKittySupport(flags: KittyFlagName[]): void {
    let responseBuffer: number[] = [];

    const cleanup = (): void => {
      cancelDetection = undefined;
      clearTimeout(timer);
      stdin.removeListener("data", onData);

      const remaining = stripKittyQueryResponsesAndTrailingPartial(responseBuffer);
      responseBuffer = [];
      if (remaining.length > 0) {
        stdin.unshift(Uint8Array.from(remaining) as unknown as string);
      }
    };

    const onData = (data: Uint8Array | string): void => {
      const chunk = typeof data === "string" ? textEncoder.encode(data) : data;
      for (const byte of chunk) {
        responseBuffer.push(byte);
      }

      if (hasCompleteKittyQueryResponse(responseBuffer)) {
        cleanup();
        if (!disposed) {
          enableProtocol(flags);
        }
      }
    };

    stdin.on("data", onData);
    const timer = setTimeout(cleanup, 200);
    cancelDetection = cleanup;

    stdout.write("\x1b[?u");
  }

  const controller: KittyKeyboardController = {
    get isEnabled() {
      return enabled;
    },

    init(options, interactive) {
      if (!options) return;

      const mode = options.mode ?? "auto";
      if (mode === "disabled") return;

      const flags: KittyFlagName[] = options.flags ?? ["disambiguateEscapeCodes"];

      if (mode === "enabled") {
        if ((stdin as { isTTY?: boolean }).isTTY && (stdout as { isTTY?: boolean }).isTTY) {
          enableProtocol(flags);
        }
        return;
      }

      // auto mode
      if (
        !interactive ||
        !(stdin as { isTTY?: boolean }).isTTY ||
        !(stdout as { isTTY?: boolean }).isTTY
      ) {
        return;
      }

      confirmKittySupport(flags);
    },

    dispose() {
      disposed = true;
      if (cancelDetection) {
        cancelDetection();
      }
      if (enabled) {
        stdout.write("\x1b[<u");
        enabled = false;
      }
    },
  };

  return controller;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/src/io/kitty-keyboard.ts
git commit -m "feat: add kitty-keyboard module with types, query matching, lifecycle controller"
```

---

### Task 2: Add query response filter to parse-keypress.ts and ignore flag to useInput

**Files:**
- Modify: `packages/runtime/src/io/parse-keypress.ts:112-134` (Keypress interface)
- Modify: `packages/runtime/src/io/parse-keypress.ts:408-422` (parseKeypress function)
- Modify: `packages/runtime/src/composables/useInput.ts:5-22` (Key interface)
- Modify: `packages/runtime/src/composables/useInput.ts:38-86` (listener function)

- [ ] **Step 1: Add `ignore` field to Keypress interface**

In `packages/runtime/src/io/parse-keypress.ts`, add `ignore?: boolean` to the `Keypress` interface:

```ts
export interface Keypress {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
  raw: string | undefined;
  code?: string;
  super?: boolean;
  hyper?: boolean;
  capsLock?: boolean;
  numLock?: boolean;
  eventType?: "press" | "repeat" | "release";
  isKittyProtocol?: boolean;
  text?: string;
  /**
   * Whether this key represents printable text input.
   * When false, the key is a control/function/modifier key that should not
   * produce text input (e.g., arrows, function keys, capslock, media keys).
   * Only set by the kitty protocol parser.
   */
  isPrintable?: boolean;
  ignore?: boolean;
}
```

- [ ] **Step 2: Add query response filter at the top of parseKeypress()**

In `packages/runtime/src/io/parse-keypress.ts`, add the filter right after the Uint8Array handling block (before the kitty parser calls):

```ts
const kittyQueryResponseRe = /^\x1b\[\?\d+u$/;
```

Add this at the very top of the file (after imports), then inside `parseKeypress()`, right before `// Try kitty keyboard protocol parsers first`:

```ts
  // Swallow kitty protocol query responses — terminal capability replies, not user input.
  if (kittyQueryResponseRe.test(s)) {
    return { name: "", ctrl: false, meta: false, shift: false, sequence: s, raw: s, ignore: true };
  }
```

- [ ] **Step 3: Extend Key interface in useInput.ts**

Replace the `Key` interface in `packages/runtime/src/composables/useInput.ts`:

```ts
export interface Key {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  home: boolean;
  end: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
  super: boolean;
  hyper: boolean;
  capsLock: boolean;
  numLock: boolean;
  eventType?: "press" | "repeat" | "release";
}
```

- [ ] **Step 4: Rewrite the listener function in useInput.ts with kitty-aware logic**

Replace the entire `listener` function body in `packages/runtime/src/composables/useInput.ts`:

```ts
  function listener(data: string) {
    const keypress = parseKeypress(data);
    if (keypress.ignore) return;

    const key: Key = {
      upArrow: keypress.name === "up",
      downArrow: keypress.name === "down",
      leftArrow: keypress.name === "left",
      rightArrow: keypress.name === "right",
      pageDown: keypress.name === "pagedown",
      pageUp: keypress.name === "pageup",
      home: keypress.name === "home",
      end: keypress.name === "end",
      return: keypress.name === "return",
      escape: keypress.name === "escape",
      ctrl: keypress.ctrl,
      shift: keypress.shift,
      tab: keypress.name === "tab",
      backspace: keypress.name === "backspace",
      delete: keypress.name === "delete",
      meta: keypress.meta,
      super: keypress.super ?? false,
      hyper: keypress.hyper ?? false,
      capsLock: keypress.capsLock ?? false,
      numLock: keypress.numLock ?? false,
      eventType: keypress.eventType,
    };

    let input: string;
    if (keypress.isKittyProtocol) {
      if (keypress.isPrintable) {
        input = keypress.text ?? keypress.name;
      } else if (keypress.ctrl && keypress.name.length === 1) {
        input = keypress.name;
      } else {
        input = "";
      }
    } else if (keypress.ctrl) {
      input = keypress.name ?? "";
    } else {
      input = keypress.sequence;
    }

    if (!keypress.isKittyProtocol && nonAlphanumericKeys.includes(keypress.name)) {
      input = "";
    }

    if (input.startsWith("\x1b")) {
      input = input.slice(1);
    }

    if (input.length === 1 && /[A-Z]/.test(input)) {
      key.shift = true;
    }

    // exitOnCtrlC: intercept kitty Ctrl+C (\x1b[3;5u). Legacy \x03 is caught
    // by emitInput in createStdinController and never reaches useInput.
    if (input === "c" && key.ctrl && stdin?.internal_exitOnCtrlC) {
      app!.exit();
      return;
    }

    handler(input, key);
  }
```

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/io/parse-keypress.ts packages/runtime/src/composables/useInput.ts
git commit -m "feat: add kitty query response filter and extend useInput Key interface"
```

---

### Task 3: Wire kitty controller into render.ts and add exports

**Files:**
- Modify: `packages/runtime/src/render.ts:17` (imports)
- Modify: `packages/runtime/src/render.ts:38-94` (MountOptions)
- Modify: `packages/runtime/src/render.ts:141-153` (mounted state vars)
- Modify: `packages/runtime/src/render.ts:288-611` (mount function)
- Modify: `packages/runtime/src/render.ts:186-241` (teardown function)
- Modify: `packages/runtime/src/index.ts`

- [ ] **Step 1: Add import to render.ts**

Add to the imports in `packages/runtime/src/render.ts`:

```ts
import {
  createKittyKeyboardController,
  type KittyKeyboardOptions,
} from "./io/kitty-keyboard.ts";
```

- [ ] **Step 2: Add kittyKeyboard to MountOptions**

In `packages/runtime/src/render.ts`, add to the `MountOptions` interface (after the `incrementalRendering` field):

```ts
  /**
   * Configure kitty keyboard protocol support for enhanced keyboard input.
   * Enables additional modifiers (super, hyper, capsLock, numLock) and
   * disambiguated key events in terminals that support the protocol.
   *
   * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
   */
  kittyKeyboard?: KittyKeyboardOptions;
```

- [ ] **Step 3: Add mounted state variable**

In `packages/runtime/src/render.ts`, add after the `mountedScheduler` declaration:

```ts
  let mountedKittyController: ReturnType<typeof createKittyKeyboardController> | null = null;
```

- [ ] **Step 4: Wire controller in mount()**

In the `mount()` function, after `mountedStdinController = stdinController;` (line ~404), add:

```ts
    const kittyController = createKittyKeyboardController(stdin, stdout);
    kittyController.init(options.kittyKeyboard, interactive);
    mountedKittyController = kittyController;
```

- [ ] **Step 5: Wire dispose in teardown()**

In the `teardown()` function, after `originalUnmount()` call and before `if (!mountedDebug && !mountedInteractive && mountedAppContext)` block, add:

```ts
    if (mountedKittyController) {
      mountedKittyController.dispose();
      mountedKittyController = null;
    }
```

- [ ] **Step 6: Add public exports to index.ts**

In `packages/runtime/src/index.ts`, add:

```ts
export {
  kittyFlags,
  type KittyKeyboardOptions,
  type KittyFlagName,
} from "./io/kitty-keyboard.ts";
```

- [ ] **Step 6b: Add internal exports to internal.ts**

In `packages/runtime/src/internal.ts`, add (used by lifecycle integration tests):

```ts
export {
  createKittyKeyboardController,
  matchKittyQueryResponse,
  hasCompleteKittyQueryResponse,
  stripKittyQueryResponsesAndTrailingPartial,
  resolveFlags,
  type KittyKeyboardController,
} from "./io/kitty-keyboard.ts";
```

- [ ] **Step 7: Run type check**

Run: `vp check`
Expected: PASS (no type errors)

- [ ] **Step 8: Commit**

```bash
git add packages/runtime/src/render.ts packages/runtime/src/index.ts packages/runtime/src/internal.ts
git commit -m "feat: wire kitty keyboard controller into mount/teardown and add exports"
```

---

### Task 4: Parse-keypress kitty unit tests — basic characters, modifiers, special keys

**Files:**
- Create: `packages/runtime/src/io/parse-keypress-kitty.test.ts`

- [ ] **Step 1: Create the test file with helper and first batch of tests**

```ts
// packages/runtime/src/io/parse-keypress-kitty.test.ts
import { describe, test, expect } from "vite-plus/test";
import { parseKeypress } from "./parse-keypress.ts";

function kittyKey(
  codepoint: number,
  modifiers?: number,
  eventType?: number,
  textCodepoints?: number[],
): string {
  let seq = `\x1b[${codepoint}`;
  if (modifiers !== undefined || eventType !== undefined || textCodepoints !== undefined) {
    seq += `;${modifiers ?? 1}`;
  }
  if (eventType !== undefined || textCodepoints !== undefined) {
    seq += `:${eventType ?? 1}`;
  }
  if (textCodepoints !== undefined) {
    seq += `;${textCodepoints.join(":")}`;
  }
  seq += "u";
  return seq;
}

describe("kitty protocol - basic characters and modifiers", () => {
  test("simple character", () => {
    const result = parseKeypress(kittyKey(97));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(false);
    expect(result.shift).toBe(false);
    expect(result.meta).toBe(false);
    expect(result.eventType).toBe("press");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("uppercase character (shift)", () => {
    const result = parseKeypress(kittyKey(65, 2));
    expect(result.name).toBe("a");
    expect(result.shift).toBe(true);
    expect(result.ctrl).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("ctrl modifier", () => {
    const result = parseKeypress(kittyKey(97, 5));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("alt/option modifier", () => {
    const result = parseKeypress(kittyKey(97, 3));
    expect(result.name).toBe("a");
    expect(result.meta).toBe(true);
    expect(result.ctrl).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("super modifier", () => {
    const result = parseKeypress(kittyKey(97, 9));
    expect(result.name).toBe("a");
    expect(result.super).toBe(true);
    expect(result.ctrl).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("hyper modifier", () => {
    const result = parseKeypress(kittyKey(97, 17));
    expect(result.name).toBe("a");
    expect(result.hyper).toBe(true);
    expect(result.super).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("meta modifier", () => {
    const result = parseKeypress(kittyKey(97, 33));
    expect(result.name).toBe("a");
    expect(result.meta).toBe(true);
    expect(result.eventType).toBe("press");
  });

  test("caps lock", () => {
    const result = parseKeypress(kittyKey(97, 65));
    expect(result.name).toBe("a");
    expect(result.capsLock).toBe(true);
    expect(result.eventType).toBe("press");
  });

  test("num lock", () => {
    const result = parseKeypress(kittyKey(97, 129));
    expect(result.name).toBe("a");
    expect(result.numLock).toBe(true);
    expect(result.eventType).toBe("press");
  });

  test("combined modifiers (ctrl+shift)", () => {
    const result = parseKeypress(kittyKey(97, 6));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(true);
    expect(result.meta).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("combined modifiers (super+ctrl)", () => {
    const result = parseKeypress(kittyKey(115, 13));
    expect(result.name).toBe("s");
    expect(result.super).toBe(true);
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(false);
    expect(result.eventType).toBe("press");
  });
});

describe("kitty protocol - special keys", () => {
  test("escape key", () => {
    const result = parseKeypress(kittyKey(27));
    expect(result.name).toBe("escape");
    expect(result.eventType).toBe("press");
  });

  test("return/enter key", () => {
    const result = parseKeypress(kittyKey(13));
    expect(result.name).toBe("return");
    expect(result.eventType).toBe("press");
  });

  test("tab key", () => {
    const result = parseKeypress(kittyKey(9));
    expect(result.name).toBe("tab");
    expect(result.eventType).toBe("press");
  });

  test("backspace key (codepoint 8)", () => {
    const result = parseKeypress(kittyKey(8));
    expect(result.name).toBe("backspace");
    expect(result.eventType).toBe("press");
  });

  test("backspace key (codepoint 127)", () => {
    const result = parseKeypress(kittyKey(127));
    expect(result.name).toBe("backspace");
    expect(result.eventType).toBe("press");
  });

  test("legacy meta+backspace (0x7F)", () => {
    const result = parseKeypress("\x1b\x7f");
    expect(result.name).toBe("backspace");
    expect(result.meta).toBe(true);
  });

  test("space key", () => {
    const result = parseKeypress(kittyKey(32));
    expect(result.name).toBe("space");
    expect(result.eventType).toBe("press");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `vp test run packages/runtime/src/io/parse-keypress-kitty.test.ts`
Expected: All 18 tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/src/io/parse-keypress-kitty.test.ts
git commit -m "test: add kitty protocol unit tests — basic chars, modifiers, special keys"
```

---

### Task 5: Parse-keypress kitty unit tests — event types, text/unicode, arrows, errors

**Files:**
- Modify: `packages/runtime/src/io/parse-keypress-kitty.test.ts`

- [ ] **Step 1: Add event types, text/unicode, arrow, and error handling tests**

Append to the test file:

```ts
describe("kitty protocol - event types", () => {
  test("press", () => {
    const result = parseKeypress(kittyKey(97, 1, 1));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe("press");
  });

  test("repeat", () => {
    const result = parseKeypress(kittyKey(97, 1, 2));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe("repeat");
  });

  test("release", () => {
    const result = parseKeypress(kittyKey(97, 1, 3));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe("release");
  });
});

describe("kitty protocol - text and unicode", () => {
  test("number keys", () => {
    const result = parseKeypress(kittyKey(49));
    expect(result.name).toBe("1");
    expect(result.eventType).toBe("press");
  });

  test("special character (@)", () => {
    const result = parseKeypress(kittyKey(64));
    expect(result.name).toBe("@");
    expect(result.eventType).toBe("press");
  });

  test("ctrl+letter via codepoint 1-26", () => {
    const result = parseKeypress(kittyKey(1, 5));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(true);
  });

  test("preserves sequence and raw", () => {
    const seq = kittyKey(97, 5);
    const result = parseKeypress(seq);
    expect(result.sequence).toBe(seq);
    expect(result.raw).toBe(seq);
  });

  test("text-as-codepoints field", () => {
    const result = parseKeypress(kittyKey(97, 2, 1, [65]));
    expect(result.name).toBe("a");
    expect(result.text).toBe("A");
    expect(result.shift).toBe(true);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("text-as-codepoints with multiple codepoints", () => {
    const result = parseKeypress(kittyKey(97, 1, 1, [72, 101]));
    expect(result.text).toBe("He");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("supplementary unicode codepoint (emoji)", () => {
    const result = parseKeypress(kittyKey(128_512));
    expect(result.name).toBe("\u{1F600}");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("text defaults to character from codepoint", () => {
    const result = parseKeypress(kittyKey(97));
    expect(result.text).toBe("a");
    expect(result.isKittyProtocol).toBe(true);
  });
});

describe("kitty protocol - enhanced special keys", () => {
  test("arrow keys with event type", () => {
    const up = parseKeypress("\x1b[1;1:1A");
    expect(up.name).toBe("up");
    expect(up.eventType).toBe("press");
    expect(up.isKittyProtocol).toBe(true);

    const down = parseKeypress("\x1b[1;1:3B");
    expect(down.name).toBe("down");
    expect(down.eventType).toBe("release");

    const right = parseKeypress("\x1b[1;1:2C");
    expect(right.name).toBe("right");
    expect(right.eventType).toBe("repeat");

    const left = parseKeypress("\x1b[1;1:1D");
    expect(left.name).toBe("left");
    expect(left.eventType).toBe("press");
  });

  test("arrow keys with modifiers", () => {
    const result = parseKeypress("\x1b[1;5:1A");
    expect(result.name).toBe("up");
    expect(result.ctrl).toBe(true);
    expect(result.eventType).toBe("press");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("home and end keys", () => {
    const home = parseKeypress("\x1b[1;1:1H");
    expect(home.name).toBe("home");
    expect(home.eventType).toBe("press");
    expect(home.isKittyProtocol).toBe(true);

    const end = parseKeypress("\x1b[1;1:1F");
    expect(end.name).toBe("end");
    expect(end.eventType).toBe("press");
  });

  test("tilde-terminated special keys", () => {
    const del = parseKeypress("\x1b[3;1:1~");
    expect(del.name).toBe("delete");
    expect(del.isKittyProtocol).toBe(true);

    const ins = parseKeypress("\x1b[2;1:1~");
    expect(ins.name).toBe("insert");

    const pgup = parseKeypress("\x1b[5;1:1~");
    expect(pgup.name).toBe("pageup");

    const f5 = parseKeypress("\x1b[15;1:1~");
    expect(f5.name).toBe("f5");
  });

  test("tilde keys with modifiers", () => {
    const result = parseKeypress("\x1b[3;2:1~");
    expect(result.name).toBe("delete");
    expect(result.shift).toBe(true);
    expect(result.eventType).toBe("press");
    expect(result.isKittyProtocol).toBe(true);
  });
});

describe("kitty protocol - error handling", () => {
  test("invalid codepoint above U+10FFFF returns safe empty keypress", () => {
    const result = parseKeypress("\x1b[1114112u");
    expect(result.name).toBe("");
    expect(result.ctrl).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
    expect(result.isPrintable).toBe(false);
  });

  test("surrogate codepoint returns safe empty keypress", () => {
    const result = parseKeypress("\x1b[55296u");
    expect(result.name).toBe("");
    expect(result.ctrl).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
    expect(result.isPrintable).toBe(false);
  });

  test("invalid text codepoint replaced with fallback", () => {
    const result = parseKeypress(kittyKey(97, 1, 1, [1_114_112]));
    expect(result.name).toBe("a");
    expect(result.text).toBe("?");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("malformed modifier 0 does not set all flags", () => {
    const result = parseKeypress("\x1b[97;0u");
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(false);
    expect(result.shift).toBe(false);
    expect(result.meta).toBe(false);
    expect(result.super ?? false).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });
});
```

- [ ] **Step 2: Run all tests in the file**

Run: `vp test run packages/runtime/src/io/parse-keypress-kitty.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/src/io/parse-keypress-kitty.test.ts
git commit -m "test: add kitty protocol unit tests — event types, text/unicode, arrows, errors"
```

---

### Task 6: Parse-keypress kitty unit tests — query filter, legacy fallback, isPrintable, non-printable keys

**Files:**
- Modify: `packages/runtime/src/io/parse-keypress-kitty.test.ts`

- [ ] **Step 1: Add remaining test groups**

Append to the test file:

```ts
describe("kitty protocol - query response filtering", () => {
  test("query response returns ignored keypress", () => {
    const result = parseKeypress("\x1b[?1u");
    expect(result.name).toBe("");
    expect(result.ignore).toBe(true);
  });

  test("multi-digit query response returns ignored keypress", () => {
    const result = parseKeypress("\x1b[?31u");
    expect(result.name).toBe("");
    expect(result.ignore).toBe(true);
  });
});

describe("kitty protocol - legacy fallback", () => {
  test("non-kitty sequences fall back to legacy parsing", () => {
    const result = parseKeypress("\x1b[A");
    expect(result.name).toBe("up");
    expect(result.isKittyProtocol).toBeUndefined();
  });

  test("ctrl+c legacy fallback", () => {
    const result = parseKeypress("\x03");
    expect(result.name).toBe("c");
    expect(result.ctrl).toBe(true);
    expect(result.isKittyProtocol).toBeUndefined();
  });
});

describe("kitty protocol - isPrintable field", () => {
  test("true for regular characters", () => {
    expect(parseKeypress(kittyKey(97)).isPrintable).toBe(true);
  });

  test("true for digits", () => {
    expect(parseKeypress(kittyKey(49)).isPrintable).toBe(true);
  });

  test("true for symbols", () => {
    expect(parseKeypress(kittyKey(64)).isPrintable).toBe(true);
  });

  test("true for emoji", () => {
    expect(parseKeypress(kittyKey(128_512)).isPrintable).toBe(true);
  });

  test("false for escape", () => {
    expect(parseKeypress(kittyKey(27)).isPrintable).toBe(false);
  });

  test("true for return", () => {
    expect(parseKeypress(kittyKey(13)).isPrintable).toBe(true);
  });

  test("false for tab", () => {
    expect(parseKeypress(kittyKey(9)).isPrintable).toBe(false);
  });

  test("true for space", () => {
    expect(parseKeypress(kittyKey(32)).isPrintable).toBe(true);
  });

  test("false for backspace", () => {
    expect(parseKeypress(kittyKey(8)).isPrintable).toBe(false);
  });

  test("false for ctrl+letter", () => {
    expect(parseKeypress(kittyKey(1, 5)).isPrintable).toBe(false);
  });

  test("false for special keys (arrows)", () => {
    expect(parseKeypress("\x1b[1;1:1A").isPrintable).toBe(false);
  });
});

describe("kitty protocol - non-printable key suppression", () => {
  test("capslock (57358) is non-printable", () => {
    const result = parseKeypress("\x1b[57358u");
    expect(result.name).toBe("capslock");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("printscreen (57361) is non-printable", () => {
    const result = parseKeypress("\x1b[57361u");
    expect(result.name).toBe("printscreen");
    expect(result.isPrintable).toBe(false);
  });

  test("f13 (57376) is non-printable", () => {
    const result = parseKeypress("\x1b[57376u");
    expect(result.name).toBe("f13");
    expect(result.isPrintable).toBe(false);
  });

  test("media key (57428 mediaplay) is non-printable", () => {
    const result = parseKeypress("\x1b[57428u");
    expect(result.name).toBe("mediaplay");
    expect(result.isPrintable).toBe(false);
  });

  test("modifier-only key (57441 leftshift) is non-printable", () => {
    const result = parseKeypress("\x1b[57441u");
    expect(result.name).toBe("leftshift");
    expect(result.isPrintable).toBe(false);
  });

  test("modifier-only key (57442 leftcontrol) is non-printable", () => {
    const result = parseKeypress("\x1b[57442u");
    expect(result.name).toBe("leftcontrol");
    expect(result.isPrintable).toBe(false);
  });

  test("kp keys (57399 kp0) are non-printable", () => {
    const result = parseKeypress("\x1b[57399u");
    expect(result.name).toBe("kp0");
    expect(result.isPrintable).toBe(false);
  });

  test("scrolllock (57359) is non-printable", () => {
    const result = parseKeypress("\x1b[57359u");
    expect(result.name).toBe("scrolllock");
    expect(result.isPrintable).toBe(false);
  });

  test("numlock (57360) is non-printable", () => {
    const result = parseKeypress("\x1b[57360u");
    expect(result.name).toBe("numlock");
    expect(result.isPrintable).toBe(false);
  });

  test("pause (57362) is non-printable", () => {
    const result = parseKeypress("\x1b[57362u");
    expect(result.name).toBe("pause");
    expect(result.isPrintable).toBe(false);
  });

  test("volume keys are non-printable", () => {
    const lower = parseKeypress("\x1b[57438u");
    expect(lower.name).toBe("lowervolume");
    expect(lower.isPrintable).toBe(false);

    const raise = parseKeypress("\x1b[57439u");
    expect(raise.name).toBe("raisevolume");
    expect(raise.isPrintable).toBe(false);

    const mute = parseKeypress("\x1b[57440u");
    expect(mute.name).toBe("mutevolume");
    expect(mute.isPrintable).toBe(false);
  });
});

describe("kitty protocol - space and return text", () => {
  test("space key has text field set to space character", () => {
    const result = parseKeypress(kittyKey(32));
    expect(result.text).toBe(" ");
  });

  test("return key has text field set to carriage return", () => {
    const result = parseKeypress(kittyKey(13));
    expect(result.text).toBe("\r");
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `vp test run packages/runtime/src/io/parse-keypress-kitty.test.ts`
Expected: All ~57 tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/src/io/parse-keypress-kitty.test.ts
git commit -m "test: add kitty protocol unit tests — query filter, isPrintable, non-printable keys"
```

---

### Task 7: PTY integration test fixture for kitty useInput

**Files:**
- Create: `packages/runtime-tests/integration/pty/fixtures/use-input-kitty.tsx`

- [ ] **Step 1: Create the test fixture**

```tsx
// packages/runtime-tests/integration/pty/fixtures/use-input-kitty.tsx
import process from "node:process";
import { createApp, useInput, useExit } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const KittyInput = defineComponent({
  props: {
    test: { type: String, default: undefined },
  },
  setup(props) {
    const exit = useExit();

    onMounted(() => {
      process.stdout.write("__READY__");
    });

    useInput((input, key) => {
      if (props.test === "super" && input === "s" && key.super) {
        exit();
        return;
      }

      if (props.test === "hyper" && input === "h" && key.hyper) {
        exit();
        return;
      }

      if (props.test === "capsLock" && key.capsLock) {
        exit();
        return;
      }

      if (props.test === "numLock" && key.numLock) {
        exit();
        return;
      }

      if (props.test === "superCtrl" && input === "s" && key.super && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "press" && key.eventType === "press") {
        exit();
        return;
      }

      if (props.test === "repeat" && key.eventType === "repeat") {
        exit();
        return;
      }

      if (props.test === "release" && key.eventType === "release") {
        exit();
        return;
      }

      if (props.test === "escape" && key.escape && input === "") {
        exit();
        return;
      }

      if (props.test === "backspace" && key.backspace && input === "") {
        exit();
        return;
      }

      if (props.test === "delete" && key.delete && input === "") {
        exit();
        return;
      }

      if (props.test === "capslock-empty" && input === "") {
        exit();
        return;
      }

      if (props.test === "f13-empty" && input === "") {
        exit();
        return;
      }

      if (props.test === "printscreen-empty" && input === "") {
        exit();
        return;
      }

      if (props.test === "space" && input === " ") {
        exit();
        return;
      }

      if (props.test === "return" && input === "\r") {
        exit();
        return;
      }

      if (props.test === "ctrlLetter" && input === "a" && key.ctrl) {
        exit();
        return;
      }

      if (props.test === "queryResponse") {
        throw new Error("Query response should not reach handler");
      }

      if (props.test === "queryThenKey") {
        if (input === "a") {
          exit();
          return;
        }
        throw new Error(`queryThenKey: expected input="a", got input="${input}"`);
      }

      throw new Error(`Unexpected input for test "${props.test}": input="${input}"`);
    });

    return () => null;
  },
});

const testName = process.argv[2];

// kittyCtrlCExit: exitOnCtrlC=true (default), kitty Ctrl+C should trigger exit
// The useInput handler should NOT be called because the exitOnCtrlC guard fires first
if (testName === "kittyCtrlCExit") {
  const app = createApp(KittyInput, { test: testName });
  app.mount({ exitOnCtrlC: true });
  await app.waitUntilExit();
  console.log("exited");
} else {
  const app = createApp(KittyInput, { test: testName });
  app.mount({ exitOnCtrlC: false });
  await app.waitUntilExit();
  console.log("exited");
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/runtime-tests/integration/pty/fixtures/use-input-kitty.tsx
git commit -m "test: add kitty useInput PTY test fixture"
```

---

### Task 8: PTY integration tests for kitty useInput

**Files:**
- Create: `packages/runtime-tests/integration/pty/input-kitty.test.ts`

- [ ] **Step 1: Create the integration test file**

```ts
// packages/runtime-tests/integration/pty/input-kitty.test.ts
import { test as it, expect } from "vite-plus/test";
import term from "./helpers/term.ts";

function kittyKey(
  codepoint: number,
  modifiers?: number,
  eventType?: number,
): string {
  let seq = `\x1b[${codepoint}`;
  if (modifiers !== undefined || eventType !== undefined) {
    seq += `;${modifiers ?? 1}`;
  }
  if (eventType !== undefined) {
    seq += `:${eventType}`;
  }
  seq += "u";
  return seq;
}

// --- Kitty modifiers through useInput ---

it("useInput - handle kitty protocol super modifier", async () => {
  const ps = term("use-input-kitty", ["super"]);
  ps.write(kittyKey(115, 9)); // 's' with super(8)+1
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol hyper modifier", async () => {
  const ps = term("use-input-kitty", ["hyper"]);
  ps.write(kittyKey(104, 17)); // 'h' with hyper(16)+1
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol capsLock", async () => {
  const ps = term("use-input-kitty", ["capsLock"]);
  ps.write(kittyKey(97, 65)); // 'a' with capsLock(64)+1
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol numLock", async () => {
  const ps = term("use-input-kitty", ["numLock"]);
  ps.write(kittyKey(97, 129)); // 'a' with numLock(128)+1
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol super+ctrl", async () => {
  const ps = term("use-input-kitty", ["superCtrl"]);
  ps.write(kittyKey(115, 13)); // 's' with super(8)+ctrl(4)+1
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Kitty event types through useInput ---

it("useInput - handle kitty protocol press event", async () => {
  const ps = term("use-input-kitty", ["press"]);
  ps.write(kittyKey(97, 1, 1));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol repeat event", async () => {
  const ps = term("use-input-kitty", ["repeat"]);
  ps.write(kittyKey(97, 1, 2));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol release event", async () => {
  const ps = term("use-input-kitty", ["release"]);
  ps.write(kittyKey(97, 1, 3));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Special keys through useInput ---

it("useInput - handle kitty protocol escape key", async () => {
  const ps = term("use-input-kitty", ["escape"]);
  ps.write(kittyKey(27));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol backspace (codepoint 127)", async () => {
  const ps = term("use-input-kitty", ["backspace"]);
  ps.write(kittyKey(127));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - handle kitty protocol delete", async () => {
  const ps = term("use-input-kitty", ["delete"]);
  ps.write("\x1b[3;1:1~"); // kitty enhanced delete
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Non-printable keys produce empty input ---

it("useInput - non-printable kitty key (capslock) produces empty input", async () => {
  const ps = term("use-input-kitty", ["capslock-empty"]);
  ps.write(kittyKey(57358)); // capslock
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - non-printable kitty key (f13) produces empty input", async () => {
  const ps = term("use-input-kitty", ["f13-empty"]);
  ps.write(kittyKey(57376)); // f13
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - non-printable kitty key (printscreen) produces empty input", async () => {
  const ps = term("use-input-kitty", ["printscreen-empty"]);
  ps.write(kittyKey(57361)); // printscreen
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Text input ---

it("useInput - kitty protocol space key produces space input", async () => {
  const ps = term("use-input-kitty", ["space"]);
  ps.write(kittyKey(32));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - kitty protocol return key produces carriage return input", async () => {
  const ps = term("use-input-kitty", ["return"]);
  ps.write(kittyKey(13));
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("useInput - kitty protocol ctrl+letter via codepoint 1-26 produces input", async () => {
  const ps = term("use-input-kitty", ["ctrlLetter"]);
  ps.write(kittyKey(1, 5)); // ctrl+a (codepoint 1, modifier 5)
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Kitty Ctrl+C with exitOnCtrlC ---

it("useInput - kitty Ctrl+C exits app when exitOnCtrlC is true", async () => {
  // Default exitOnCtrlC=true, kitty Ctrl+C should exit the app
  const ps = term("use-input-kitty", ["kittyCtrlCExit"]);
  ps.write(kittyKey(3, 5)); // codepoint 3, modifier 5 = ctrl(4)+1
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

// --- Query response suppression ---

it("useInput - query response is silently ignored, next real key works", async () => {
  const ps = term("use-input-kitty", ["queryThenKey"]);
  // Send query response followed by a real key — query is swallowed, real key exits
  ps.write("\x1b[?1u");
  ps.write("a");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});
```

- [ ] **Step 2: Build runtime and run PTY tests**

PTY fixtures resolve `@vue-tui/runtime` through package exports to `dist/`, so the runtime must be built first.

Run: `vp run -r build && cd packages/runtime-tests && pnpm pty-test`
Expected: All kitty PTY tests PASS (plus existing tests remain passing)

- [ ] **Step 3: Commit**

```bash
git add packages/runtime-tests/integration/pty/input-kitty.test.ts
git commit -m "test: add kitty protocol PTY integration tests for useInput"
```

---

### Task 9: Lifecycle integration tests

**Files:**
- Create: `packages/runtime-tests/integration/kitty-lifecycle.test.ts`

- [ ] **Step 1: Create the lifecycle test file**

```ts
// packages/runtime-tests/integration/kitty-lifecycle.test.ts
import { describe, test, expect, vi } from "vite-plus/test";
import EventEmitter from "node:events";
import {
  createKittyKeyboardController,
  matchKittyQueryResponse,
  hasCompleteKittyQueryResponse,
  stripKittyQueryResponsesAndTrailingPartial,
  resolveFlags,
} from "@vue-tui/runtime/internal";

const textEncoder = new TextEncoder();

function createFakeStdout() {
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream;
  stdout.columns = 100;
  (stdout as any).isTTY = true;
  const written: string[] = [];
  stdout.write = ((data: string) => {
    written.push(data);
    return true;
  }) as typeof stdout.write;
  return { stdout, written };
}

function createFakeStdin() {
  const stdin = new EventEmitter() as unknown as NodeJS.ReadStream;
  (stdin as any).isTTY = true;
  (stdin as any).setRawMode = vi.fn();
  (stdin as any).setEncoding = vi.fn();
  (stdin as any).read = vi.fn();
  const unshifted: Uint8Array[] = [];
  stdin.unshift = ((chunk: Uint8Array) => {
    unshifted.push(Uint8Array.from(chunk));
    return true;
  }) as typeof stdin.unshift;
  return { stdin, unshifted };
}

// --- Query/response matching unit tests ---

describe("kitty query/response matching", () => {
  test("matchKittyQueryResponse detects complete response", () => {
    const buf = [...textEncoder.encode("\x1b[?1u")];
    const match = matchKittyQueryResponse(buf, 0);
    expect(match).toEqual({ state: "complete", endIndex: 4 });
  });

  test("matchKittyQueryResponse detects partial response", () => {
    const buf = [...textEncoder.encode("\x1b[?1")];
    const match = matchKittyQueryResponse(buf, 0);
    expect(match).toEqual({ state: "partial" });
  });

  test("matchKittyQueryResponse returns undefined for non-match", () => {
    const buf = [...textEncoder.encode("hello")];
    expect(matchKittyQueryResponse(buf, 0)).toBeUndefined();
  });

  test("matchKittyQueryResponse returns undefined without digits", () => {
    const buf = [...textEncoder.encode("\x1b[?u")];
    expect(matchKittyQueryResponse(buf, 0)).toBeUndefined();
  });

  test("hasCompleteKittyQueryResponse finds response in buffer", () => {
    const buf = [...textEncoder.encode("abc\x1b[?1udef")];
    expect(hasCompleteKittyQueryResponse(buf)).toBe(true);
  });

  test("stripKittyQueryResponsesAndTrailingPartial removes responses", () => {
    const buf = [...textEncoder.encode("a\x1b[?1ub")];
    expect(stripKittyQueryResponsesAndTrailingPartial(buf)).toEqual(
      [...textEncoder.encode("ab")],
    );
  });

  test("stripKittyQueryResponsesAndTrailingPartial removes trailing partial", () => {
    const buf = [...textEncoder.encode("a\x1b[?1")];
    expect(stripKittyQueryResponsesAndTrailingPartial(buf)).toEqual(
      [...textEncoder.encode("a")],
    );
  });

  test("resolveFlags computes correct bitmask", () => {
    expect(resolveFlags(["disambiguateEscapeCodes"])).toBe(1);
    expect(resolveFlags(["disambiguateEscapeCodes", "reportEventTypes"])).toBe(3);
  });
});

// --- Init/cleanup tests ---

describe("kitty lifecycle - init/cleanup", () => {
  test("writes enable sequence when mode is enabled", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled" }, true);
    expect(written).toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(true);

    ctrl.dispose();
  });

  test("writes disable sequence on dispose", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled" }, true);
    ctrl.dispose();
    expect(written).toContain("\x1b[<u");
    expect(ctrl.isEnabled).toBe(false);
  });

  test("not enabled when stdin is not TTY", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    (stdin as any).isTTY = false;
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled" }, true);
    expect(written).not.toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });

  test("not enabled when stdout is not TTY", () => {
    const { stdout, written } = createFakeStdout();
    (stdout as any).isTTY = false;
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled" }, true);
    expect(written).not.toContain("\x1b[>1u");

    ctrl.dispose();
  });
});

// --- Opt-in behavior tests ---

describe("kitty lifecycle - opt-in behavior", () => {
  test("no-op when kittyKeyboard is absent", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init(undefined, true);
    expect(written.filter((s) => s.includes("\x1b[>"))).toHaveLength(0);
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });

  test("no-op when mode is disabled", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "disabled" }, true);
    expect(written.filter((s) => s.includes("\x1b[>"))).toHaveLength(0);
    expect(ctrl.isEnabled).toBe(false);

    ctrl.dispose();
  });
});

// --- Custom flags tests ---

describe("kitty lifecycle - custom flags", () => {
  test("enabled mode with custom flags writes correct bitmask", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "enabled", flags: ["disambiguateEscapeCodes", "reportEventTypes"] }, true);
    expect(written).toContain("\x1b[>3u");

    ctrl.dispose();
  });

  test("auto mode with custom flags passes them through", () => {
    const { stdout } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const writtenStrings: string[] = [];

    stdout.write = ((data: string) => {
      writtenStrings.push(data);
      if (data === "\x1b[?u") {
        stdin.emit("data", "\x1b[?1u");
      }
      return true;
    }) as typeof stdout.write;

    const ctrl = createKittyKeyboardController(stdin, stdout);
    ctrl.init(
      { mode: "auto", flags: ["disambiguateEscapeCodes", "reportEventTypes"] },
      true,
    );

    expect(writtenStrings).toContain("\x1b[>3u");
    ctrl.dispose();
  });
});

// --- Auto-detection tests ---

describe("kitty lifecycle - auto-detection", () => {
  test("enables protocol when terminal responds", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?1u");

    expect(written).toContain("\x1b[>1u");
    expect(ctrl.isEnabled).toBe(true);

    ctrl.dispose();
  });

  test("handles synchronous query response", () => {
    const { stdout } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const writtenStrings: string[] = [];

    stdout.write = ((data: string) => {
      writtenStrings.push(data);
      if (data === "\x1b[?u") {
        stdin.emit("data", "\x1b[?1u");
      }
      return true;
    }) as typeof stdout.write;

    const ctrl = createKittyKeyboardController(stdin, stdout);
    ctrl.init({ mode: "auto" }, true);

    expect(writtenStrings).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("handles Uint8Array response", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", textEncoder.encode("\x1b[?1u"));

    expect(written).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("does not enable after dispose", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    ctrl.dispose();
    stdin.emit("data", "\x1b[?1u");

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
  });

  test("preserves split UTF-8 input bytes", async () => {
    const { stdout } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);

    stdin.emit("data", new Uint8Array([0xf0, 0x9f]));
    stdin.emit("data", new Uint8Array([0x92, 0xa9]));

    await new Promise((r) => setTimeout(r, 250));

    const allBytes: number[] = [];
    for (const chunk of unshifted) {
      for (const b of chunk) allBytes.push(b);
    }
    expect(allBytes).toEqual([0xf0, 0x9f, 0x92, 0xa9]);

    ctrl.dispose();
  });

  test("timeout does not leak partial query response", async () => {
    const { stdout } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?1");

    await new Promise((r) => setTimeout(r, 250));

    expect(unshifted).toHaveLength(0);
    ctrl.dispose();
  });

  test("timeout preserves query prefix without digits", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?");

    await new Promise((r) => setTimeout(r, 250));

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
    expect(unshifted.map((c) => [...c])).toEqual([[0x1b, 0x5b, 0x3f]]);

    ctrl.dispose();
  });

  test("ignores response without digits", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?u");

    await new Promise((r) => setTimeout(r, 250));

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
    expect(unshifted.map((c) => [...c])).toEqual([[0x1b, 0x5b, 0x3f, 0x75]]);

    ctrl.dispose();
  });

  test("preserves invalid query-like escape sequence", async () => {
    const { stdout, written } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?1x");

    await new Promise((r) => setTimeout(r, 250));

    expect(written.filter((s) => s === "\x1b[>1u")).toHaveLength(0);
    expect(unshifted.map((c) => [...c])).toEqual([[0x1b, 0x5b, 0x3f, 0x31, 0x78]]);

    ctrl.dispose();
  });

  test("response \x1b[?0u is valid support confirmation", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?0u");

    expect(written).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("split response across two data chunks", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "\x1b[?");
    stdin.emit("data", "1u");

    expect(written).toContain("\x1b[>1u");
    ctrl.dispose();
  });

  test("non-query bytes interleaved with response are re-emitted", () => {
    const { stdout } = createFakeStdout();
    const { stdin, unshifted } = createFakeStdin();
    const ctrl = createKittyKeyboardController(stdin, stdout);

    ctrl.init({ mode: "auto" }, true);
    stdin.emit("data", "a\x1b[?1ub");

    const allBytes: number[] = [];
    for (const chunk of unshifted) {
      for (const b of chunk) allBytes.push(b);
    }
    expect(allBytes).toEqual([0x61, 0x62]); // 'a', 'b'
    ctrl.dispose();
  });
});
```

- [ ] **Step 2: Add render-level lifecycle tests**

Append to `packages/runtime-tests/integration/kitty-lifecycle.test.ts` — these test the full `createApp().mount({ kittyKeyboard })` path, not just the controller:

```ts
// --- Render-level integration tests ---

import { createApp } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const Dummy = defineComponent(() => () => null);

describe("kitty lifecycle - mount/unmount integration", () => {
  test("mount with kittyKeyboard enabled writes enable sequence", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(Dummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      kittyKeyboard: { mode: "enabled" },
    });

    expect(written).toContain("\x1b[>1u");
    app.unmount();
  });

  test("unmount writes disable sequence", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(Dummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      kittyKeyboard: { mode: "enabled" },
    });

    app.unmount();
    expect(written).toContain("\x1b[<u");
  });

  test("mount without kittyKeyboard does not write sequences", () => {
    const { stdout, written } = createFakeStdout();
    const { stdin } = createFakeStdin();

    const app = createApp(Dummy);
    app.mount({
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
    });

    expect(written.filter((s) => s.includes("\x1b[>"))).toHaveLength(0);
    app.unmount();
  });
});
```

- [ ] **Step 3: Run integration tests**

Run: `cd packages/runtime-tests && vp test run integration/kitty-lifecycle.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/runtime-tests/integration/kitty-lifecycle.test.ts
git commit -m "test: add kitty keyboard lifecycle integration tests"
```

---

### Task 10: Final validation

- [ ] **Step 1: Run full test suite**

Run: `vp run ready`
Expected: lint, type-check, all tests (unit + integration + PTY), and build all pass.

- [ ] **Step 2: Commit any fixups if needed**

If any existing tests broke due to the Key interface change (new required fields), fix them. The Key interface now has `super`, `hyper`, `capsLock`, `numLock` as required booleans — any code that constructs a Key object manually will need these fields added.

- [ ] **Step 3: Verify no regressions**

Confirm the existing `input.test.ts` PTY tests still pass, particularly:
- `useInput - handle Ctrl+C via kitty codepoint-3 form when exitOnCtrlC is false`
- All arrow key, tab, backspace, escape tests

Run: `cd packages/runtime-tests && pnpm pty-test`
Expected: All existing tests PASS
