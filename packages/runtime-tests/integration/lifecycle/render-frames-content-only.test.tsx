import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Text, useInput } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";

// The deterministic host's `frames[]` / `lastFrame()` observations contain
// renderer output (including SGR styling), not output-writer side effects. The
// runtime reports those commits independently from stdout, so bracketed-paste
// lifecycle escapes must not leak into `frames[]`.
//
// Active semantic input enables bracketed-paste mode, which writes the `\x1b[?2004h`
// enable sequence to stdout (gated on stdout.isTTY, which the testing helper's
// modeled stdout is — render.ts setBracketedPasteMode). The control sequence
// belongs only to terminal output; `frames[]` contains rendered content.
test("render() frames exclude bracketed-paste lifecycle escapes", async () => {
  const App = defineComponent(() => {
    useInput(() => "continue");
    return () => <Text>content</Text>;
  });

  const { frames, lastFrame } = await render(App);

  // The rendered content is observable.
  expect(lastFrame()).toBe("content");

  // The bracketed-paste enable escape was written to stdout (byte-faithful to
  // Ink) but must NEVER appear in any captured frame.
  for (const frame of frames) {
    expect(frame.dynamic).not.toContain("\x1b[?2004h");
    expect(frame.dynamic).not.toContain("\x1b[?2004l");
    expect(frame.staticOutput).not.toContain("\x1b[?2004h");
    expect(frame.staticOutput).not.toContain("\x1b[?2004l");
  }
});
