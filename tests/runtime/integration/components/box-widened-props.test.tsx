// The renderer already carried these Ink-complete behaviors; only the public
// prop declaration and its closed validator excluded them. These tests pin the
// widened public contract so the narrowing cannot come back silently.

import { defineComponent, type VNodeChild } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

async function frame(node: () => VNodeChild): Promise<string> {
  const { lastFrame, dispose } = await render(defineComponent(() => node));
  const out = lastFrame();
  dispose();
  return out;
}

test.each(["double", "bold", "singleDouble", "doubleSingle", "classic", "arrow"] as const)(
  "borderStyle %s draws a frame",
  async (borderStyle) => {
    const out = await frame(() => (
      <Box borderStyle={borderStyle} width={5} height={3}>
        <Text>x</Text>
      </Box>
    ));
    const top = out.split("\n")[0] ?? "";
    expect(top.replace(/\[[0-9;]*m/g, "").trim().length).toBeGreaterThan(0);
  },
);

test("borderStyle accepts a complete custom frame", async () => {
  const out = await frame(() => (
    <Box
      borderStyle={{
        topLeft: "A",
        top: "B",
        topRight: "C",
        right: "D",
        bottomRight: "E",
        bottom: "F",
        bottomLeft: "G",
        left: "H",
      }}
      width={4}
      height={3}
    />
  ));
  const lines = out.replace(/\[[0-9;]*m/g, "").split("\n");
  expect(lines[0]?.trimEnd()).toBe("ABBC");
  expect(lines[2]?.trimEnd()).toBe("GFFE");
});

test("borderStyle rejects an unknown name and an incomplete frame", async () => {
  await expect(
    render(defineComponent(() => () => <Box borderStyle={"hexagon" as never} />)),
  ).rejects.toThrow('prop "borderStyle"');
  await expect(
    render(defineComponent(() => () => <Box borderStyle={{ topLeft: "A" } as never} />)),
  ).rejects.toThrow('missing a string "top" character');
  await expect(
    render(
      defineComponent(() => () => (
        <Box
          borderStyle={
            {
              topLeft: "A",
              top: "B",
              topRight: "C",
              right: "D",
              bottomRight: "E",
              bottom: "F",
              bottomLeft: "G",
              left: "H",
              middle: "X",
            } as never
          }
        />
      )),
    ),
  ).rejects.toThrow("unknown character");
});

test("per-edge border colors override the general one", async () => {
  const out = await frame(() => (
    <Box borderStyle="single" borderColor="red" borderTopColor="green" width={4} height={3} />
  ));
  const [top, , bottom] = out.split("\n");
  // The top edge carries a different SGR sequence from the bottom edge.
  expect(top).not.toBe(bottom);
  expect(top).toContain("[");
});

test("per-edge border background and dim are accepted", async () => {
  const out = await frame(() => (
    <Box
      borderStyle="single"
      borderBackgroundColor="blue"
      borderBottomBackgroundColor="magenta"
      borderDimColor
      borderTopDimColor={false}
      width={4}
      height={3}
    />
  ));
  expect(out).toContain("[");
});

test("alignContent distributes wrapped lines on the cross axis", async () => {
  const wrapped = (alignContent: "flex-start" | "flex-end") => (
    <Box flexWrap="wrap" width={3} height={4} alignContent={alignContent}>
      <Box width={3} height={1}>
        <Text>a</Text>
      </Box>
      <Box width={3} height={1}>
        <Text>b</Text>
      </Box>
    </Box>
  );
  const start = (await frame(() => wrapped("flex-start"))).split("\n");
  const end = (await frame(() => wrapped("flex-end"))).split("\n");
  expect(start.findIndex((line) => line.includes("a"))).toBeLessThan(
    end.findIndex((line) => line.includes("a")),
  );
});

test("aspectRatio derives the missing dimension", async () => {
  const out = await frame(() => (
    <Box borderStyle="single" width={8} aspectRatio={4}>
      <Text>x</Text>
    </Box>
  ));
  // width 8 / ratio 4 => height 2.
  expect(
    out
      .replace(/\[[0-9;]*m/g, "")
      .split("\n")
      .filter((l) => l.trim()).length,
  ).toBe(2);
});

test("rejects a non-boolean per-edge dim and an unknown alignContent", async () => {
  await expect(
    render(defineComponent(() => () => <Box borderTopDimColor={"yes" as never} />)),
  ).rejects.toThrow('prop "borderTopDimColor"');
  await expect(
    render(defineComponent(() => () => <Box alignContent={"middle" as never} />)),
  ).rejects.toThrow('prop "alignContent"');
});
