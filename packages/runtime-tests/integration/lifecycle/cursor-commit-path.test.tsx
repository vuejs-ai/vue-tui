// Stream-level targeted-caret transport. These tests mount a real interactive
// TTY (isTTY:true), capture raw stdout write chunks, and assert that semantic
// element-local caret requests reach the physical frame writer in the same
// committed frame.
// These tests mount a REAL interactive TTY (isTTY:true) so log-update
// actually composes the cursor escapes, then capture the raw stdout write
// chunks (like Ink's getWriteCalls) and assert the real ANSI cursor sequence.
//
// ansiEscapes.cursorTo(x) === `\x1b[${x+1}G`, so:
//   element-local x=2 -> cursorTo(2) -> "\x1b[3G"
//   after typing 'a' x=3 -> cursorTo(3) -> "\x1b[4G"
//   after a space  x=4 -> cursorTo(4) -> "\x1b[5G"
import { PassThrough } from "node:stream";
import { defineComponent, h, nextTick, shallowRef, type ComponentPublicInstance } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, Text, createApp, useCaret, useFocus, useInput, useStdout } from "@vue-tui/runtime";

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
  // Capture every physical transaction. Runtime combines adjacent writes so a
  // synchronized frame normally reaches Node as one finite chunk.
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
  const target = shallowRef<ComponentPublicInstance | null>(null);
  const focus = useFocus(target, { autoFocus: true });
  useCaret(target, {
    focus,
    position: () => ({ x: 2 + text.value.length, y: 0 }),
  });

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

  return () => (
    <Box>
      <Text ref={target}>{`> ${text.value}`}</Text>
    </Box>
  );
});

describe("cursor commit-path wiring (interactive stream level)", () => {
  test("caret is shown at the element-local position in the first committed frame", async () => {
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

    const caretOffset = output.indexOf(cursorTo(2));
    const transactionStart = output.lastIndexOf(bsu, caretOffset);
    const transactionEnd = output.indexOf(esu, caretOffset);
    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(transactionEnd).toBeGreaterThan(caretOffset);
    const firstCaretTransaction = output.slice(transactionStart + bsu.length, transactionEnd);
    expect(firstCaretTransaction).toContain(">\n");
    expect(firstCaretTransaction).toContain(cursorTo(2));
    expect(firstCaretTransaction).toContain(showCursorEscape);

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
      const target = shallowRef<ComponentPublicInstance | null>(null);
      const focus = useFocus(target, { autoFocus: true });
      useCaret(target, { focus, position: { x: 2, y: 0 } });
      const { write } = useStdout();
      writeFromHook = write;

      return () => <Text ref={target}>Hello</Text>;
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

  test.each(["inline", "fullscreen"] as const)(
    "a re-entrant stdout write cannot replace the %s frame's staged caret",
    async (mode) => {
      const text = shallowRef("abc");
      const position = shallowRef({ x: 1, y: 0 });
      let writeFromHook: ((data: string) => void) | undefined;
      const ReentrantWriteApp = defineComponent(() => {
        const focusTarget = shallowRef<ComponentPublicInstance | null>(null);
        const caretTarget = shallowRef<ComponentPublicInstance | null>(null);
        const focus = useFocus(focusTarget, { autoFocus: true });
        useCaret(caretTarget, { focus, position });
        writeFromHook = useStdout().write;
        return () => (
          <Box ref={focusTarget} height={1}>
            <Text ref={caretTarget}>{text.value}</Text>
          </Box>
        );
      });

      const { stream: stdout, writes } = makeTtyStdout();
      const stdin = makeTtyStdin();
      const originalWrite = stdout.write.bind(stdout);
      let triggerReentry = false;
      let insideReentry = false;
      stdout.write = ((...args: unknown[]) => {
        const data = String(args[0]);
        if (triggerReentry && !insideReentry && data.includes("abd")) {
          triggerReentry = false;
          insideReentry = true;
          try {
            writeFromHook?.("side output\n");
          } finally {
            insideReentry = false;
          }
        }
        return (originalWrite as (...values: unknown[]) => boolean)(...args);
      }) as NodeJS.WriteStream["write"];

      const app = createApp(ReentrantWriteApp);
      app.mount({ stdout, stdin, mode, maxFps: 0, patchConsole: false });
      try {
        await app.waitUntilRenderFlush();

        const beforeCandidate = writes.length;
        triggerReentry = true;
        position.value = { x: 2, y: 0 };
        text.value = "abd";
        await nextTick();
        await app.waitUntilRenderFlush();

        const candidateOutput = writes.slice(beforeCandidate).join("");
        expect(candidateOutput.lastIndexOf(cursorTo(2))).toBeGreaterThan(
          candidateOutput.lastIndexOf(cursorTo(1)),
        );

        const beforeFollowingFrame = writes.length;
        text.value = "abe";
        await nextTick();
        await app.waitUntilRenderFlush();

        const followingOutput = writes.slice(beforeFollowingFrame).join("");
        expect(followingOutput.lastIndexOf(cursorTo(2))).toBeGreaterThan(
          followingOutput.lastIndexOf(cursorTo(1)),
        );
      } finally {
        app.unmount();
      }
    },
  );

  test("an idle semantic-caret re-render emits no empty BSU/ESU pair", async () => {
    // If both the resolved caret and output are unchanged, the writer emits no
    // transaction. In particular, it must not wrap a no-op in synchronized
    // update markers.
    //
    // Repro note: Vue's static-VNode optimization suppresses a second commit
    // when nothing in the tree changes, so we force one with a `key` bump that
    // remounts the child (remove+insert -> onCommit) while the rendered text
    // stays byte-identical. patchConsole:false keeps the render path clean.
    const { stream: stdout, writes } = makeTtyStdout();
    const stdin = makeTtyStdin();

    let bumpKey: (() => void) | undefined;
    const KeyBumpApp = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      const focus = useFocus(target, { autoFocus: true });
      useCaret(target, { focus, position: { x: 2, y: 0 } });
      const tick = shallowRef(0);
      bumpKey = () => {
        tick.value++;
      };
      return () => <Box>{h(Text, { key: tick.value, ref: target }, () => "Hello")}</Box>;
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

  test("unmounting the focused caret owner emits HIDE after SHOW", async () => {
    const showChild = shallowRef(true);
    const CursorChild = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      const focus = useFocus(target, { autoFocus: true });
      useCaret(target, { focus, position: { x: 5, y: 0 } });
      return () => <Text ref={target}>child</Text>;
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

    // Disposing the focus-bound owner makes the next commit hide the caret.
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
