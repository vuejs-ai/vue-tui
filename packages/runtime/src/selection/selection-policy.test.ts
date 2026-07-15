import stringWidth from "string-width";
import { describe, expect, test } from "vite-plus/test";
import {
  createInternalSelectionPolicy,
  type InternalSelectionSnapshot,
} from "./selection-policy.ts";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function makeSnapshot(
  text: string,
  options: {
    readonly width?: number;
    readonly xOffset?: number;
    readonly yOffset?: number;
    readonly localXOffset?: number;
    readonly visible?: (sourceStart: number, x: number, y: number) => boolean;
  } = {},
): InternalSelectionSnapshot {
  const width = options.width ?? 80;
  const xOffset = options.xOffset ?? 0;
  const yOffset = options.yOffset ?? 0;
  const localXOffset = options.localXOffset ?? 0;
  const boundaries = [0];
  const stops: Array<{ offset: number; x: number; y: number }> = [
    { offset: 0, x: localXOffset, y: 0 },
  ];
  const cells: Array<{
    id: number;
    start: number;
    end: number;
    x: number;
    y: number;
    width: number;
  }> = [];
  const visibleCellIds = new Set<number>();
  let x = 0;
  let y = 0;

  for (const part of segmenter.segment(text)) {
    const start = part.index;
    const end = start + part.segment.length;
    boundaries.push(end);
    if (part.segment === "\n") {
      y++;
      x = 0;
      stops.push({ offset: end, x: localXOffset, y });
      continue;
    }

    const cellWidth = stringWidth(part.segment);
    if (cellWidth > 0 && x > 0 && x + cellWidth > width) {
      y++;
      x = 0;
      // A soft wrap is a second visual stop for the same logical boundary.
      stops.push({ offset: start, x: localXOffset, y });
    }
    if (cellWidth > 0) {
      const id = cells.length;
      cells.push({
        id,
        start,
        end,
        x: localXOffset + x,
        y,
        width: cellWidth,
      });
      if (options.visible?.(start, xOffset + localXOffset + x, yOffset + y) ?? true) {
        visibleCellIds.add(id);
      }
      x += cellWidth;
    }
    stops.push({ offset: end, x: localXOffset + x, y });
  }

  return {
    text,
    boundaries,
    surfaceOrigin: { x: xOffset, y: yOffset },
    visibleCellIds,
    stops,
    cells,
  };
}

describe("API-neutral Fullscreen text selection journeys", () => {
  test("copies semantic text with explicit newlines and without soft-wrap newlines", () => {
    const policy = createInternalSelectionPolicy();
    const text = "alpha beta\n你🙂 gamma";
    policy.accept(makeSnapshot(text, { width: 6 }));

    expect(
      policy.setSelection({
        anchor: text.indexOf("beta"),
        extent: text.indexOf("🙂") + "🙂".length,
      }),
    ).toBe("changed");
    expect(policy.selectedText).toBe("beta\n你🙂");
  });

  test("reconstructs the F6 down point and extends over complete wide graphemes", () => {
    const policy = createInternalSelectionPolicy();
    policy.accept(makeSnapshot("ab你c", { width: 3 }));

    expect(
      policy.drag({
        phase: "start",
        surface: { x: 1, y: 1 },
        movement: { x: 0, y: 1 },
      }),
    ).toBe("changed");
    expect(policy.selectedText).toBe("b你");
    expect(policy.drag({ phase: "end", surface: { x: 1, y: 1 }, movement: { x: 0, y: 0 } })).toBe(
      "unchanged",
    );

    expect(
      policy.drag({
        phase: "start",
        surface: { x: 0, y: 0 },
        movement: { x: -2, y: -1 },
      }),
    ).toBe("changed");
    expect(policy.selectedText).toBe("ab你");
  });

  test("treats a wide-glyph continuation cell as its trailing click boundary", () => {
    const policy = createInternalSelectionPolicy();
    policy.accept(makeSnapshot("ab你c", { width: 3 }));

    expect(policy.click({ x: 1, y: 1 })).toBe("changed");
    expect(policy.range).toEqual({ anchor: 3, extent: 3 });
  });

  test("translates nonzero surface origins for pointer selection", () => {
    const policy = createInternalSelectionPolicy();
    policy.accept(makeSnapshot("ab你c", { width: 3, xOffset: 10, yOffset: 5 }));

    expect(policy.click({ x: 11, y: 6 })).toBe("changed");
    expect(policy.range).toEqual({ anchor: 3, extent: 3 });
    expect(
      policy.drag({
        phase: "start",
        surface: { x: 11, y: 6 },
        movement: { x: 1, y: 1 },
      }),
    ).toBe("changed");
    expect(policy.drag({ phase: "move", surface: { x: 12, y: 6 }, movement: { x: 2, y: 0 } })).toBe(
      "changed",
    );
    expect(policy.selectedText).toBe("ab你c");
  });

  test("keeps the exact visual row at a duplicated soft-wrap boundary", () => {
    const click = createInternalSelectionPolicy();
    click.accept(makeSnapshot("ab你c", { width: 4 }));

    expect(click.click({ x: 3, y: 0 })).toBe("changed");
    expect(click.range).toEqual({ anchor: 3, extent: 3 });
    expect(click.move("line-start", false)).toBe("changed");
    expect(click.range).toEqual({ anchor: 0, extent: 0 });

    const drag = createInternalSelectionPolicy();
    drag.accept(makeSnapshot("ab你c", { width: 4 }));
    expect(
      drag.drag({
        phase: "start",
        surface: { x: 3, y: 0 },
        movement: { x: 3, y: 0 },
      }),
    ).toBe("changed");
    expect(drag.range).toEqual({ anchor: 0, extent: 3 });
    expect(drag.move("line-end", true)).toBe("unchanged");
    expect(drag.range).toEqual({ anchor: 0, extent: 3 });

    const extendedClick = createInternalSelectionPolicy();
    extendedClick.accept(makeSnapshot("ab你c", { width: 4 }));
    extendedClick.setSelection({ anchor: 0, extent: 1 });
    expect(extendedClick.click({ x: 3, y: 0 }, true)).toBe("changed");
    expect(extendedClick.range).toEqual({ anchor: 0, extent: 3 });
    expect(extendedClick.move("line-end", true)).toBe("unchanged");
    expect(extendedClick.range).toEqual({ anchor: 0, extent: 3 });
  });

  test("pointer hit testing ignores covered cells while keyboard selection retains their text", () => {
    const policy = createInternalSelectionPolicy();
    policy.accept(
      makeSnapshot("overlay", {
        visible: (sourceStart) => sourceStart !== 2 && sourceStart !== 3,
      }),
    );

    // The physical cell at x=2 was covered by a later write, so pointer snapping
    // chooses the nearest surviving boundary instead of selecting stale paint.
    expect(policy.click({ x: 2, y: 0 })).toBe("changed");
    expect(policy.range).toEqual({ anchor: 2, extent: 2 });

    policy.setSelection({ anchor: 1, extent: 1 });
    expect(policy.move("forward", true)).toBe("changed");
    expect(policy.move("forward", true)).toBe("changed");
    expect(policy.move("forward", true)).toBe("changed");
    expect(policy.selectedText).toBe("ver");
  });

  test("moves vertically through wrapped rows without inserting copied line breaks", () => {
    const policy = createInternalSelectionPolicy();
    const text = "abcdefghij";
    policy.accept(makeSnapshot(text, { width: 4 }));
    policy.setSelection({ anchor: 2, extent: 2 });

    expect(policy.move("down", true)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 2, extent: 6 });
    expect(policy.move("down", true)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 2, extent: 10 });
    expect(policy.selectedText).toBe("cdefghij");
  });

  test("retains drag and vertical-navigation state across compatible accepted paints", () => {
    const policy = createInternalSelectionPolicy();
    const wrapped = makeSnapshot("abcdef", { width: 4 });
    policy.accept(wrapped);
    policy.setSelection({ anchor: 3, extent: 3 });
    expect(policy.move("forward", false)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 4, extent: 4 });

    policy.accept(makeSnapshot("abcdef", { width: 4 }));
    expect(policy.move("up", false)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 0, extent: 0 });

    const ragged = makeSnapshot("abcd\nx\nwxyz");
    policy.accept(ragged);
    policy.setSelection({ anchor: 3, extent: 3 });
    expect(policy.move("down", false)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 6, extent: 6 });
    policy.accept(makeSnapshot("abcd\nx\nwxyz"));
    expect(policy.move("down", false)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 10, extent: 10 });

    const drag = createInternalSelectionPolicy();
    drag.accept(makeSnapshot("abcdefgh", { width: 4 }));
    expect(
      drag.drag({
        phase: "start",
        surface: { x: 1, y: 1 },
        movement: { x: 0, y: 1 },
      }),
    ).toBe("changed");
    drag.accept(makeSnapshot("abcdefgh", { width: 4 }));
    expect(drag.drag({ phase: "move", surface: { x: 3, y: 1 }, movement: { x: 2, y: 0 } })).toBe(
      "changed",
    );
    expect(drag.selectedText).toBe("bcdefgh");
  });

  test("keeps the original visual column while crossing a shorter row", () => {
    const policy = createInternalSelectionPolicy();
    const text = "abcd\nx\nabcd";
    policy.accept(makeSnapshot(text, { width: 4 }));
    policy.setSelection({ anchor: 3, extent: 3 });

    expect(policy.move("down", true)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 3, extent: 6 });
    expect(policy.move("down", true)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 3, extent: 10 });
  });

  test("keeps the surface column when local layout and origin shift together", () => {
    const policy = createInternalSelectionPolicy();
    const text = "abcd\nx\nabcd";
    policy.accept(makeSnapshot(text, { width: 4, xOffset: 10 }));
    policy.setSelection({ anchor: 3, extent: 3 });

    expect(policy.move("down", true)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 3, extent: 6 });

    policy.accept(makeSnapshot(text, { width: 4, xOffset: 8, localXOffset: 2 }));
    expect(policy.move("down", true)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 3, extent: 10 });
  });

  test("drops the preferred surface column when the extent stop moves", () => {
    const policy = createInternalSelectionPolicy();
    const text = "abcd\nx\nabcd";
    policy.accept(makeSnapshot(text, { width: 4 }));
    policy.setSelection({ anchor: 3, extent: 3 });

    expect(policy.move("down", true)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 3, extent: 6 });

    policy.accept(makeSnapshot(text, { width: 4, xOffset: 1 }));
    expect(policy.move("down", true)).toBe("changed");
    expect(policy.range).toEqual({ anchor: 3, extent: 8 });
  });

  test("retains a selected prefix through append, resize, and clipping changes", () => {
    const policy = createInternalSelectionPolicy();
    const initial = "build started\nstep one\nstep two";
    policy.accept(makeSnapshot(initial, { width: 12 }));
    policy.setSelection({ anchor: 0, extent: "build started".length });

    expect(policy.accept(makeSnapshot(initial, { width: 7, yOffset: -2 }))).toBe("unchanged");
    expect(policy.selectedText).toBe("build started");

    const appended = `${initial}\nstep three`;
    expect(policy.accept(makeSnapshot(appended, { width: 7, yOffset: -3 }))).toBe("unchanged");
    expect(policy.selectedText).toBe("build started");
  });

  test("clears rather than guessing after a change before a selected endpoint", () => {
    const policy = createInternalSelectionPolicy();
    const initial = "status: healthy\nqueue: 3";
    policy.accept(makeSnapshot(initial));
    policy.setSelection({ anchor: 8, extent: 15 });

    const replaced = "status: failed\nqueue: 3";
    expect(policy.accept(makeSnapshot(replaced))).toBe("changed");
    expect(policy.range).toBeNull();
    expect(policy.selectedText).toBe("");
  });

  test("handles a long clipped transcript without limiting logical selection to visible rows", () => {
    const policy = createInternalSelectionPolicy();
    const lines = Array.from(
      { length: 500 },
      (_, index) => `job-${index.toString().padStart(3, "0")}`,
    );
    const text = lines.join("\n");
    policy.accept(
      makeSnapshot(text, {
        width: 8,
        visible: (_start, _x, y) => y >= 240 && y < 250,
      }),
    );
    const anchor = text.indexOf("job-120");
    const extent = text.indexOf("job-380") + "job-380".length;

    expect(policy.setSelection({ anchor, extent })).toBe("changed");
    expect(policy.selectedText.startsWith("job-120\njob-121")).toBe(true);
    expect(policy.selectedText.endsWith("job-379\njob-380")).toBe(true);
  });

  test("does not conflate workbench collection state with detail-text selection", () => {
    const policy = createInternalSelectionPolicy();
    let activeItem = 4;
    const detail = "service: payments\nstate: degraded";
    policy.accept(makeSnapshot(detail, { width: 20 }));
    policy.setSelection({ anchor: detail.indexOf("degraded"), extent: detail.length });

    expect(policy.selectedText).toBe("degraded");
    expect(activeItem).toBe(4);
    activeItem = 5;
    expect(policy.selectedText).toBe("degraded");
  });

  test("rejects offsets inside a grapheme instead of splitting it", () => {
    const policy = createInternalSelectionPolicy();
    policy.accept(makeSnapshot("A🙂B"));

    expect(() => policy.setSelection({ anchor: 1, extent: 2 })).toThrow(
      "selection endpoints must be complete-grapheme boundaries",
    );
  });

  test("reports unavailable without a successful semantic document", () => {
    const policy = createInternalSelectionPolicy();

    expect(policy.selectAll()).toBe("unavailable");
    expect(policy.move("forward", true)).toBe("unavailable");
    expect(policy.click({ x: 0, y: 0 })).toBe("unavailable");
    expect(policy.drag({ phase: "start", surface: { x: 1, y: 0 }, movement: { x: 1, y: 0 } })).toBe(
      "unavailable",
    );
  });
});
