import { blankCell, type Cell, type Hyperlink } from "./cell.ts";
import { defaultColor, defaultStyle, type Color, type SgrPair, type Style } from "./style.ts";

const ansi16Color = 0x0100_0000;
const ansi256Color = 0x0200_0000;
const rgbColor = 0x0300_0000;
const colorKindMask = 0xff00_0000;

/** The rows that differ between two pictures. */
export interface FrameDifference {
  readonly sizeChanged: boolean;
  readonly rows: readonly number[];
}

function packColor(color: Color): number {
  switch (color.kind) {
    case "default":
      return 0;
    case "ansi16":
      return ansi16Color | color.index;
    case "ansi256":
      return ansi256Color | color.index;
    case "rgb":
      return rgbColor | (color.red << 16) | (color.green << 8) | color.blue;
  }
}

function unpackColor(value: number): Color {
  switch (value & colorKindMask) {
    case 0:
      return defaultColor;
    case ansi16Color:
      return { kind: "ansi16", index: value & 0xff };
    case ansi256Color:
      return { kind: "ansi256", index: value & 0xff };
    case rgbColor:
      return {
        kind: "rgb",
        red: (value >> 16) & 0xff,
        green: (value >> 8) & 0xff,
        blue: value & 0xff,
      };
    default:
      throw new Error("Frame contains an unknown color encoding.");
  }
}

function sameSgrPairs(left: readonly SgrPair[], right: readonly SgrPair[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every(
    (pair, index) => pair.code === right[index]!.code && pair.endCode === right[index]!.endCode,
  );
}

/**
 * One complete rendered picture stored in parallel arrays rather than an object grid.
 *
 * The painter writes it once; surfaces retain it as their previous picture and compare it
 * through {@link Frame.diff}. The compact storage keeps blank and styled cells equally cheap.
 */
export class Frame {
  readonly width: number;
  readonly height: number;

  private readonly graphemes: string[];
  private readonly widths: Uint8Array;
  private readonly foregrounds: Uint32Array;
  private readonly backgrounds: Uint32Array;
  private readonly attributes: Uint16Array;
  private readonly extraSgr: Array<readonly SgrPair[]>;
  private readonly links: Array<Hyperlink | undefined>;

  constructor(width: number, height: number) {
    const cellCount = width * height;

    this.width = width;
    this.height = height;
    this.graphemes = Array<string>(cellCount).fill(blankCell.grapheme);
    this.widths = new Uint8Array(cellCount).fill(blankCell.width);
    this.foregrounds = new Uint32Array(cellCount);
    this.backgrounds = new Uint32Array(cellCount);
    this.attributes = new Uint16Array(cellCount);
    this.extraSgr = Array<readonly SgrPair[]>(cellCount).fill(defaultStyle.extraSgr);
    this.links = Array<Hyperlink | undefined>(cellCount).fill(undefined);
  }

  get(x: number, y: number): Cell {
    const index = y * this.width + x;
    const style: Style = {
      foreground: unpackColor(this.foregrounds[index]!),
      background: unpackColor(this.backgrounds[index]!),
      attrs: this.attributes[index]!,
      extraSgr: this.extraSgr[index]!,
    };
    return {
      grapheme: this.graphemes[index]!,
      width: this.widths[index]!,
      style,
      link: this.links[index],
    };
  }

  set(x: number, y: number, cell: Cell): void {
    const index = y * this.width + x;
    this.graphemes[index] = cell.grapheme;
    this.widths[index] = cell.width;
    this.foregrounds[index] = packColor(cell.style.foreground);
    this.backgrounds[index] = packColor(cell.style.background);
    this.attributes[index] = cell.style.attrs;
    this.extraSgr[index] = cell.style.extraSgr;
    this.links[index] = cell.link;
  }

  hasContent(): boolean {
    for (let index = 0; index < this.widths.length; index++) {
      if (this.widths[index] === 0) continue;
      if (
        this.graphemes[index]!.trimEnd() !== "" ||
        this.foregrounds[index] !== 0 ||
        this.backgrounds[index] !== 0 ||
        this.attributes[index] !== 0 ||
        this.extraSgr[index]!.length !== 0 ||
        this.links[index] !== undefined
      ) {
        return true;
      }
    }
    return false;
  }

  /** The sole comparison operation for rendered pictures. */
  static diff(previous: Frame | undefined, next: Frame): FrameDifference {
    if (!previous || previous.width !== next.width || previous.height !== next.height) {
      return {
        sizeChanged: previous !== undefined,
        rows: Array.from({ length: next.height }, (_, row) => row),
      };
    }

    const rows: number[] = [];
    for (let row = 0; row < next.height; row++) {
      for (let column = 0; column < next.width; column++) {
        const index = row * next.width + column;
        if (Frame.sameCellAt(previous, next, index)) continue;
        rows.push(row);
        break;
      }
    }
    return { sizeChanged: false, rows };
  }

  private static sameCellAt(a: Frame, b: Frame, index: number): boolean {
    const leftLink = a.links[index];
    const rightLink = b.links[index];
    return (
      a.graphemes[index] === b.graphemes[index] &&
      a.widths[index] === b.widths[index] &&
      a.foregrounds[index] === b.foregrounds[index] &&
      a.backgrounds[index] === b.backgrounds[index] &&
      a.attributes[index] === b.attributes[index] &&
      sameSgrPairs(a.extraSgr[index]!, b.extraSgr[index]!) &&
      (leftLink === rightLink ||
        (leftLink !== undefined &&
          rightLink !== undefined &&
          leftLink.parameters === rightLink.parameters &&
          leftLink.target === rightLink.target))
    );
  }
}
