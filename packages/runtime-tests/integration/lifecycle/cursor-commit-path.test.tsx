// Stream-level cursor parity (Ink test/cursor.tsx:89-193). The existing
// use-cursor.test.tsx tests observe semantic frames rather than terminal bytes.
// These tests mount a REAL interactive TTY (isTTY:true) so log-update
// actually composes the cursor escapes, then capture the raw stdout write
// chunks (like Ink's getWriteCalls) and assert the real ANSI cursor sequence.
//
// ansiEscapes.cursorTo(x) === `\x1b[${x+1}G`, so:
//   useCursor x=2 -> cursorTo(2) -> "\x1b[3G"
//   after typing 'a' x=3 -> cursorTo(3) -> "\x1b[4G"
//   after a space  x=4 -> cursorTo(4) -> "\x1b[5G"
import { PassThrough } from "node:stream";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, Text, createApp, useCursor, useInput, useStdout } from "@vue-tui/runtime";

const showCursorEscape = "\x1b[?25h";
const hideCursorEscape = "\x1b[?25l";
// Synchronized-update markers (BSU/ESU): begin/end the "?2026" private mode.
const bsu = "\x1b[?2026h";
const esu = "\x1b[?2026l";
// ansiEscapes.cursorTo(x) is a 1-based column move: `\x1b[${x + 1}G`.
const cursorTo = (x: number) => `\x1b[${x + 1}G`;

function makeTtyStdout(): { stream: NodeJS.WriteStream; writes: string[] } {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true, columns: 100, rows: 100 });
  // Capture EVERY write() call (like Ink's getWriteCalls). The cursor escapes
  // and synchronized-update wrappers are separate write() calls, so an
  // on("data") listener that coalesces chunks would still see them — but
  // wrapping write directly mirrors Ink's sinon spy exactly and lets us count
  // calls for the "writes increased" assertion.
  const writes: string[] = [];
  const original = stream.write.bind(stream);
  stream.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (original as (...a: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  return { stream, writes };
}

function makeTtyStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode(this: NodeJS.ReadStream) {
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
  });
  (s as unknown as { ref: () => void }).ref = () => {};
  (s as unknown as { unref: () => void }).unref = () => {};
  return s;
}

// Mirrors Ink's InputApp (test/cursor.tsx:65-87): cursor at x = 2 + text.length.
const InputApp = defineComponent(() => {
  const text = shallowRef("");
  const { setCursorPosition } = useCursor();

  useInput((event) => {
    if (event.kind === "key" && (event.key.name === "backspace" || event.key.name === "delete")) {
      text.value = text.value.slice(0, -1);
      return "consume";
    }
    if (event.kind === "text") {
      text.value += event.text;
      return "consume";
    }
    return "continue";
  });

  return () => {
    setCursorPosition({ x: 2 + text.value.length, y: 0 });
    return (
      <Box>
        <Text>{`> ${text.value}`}</Text>
      </Box>
    );
  };
});

describe("cursor commit-path wiring (interactive stream level)", () => {
  test("cursor is shown at the useCursor position after first render", async () => {
    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    // maxFps:0 makes commits immediate (no ~34ms throttle), so the first frame
    // is flushed synchronously through log-update.
    const app = createApp(InputApp);
    app.mount({ stdout, stdin, maxFps: 0 });
    await app.waitUntilRenderFlush();

    const output = writes.join("");
    expect(output).toContain(showCursorEscape);
    // x=2 -> cursorTo(2) -> "\x1b[3G"
    expect(output).toContain(cursorTo(2));

    app.unmount();
  });

  test("last cursor visibility change after first render is SHOW, not HIDE", async () => {
    // Ink test/cursor.tsx:113-134. A later commit must not re-hide the cursor
    // that log-update showed.
    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    const app = createApp(InputApp);
    app.mount({ stdout, stdin, maxFps: 0 });
    await app.waitUntilRenderFlush();

    const output = writes.join("");
    expect(output.lastIndexOf(showCursorEscape)).toBeGreaterThan(
      output.lastIndexOf(hideCursorEscape),
    );

    app.unmount();
  });

  test("cursor follows text input (cursorTo(3) after typing 'a')", async () => {
    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    const app = createApp(InputApp);
    app.mount({ stdout, stdin, maxFps: 0 });
    await app.waitUntilRenderFlush();

    stdin.emit("data", "a");
    await app.waitUntilRenderFlush();

    const output = writes.join("");
    expect(output).toContain(showCursorEscape);
    // After 'a', x=3 -> cursorTo(3) -> "\x1b[4G"
    expect(output).toContain(cursorTo(3));

    app.unmount();
  });

  test("cursor moves on a space keystroke even when the frame is byte-identical", async () => {
    // Ink test/cursor.tsx:159-193. A space appends to the text so the cursor
    // moves, but the rendered frame string can be byte-identical to the previous
    // one (trailing space gets collapsed/trimmed in layout). Ink still writes a
    // cursor-only sequence (buildCursorOnlySequence) gated on isCursorDirty(),
    // so write count must INCREASE and cursorTo(4) must appear.
    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    const app = createApp(InputApp);
    app.mount({ stdout, stdin, maxFps: 0 });
    await app.waitUntilRenderFlush();

    stdin.emit("data", "a");
    await app.waitUntilRenderFlush();
    const writeCountAfterA = writes.length;

    stdin.emit("data", " ");
    await app.waitUntilRenderFlush();

    expect(writes.length).toBeGreaterThan(writeCountAfterA);
    const output = writes.join("");
    // After "a ", x=4 -> cursorTo(4) -> "\x1b[5G"
    expect(output).toContain(cursorTo(4));

    app.unmount();
  });

  test("a useStdout().write() does not leave the cursor hidden", async () => {
    // After an external stdout write, restoreLastOutput re-shows the cursor;
    // a subsequent commit must not re-hide it. So the LAST show index must be
    // after the LAST hide index (Ink's invariant for an active cursor).
    let writeFromHook: ((data: string) => void) | undefined;
    const StdoutWriteApp = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      const { write } = useStdout();
      writeFromHook = write;

      return () => {
        // Set the cursor every render so it stays active across commits.
        setCursorPosition({ x: 2, y: 0 });
        return <Text>Hello</Text>;
      };
    });

    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    const app = createApp(StdoutWriteApp);
    app.mount({ stdout, stdin, maxFps: 0 });
    await app.waitUntilRenderFlush();

    // External write -> clear() + data + restoreLastOutput() (which re-shows
    // the cursor). A trailing commit must NOT re-hide it.
    writeFromHook?.("from stdout hook\n");
    await app.waitUntilRenderFlush();

    const output = writes.join("");
    expect(output).toContain(showCursorEscape);
    expect(output.lastIndexOf(showCursorEscape)).toBeGreaterThan(
      output.lastIndexOf(hideCursorEscape),
    );

    app.unmount();
  });

  test("an idle cursor-dirty re-render emits NO empty BSU/ESU pair", async () => {
    // DEFECT 1 (Ink fidelity, ink.tsx:372-382 + 1094). When a render marks the
    // cursor dirty (a fresh position object each render) but BOTH the position
    // value AND the output are unchanged, willRender() is false. Ink's inner
    // BSU/ESU gate is `willRender()` ALONE, so it emits ZERO bytes — it does not
    // wrap a no-op log-update write in a synchronized-update pair. The gate must
    // therefore NOT emit `\x1b[?2026h` immediately followed by `\x1b[?2026l`
    // with nothing between (an empty sync-update pair).
    //
    // Repro note: Vue's static-VNode optimization suppresses a second commit
    // when nothing in the tree changes, so we force one with a `key` bump that
    // remounts the child (remove+insert -> onCommit) while the rendered text
    // stays byte-identical. patchConsole:false keeps the render path clean.
    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    let bumpKey: (() => void) | undefined;
    const KeyBumpApp = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      const tick = shallowRef(0);
      bumpKey = () => {
        tick.value++;
      };
      return () => {
        // Fresh position object every render at the SAME x/y: marks cursorDirty
        // but the position VALUE is unchanged from the previous render.
        setCursorPosition({ x: 2, y: 0 });
        // Bumping `key` remounts this Text (forces a commit) but the text is
        // byte-identical, so the rendered frame does not change.
        return <Box>{h(Text, { key: tick.value }, () => "Hello")}</Box>;
      };
    });

    const app = createApp(KeyBumpApp);
    app.mount({ stdout, stdin, maxFps: 0, patchConsole: false });
    await app.waitUntilRenderFlush();

    // Only inspect the SECOND (idle) commit's writes — the first commit
    // legitimately emits a BSU/ESU pair around the initial frame.
    const writesBeforeIdle = writes.length;
    bumpKey?.();
    await nextTick();
    await app.waitUntilRenderFlush();

    const idleWrites = writes.slice(writesBeforeIdle);
    // No BSU immediately followed by ESU (an empty synchronized-update pair).
    const hasEmptySyncPair = idleWrites.some(
      (chunk, i) => chunk === bsu && idleWrites[i + 1] === esu,
    );
    expect(hasEmptySyncPair).toBe(false);
    // And no BSU leaks at all on this no-op frame (Ink emits zero bytes here).
    expect(idleWrites).not.toContain(bsu);

    app.unmount();
  });

  test("a synchronous mount-time throw does not leave the cursor hidden", async () => {
    // DEFECT 2 (regression). The cursor is hidden BEFORE originalMount so the
    // first commit's SHOW is the last visibility change. But if originalMount
    // throws SYNCHRONOUSLY in a way onErrorCaptured cannot catch (a renderer/
    // patch-level vnode error — here a vnode whose `type` getter throws), the
    // teardown handlers were registered only AFTER originalMount, so nothing
    // would ever re-show the cursor -> terminal left permanently invisible.
    // Ink wires signalExit(this.unmount) in its constructor (ink.tsx:426),
    // before any hide; we get the same guarantee by tearing down (which shows
    // the cursor) on a synchronous mount throw before rethrowing.
    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    const ThrowOnPatchApp = defineComponent(() => {
      return () => {
        // A vnode whose `type` getter throws during the renderer's patch phase.
        // This bypasses the onErrorCaptured boundary (it is a renderer-level
        // error, not a child component render error).
        const vnode = h("div");
        Object.defineProperty(vnode, "type", {
          get() {
            throw new Error("boom from vnode type getter");
          },
        });
        return vnode as never;
      };
    });

    const app = createApp(ThrowOnPatchApp);
    let mountThrew = false;
    try {
      app.mount({ stdout, stdin, maxFps: 0 });
    } catch {
      mountThrew = true;
    }

    // The mount must have actually thrown (otherwise the repro is invalid).
    expect(mountThrew).toBe(true);

    const output = writes.join("");
    // The cursor was hidden on mount; the terminal must not be left hidden.
    // Either no hide leaked, or a SHOW follows the last HIDE.
    if (output.includes(hideCursorEscape)) {
      expect(output).toContain(showCursorEscape);
      expect(output.lastIndexOf(showCursorEscape)).toBeGreaterThan(
        output.lastIndexOf(hideCursorEscape),
      );
    }
  });

  test("a child useCursor unmount emits the cursor-HIDE escape (show -> hide ordering)", async () => {
    // B19 (Ink parity, use-cursor.ts:29-31): when a `useCursor` child unmounts,
    // its onScopeDispose runs ctx.setCursorPosition(undefined) — exactly Ink's
    // useInsertionEffect cleanup `context.setCursorPosition(undefined)`. That
    // marks log-update cursorDirty with an undefined position. On the NEXT
    // commit, the frame changed (child swapped to a no-cursor branch) so render()
    // takes the `else` branch and writes buildReturnToBottomPrefix(cursorWasShown:
    // true, ...) — which begins with hideCursorEscape (`\x1b[?25l`). So the cursor
    // that was SHOWN at the child's position must be HIDDEN when the owner unmounts.
    //
    // This is observable only at the interactive stream level: semantic frame
    // helper has FrameWriter.log === null, so log-update (and its cursor escapes)
    // never runs. We capture raw stdout write chunks (Ink's getWriteCalls pattern).
    const showChild = shallowRef(true);
    const CursorChild = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      return () => {
        // Distinct cursor column so the SHOW is unambiguous: x=5 -> cursorTo(5).
        setCursorPosition({ x: 5, y: 0 });
        return <Text>child</Text>;
      };
    });
    const HostApp = defineComponent(() => {
      return () => <Box>{showChild.value ? <CursorChild /> : <Text>no cursor here</Text>}</Box>;
    });

    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    const app = createApp(HostApp);
    app.mount({ stdout, stdin, maxFps: 0 });
    await app.waitUntilRenderFlush();

    // While the child is mounted the cursor is SHOWN at its position (x=5).
    const beforeUnmount = writes.join("");
    expect(beforeUnmount).toContain(showCursorEscape);
    expect(beforeUnmount).toContain(cursorTo(5));
    // The last visibility change so far is a SHOW (the active cursor).
    expect(beforeUnmount.lastIndexOf(showCursorEscape)).toBeGreaterThan(
      beforeUnmount.lastIndexOf(hideCursorEscape),
    );

    // Unmount the cursor owner. onScopeDispose -> setCursorPosition(undefined);
    // the next commit must HIDE the previously-shown cursor.
    const writesBeforeUnmount = writes.length;
    showChild.value = false;
    await nextTick();
    await app.waitUntilRenderFlush();

    // A HIDE escape must have been emitted on the unmount commit, and it must be
    // the LAST visibility change (the cursor is now gone — not re-shown).
    const unmountWrites = writes.slice(writesBeforeUnmount).join("");
    expect(unmountWrites).toContain(hideCursorEscape);

    const fullOutput = writes.join("");
    expect(fullOutput.lastIndexOf(hideCursorEscape)).toBeGreaterThan(
      fullOutput.lastIndexOf(showCursorEscape),
    );

    app.unmount();
  });

  test("a synchronous mount throw rethrows the ORIGINAL error even if cursor-restore also throws", async () => {
    // DEFECT 2b (Codex review): the mount path tears down on a synchronous
    // throw to re-show the cursor, but teardown's restore (mountedWriter.done()
    // -> log-update showCursor -> stdout.write("\x1b[?25h")) can ITSELF throw
    // (e.g. stdout.write fails). If that restore error escapes teardown() it
    // REPLACES the original mount error, masking the real failure. The contract:
    // a synchronous mount throw must ALWAYS rethrow the ORIGINAL error, even
    // when the best-effort cursor/screen restore also fails.
    const { stream: stdout } = makeTtyStdout();
    const stdin = makeTtyStdin();

    // Make the show-cursor restore write throw. We wrap write so that the very
    // act of restoring the cursor (the "\x1b[?25h" escape teardown emits) fails,
    // standing in for a real stdout whose write() throws during restore.
    const restoreError = new Error("stdout.write blew up during cursor restore");
    const originalWrite = stdout.write.bind(stdout);
    stdout.write = ((...args: unknown[]) => {
      if (String(args[0]).includes(showCursorEscape)) {
        throw restoreError;
      }
      return (originalWrite as (...a: unknown[]) => boolean)(...args);
    }) as NodeJS.WriteStream["write"];

    // The root ALSO throws synchronously during mount (a renderer/patch-level
    // vnode error that bypasses onErrorCaptured), with a distinctive message.
    const ThrowOnPatchApp = defineComponent(() => {
      return () => {
        const vnode = h("div");
        Object.defineProperty(vnode, "type", {
          get() {
            throw new Error("boom from vnode type getter");
          },
        });
        return vnode as never;
      };
    });

    const app = createApp(ThrowOnPatchApp);
    let caught: unknown;
    try {
      app.mount({ stdout, stdin, maxFps: 0 });
    } catch (err) {
      caught = err;
    }

    // The error propagated out of mount must be the ORIGINAL mount error, not
    // the cursor-restore error that the best-effort teardown raised.
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("boom from vnode type getter");
    expect((caught as Error).message).not.toBe(restoreError.message);
  });
});
