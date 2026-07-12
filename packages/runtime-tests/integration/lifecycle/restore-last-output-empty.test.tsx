/**
 * Ink parity: restoreLastOutput must fall back from an EMPTY `lastOutputToRender`.
 *
 * When an external stdout write (console.log / useStdout().write) happens while a
 * frame is on screen, Ink re-emits the active frame afterwards:
 *
 *   this.log(this.lastOutputToRender || this.lastOutput + '\n')   // ink.tsx:507
 *
 * With `||`, an EMPTY `lastOutputToRender` falls back to `lastOutput + '\n'`; when
 * both are empty that is "\n", so Ink still emits one byte. The buggy vue code used
 * `??`, which only falls back on null/undefined and let an empty string through —
 * restoring NOTHING and diverging from Ink (and from vue's own mountedClear at
 * render.ts:668, which already uses `||`).
 *
 * Reachable scenario exercised here: SCREEN-READER mode with an empty-rendering
 * component. In the SR commit branch (render.ts:845+, Ink parity G59) the frame is
 * the wrapped SR output with NO appended "\n", so an empty frame leaves
 * lastOutputToRender === "" (and the unchanged-empty-frame early-return at
 * render.ts:870 never overwrites the "" initial value). When an external write then
 * triggers restoreLastOutput, both lastOutputToRender and lastOutput are "", so the
 * restore chunk must be "\n" (Ink) rather than "" (buggy ??).
 *
 * Uses createApp with a fake TTY stream so the real live
 * writeToStdout -> restoreLastOutput path runs. Test config forces CI:"false".
 */
import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, useStdout } from "@vue-tui/runtime";

function makeTtyStream(): NodeJS.WriteStream & { chunks: string[] } {
  const s = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(s, { columns: 80, rows: 24, isTTY: true, chunks: [] as string[] });
  s.on("data", (chunk: Buffer) => s.chunks.push(chunk.toString()));
  return s;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode() {
      return s;
    },
    setEncoding() {
      return s;
    },
  });
  (s as { ref?: () => void }).ref = () => {};
  (s as { unref?: () => void }).unref = () => {};
  return s;
}

test("restoreLastOutput re-emits lastOutput+'\\n' when lastOutputToRender is empty (Ink parity ink.tsx:507)", async () => {
  const stdout = makeTtyStream();
  const stderr = makeTtyStream();
  const stdin = makeFakeStdin();

  let writeRef: ((data: string) => void) | undefined;

  // Renders nothing -> empty SR frame -> lastOutputToRender stays "".
  const App = defineComponent(() => {
    const { write } = useStdout();
    writeRef = write;
    return () => null;
  });

  const app = createApp(App);
  app.mount({
    stdout,
    stdin,
    stderr,
    isScreenReaderEnabled: true,
  });

  // Let the initial (empty) SR commit settle.
  await new Promise<void>((r) => setTimeout(r, 60));

  expect(writeRef, "useStdout().write should be available after mount").toBeDefined();

  // Capture only the writes produced by this external-write call.
  stdout.chunks.length = 0;
  writeRef!("external-data\n");

  const output = stdout.chunks.join("");

  // The external data itself must be present.
  expect(output).toContain("external-data");

  // Everything after the external data is the restore. log-update always emits a
  // cursor-hide escape (\x1b[?25l) on its first write; the load-bearing difference
  // is whether the restored CONTENT ("\n", from `lastOutput + "\n"`) follows it.
  // With the Ink `||` fallback the restore re-emits "\n"; the buggy `??` path passed
  // the empty string straight through, so log-update's hasChanges() short-circuited
  // and NO content newline was written. Strip the cursor-toggle/sync escapes and
  // assert the restored content newline survives.
  const afterData = output.slice(output.indexOf("external-data") + "external-data\n".length);
  const restoredContent = afterData
    .replace("\x1b[?25l", "") // log-update first-render cursor hide
    .replace("\x1b[?25h", "") // possible cursor show
    .replace("\x1b[?2026l", "") // ESU
    .replace("\x1b[?2026h", ""); // BSU (defensive)
  expect(
    restoredContent,
    `restore must re-emit Ink's "\\n" fallback (lastOutput + "\\n"); buggy ?? emitted no content. afterData=${JSON.stringify(afterData)} full=${JSON.stringify(output)}`,
  ).toBe("\n");

  app.unmount();
});
