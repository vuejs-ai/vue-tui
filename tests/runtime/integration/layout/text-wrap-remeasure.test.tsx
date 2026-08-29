import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// Changing a <Text>'s `wrap` prop at runtime changes how tall the text MEASURES
// (truncate = 1 row; wrap = 3 rows for this content/width), but `wrap` is not a
// yoga prop — it only feeds the text measure func. The measure result is cached
// by yoga, so a wrap-only change must re-mark the text dirty or yoga keeps the
// stale height while paint uses the new wrap mode → layout and paint disagree:
// stale blank rows (wrap→truncate) or stranded siblings.
//
// The expected fresh layouts for the two modes are:
//   wrap     -> "aaaa\nbbbb\ncccc\nZZZZ"
//   truncate -> "aaaa …\nZZZZ"

// Box width 6, column layout. "aaaa bbbb cccc" is 14 cols.
//  - wrap:     wraps to 3 rows ("aaaa" / "bbbb" / "cccc"), sentinel on row 4
//  - truncate: 1 row ("aaaa …"), sentinel on row 2
const CONTENT = "aaaa bbbb cccc";

test("wrap -> truncate re-measures: text collapses, sentinel rises (no stale blank rows)", async () => {
  const wrap = shallowRef<"wrap" | "truncate">("wrap");

  const Dynamic = defineComponent(() => () => (
    <Box width={6} flexDirection="column">
      <Text wrap={wrap.value}>{CONTENT}</Text>
      <Text>ZZZZ</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 40 });

  // Initial wrap layout: 3 wrapped rows + sentinel.
  expect(lastFrame()).toBe("aaaa\nbbbb\ncccc\nZZZZ");

  wrap.value = "truncate";
  await nextTick();

  // After re-measure the text is one truncated row and the sentinel rises to
  // row 2; a stale three-row height would leave blank rows and strand it.
  expect(lastFrame()).toBe("aaaa …\nZZZZ");
});

test("truncate -> wrap re-measures: text grows to wrapped rows, sentinel descends", async () => {
  const wrap = shallowRef<"wrap" | "truncate">("truncate");

  const Dynamic = defineComponent(() => () => (
    <Box width={6} flexDirection="column">
      <Text wrap={wrap.value}>{CONTENT}</Text>
      <Text>ZZZZ</Text>
    </Box>
  ));

  const { lastFrame } = await render(Dynamic, { columns: 40 });

  // Initial truncate layout: 1 row + sentinel.
  expect(lastFrame()).toBe("aaaa …\nZZZZ");

  wrap.value = "wrap";
  await nextTick();

  // After re-measure the text occupies three wrapped rows and the sentinel
  // descends to row 4; a stale one-row height would overwrite it.
  expect(lastFrame()).toBe("aaaa\nbbbb\ncccc\nZZZZ");
});
