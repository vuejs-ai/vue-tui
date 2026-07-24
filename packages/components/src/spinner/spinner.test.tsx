import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import Spinner from "./spinner.vue";
import { PRESETS } from "./spinners.ts";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const dots = PRESETS.dots.frames;

describe("Spinner", () => {
  test("renders a dots glyph by default", async () => {
    const r = await render(Spinner);
    await delay(50);
    const out = r.lastFrame() ?? "";
    expect(out.length).toBeGreaterThan(0);
    expect(dots.some((g) => out.includes(g))).toBe(true);
    r.unmount();
  });

  test("animates through more than two distinct glyphs over time", async () => {
    const r = await render(Spinner);
    await delay(250);
    const distinct = new Set(r.frames.map((frame) => frame.dynamic.trim()).filter(Boolean));
    expect(distinct.size).toBeGreaterThan(2);
    r.unmount();
  });

  test("renders a visible glyph", async () => {
    const r = await render(Spinner);
    await delay(50);
    expect((r.lastFrame() ?? "").trim().length).toBeGreaterThan(0);
    r.unmount();
  });

  test("type='line' renders a line glyph", async () => {
    const r = await render(Spinner, {
      props: { type: "line" },
    });
    await delay(50);
    const out = r.lastFrame() ?? "";
    expect(PRESETS.line.frames.some((g) => out.includes(g))).toBe(true);
    r.unmount();
  });

  test("custom frames override the preset", async () => {
    const r = await render(Spinner, {
      props: { frames: ["@"] },
    });
    await delay(50);
    expect((r.lastFrame() ?? "").includes("@")).toBe(true);
    r.unmount();
  });

  test("color tints the glyph but not the label", async () => {
    const chalk = (await import("chalk")).default;
    const r = await render(Spinner, {
      props: { frames: ["⠋"], color: "green", label: "Loading" },
    });
    await delay(20);
    const out = r.lastFrame() ?? "";
    expect(out).toContain(chalk.green("⠋"));
    expect(out).toContain(" Loading");
    expect(out).not.toContain(chalk.green("Loading"));
    r.unmount();
  });

  test("label renders after the glyph with a separating space", async () => {
    const r = await render(Spinner, {
      props: { frames: ["⠋"], label: "Done" },
    });
    await delay(20);
    expect(r.lastFrame() ?? "").toContain("⠋ Done");
    r.unmount();
  });

  test("no label renders the glyph only", async () => {
    const r = await render(Spinner, {
      props: { frames: ["⠋"] },
    });
    await delay(20);
    expect((r.lastFrame() ?? "").trim()).toBe("⠋");
    r.unmount();
  });
});
