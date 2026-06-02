import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("display flex", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box display="flex">
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("X");
});

test("display none", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box display="none">
          <Text>Kitty!</Text>
        </Box>
        <Text>Doggo</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Doggo");
});

// Skipped: display flex - concurrent
// Skipped: display none - concurrent

test("display none after visible sibling does not corrupt output", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>AAA</Text>
        <Box display="none">
          <Text>BBBBB</Text>
        </Box>
        <Text>ZZ</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AAAZZ");
});

test("display none multi-line text adds no extra rows", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>top</Text>
        <Box display="none">
          <Text>{"h1\nh2\nh3"}</Text>
        </Box>
        <Text>bottom</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("top\nbottom");
});

test("display none box does not paint its border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>AAA</Text>
        <Box display="none" borderStyle="round">
          <Text>X</Text>
        </Box>
        <Text>ZZ</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AAAZZ");
});

// A21: an off-spec PRESENT `display` value (anything that isn't 'flex') must HIDE,
// matching Ink's applyDisplayStyles (styles.ts): `display === 'flex' ? FLEX : NONE`.
// The public prop type is 'flex' | 'none', so an off-spec value is only reachable
// via a TS bypass; it must still align with Ink and hide.
test("display off-spec present value (block) hides like Ink", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box display={"block" as never}>
          <Text>Kitty!</Text>
        </Box>
        <Text>Doggo</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Doggo");
});

// A21 (non-string variant): a PRESENT non-string `display` value (e.g. a number,
// reachable only via a TS bypass — the public prop type is 'flex' | 'none') must
// HIDE, matching Ink's `display === 'flex' ? FLEX : NONE` where `5 === 'flex'` is
// false → DISPLAY_NONE. This pins the guard change from `typeof v === "string" && …`
// to `v != null && v !== "flex"`: under the old typeof guard a number stays VISIBLE
// (RED), under the current null-check guard it hides like Ink (GREEN). null/undefined
// (removed) still resets to visible (A19), exercised by prop-reset.test.tsx.
test("display non-string present value (number) hides like Ink", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box display={5 as never}>
          <Text>Kitty!</Text>
        </Box>
        <Text>Doggo</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Child text must NOT appear: the present number value hides the box.
  expect(lastFrame({ trimLines: true })).not.toContain("Kitty!");
  expect(lastFrame({ trimLines: true })).toBe("Doggo");
});
