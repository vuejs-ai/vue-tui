// Repository-internal PTY, terminal-emulation, observation, and visual-review artifacts.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import headless, { type IBufferCell, type Terminal as TerminalType } from "@xterm/headless";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const pty = require("node-pty") as typeof import("node-pty");
const { Terminal } = headless;

interface ProfileTemplate {
  id: string;
  terminal: {
    term: string;
    colorterm: string;
    columns: number;
    rows: number;
    scrollback: number;
    unicodeVersion: string;
  };
  renderer: {
    format: string;
    cellWidthPx: number;
    cellHeightPx: number;
    fontFamily: string;
    fontSizePx: number;
    drawBoldTextInBrightColors: boolean;
    foreground: string;
    background: string;
    cursor: string;
  };
  limits: {
    pixelRendering: string;
    terminalCoverage: string;
  };
}

const profileTemplate = JSON.parse(
  readFileSync(fileURLToPath(new URL("./profile.json", import.meta.url)), "utf8"),
) as ProfileTemplate;

const ANSI_16 = [
  "#000000",
  "#cd0000",
  "#00cd00",
  "#cdcd00",
  "#0000ee",
  "#cd00cd",
  "#00cdcd",
  "#e5e5e5",
  "#7f7f7f",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#5c5cff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
] as const;

function buildPalette(): string[] {
  const palette: string[] = [...ANSI_16];
  const levels = [0, 95, 135, 175, 215, 255];
  for (const red of levels) {
    for (const green of levels) {
      for (const blue of levels) {
        palette.push(
          `#${red.toString(16).padStart(2, "0")}${green
            .toString(16)
            .padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`,
        );
      }
    }
  }
  for (let index = 0; index < 24; index++) {
    const value = 8 + index * 10;
    const hex = value.toString(16).padStart(2, "0");
    palette.push(`#${hex}${hex}${hex}`);
  }
  return palette;
}

const PALETTE = buildPalette();

function packageVersion(packageName: string): string {
  let current = path.dirname(require.resolve(packageName));
  for (let depth = 0; depth < 8; depth++) {
    const packagePath = path.join(current, "package.json");
    if (existsSync(packagePath)) {
      const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === packageName && manifest.version) return manifest.version;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return "unknown";
}

function environment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeArtifactName(name: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error(`invalid artifact name ${JSON.stringify(name)}`);
  }
  return name;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface VisualTerminalOptions {
  file: string;
  args?: string[];
  cwd: string;
  artifactDir: string;
  columns?: number;
  rows?: number;
  env?: Record<string, string>;
}

interface ColorRecord {
  kind: "default" | "palette" | "rgb";
  value: number | null;
  hex: string;
}

interface CellRecord {
  column: number;
  chars: string;
  width: number;
  codepoint: number;
  foreground: ColorRecord;
  background: ColorRecord;
  styles: {
    bold: boolean;
    italic: boolean;
    dim: boolean;
    underline: boolean;
    blink: boolean;
    inverse: boolean;
    invisible: boolean;
    strikethrough: boolean;
    overline: boolean;
  };
}

interface RowRecord {
  row: number;
  absoluteRow: number;
  wrapped: boolean;
  text: string;
  cells: CellRecord[];
}

interface ScreenState {
  activeBuffer: "normal" | "alternate";
  dimensions: { columns: number; rows: number };
  viewport: {
    offset: number;
    base: number;
    bufferLength: number;
    selection: null;
  };
  cursor: {
    column: number;
    row: number;
    absoluteRow: number;
    visible: boolean;
    shape: "block" | "underline" | "bar";
  };
  modes: {
    applicationCursorKeys: boolean;
    applicationKeypad: boolean;
    bracketedPaste: boolean;
    insert: boolean;
    mouseTracking: string;
    origin: boolean;
    reverseWraparound: boolean;
    sendFocus: boolean;
    synchronizedOutput: boolean;
    wraparound: boolean;
  };
  rows: RowRecord[];
  scrollback: Array<{ absoluteRow: number; wrapped: boolean; text: string }>;
}

export interface ScreenSnapshot extends ScreenState {
  capturedAt: string;
  profileId: string;
  revision: number;
  parserRevision: number;
  process: {
    pid: number;
    state: "running" | "exited";
    exitCode: number | null;
    signal: number | null;
  };
}

export interface Observation {
  name: string;
  revision: number;
  jsonPath: string;
  textPath: string;
  svgPath: string;
  pngPath: string;
  activeBuffer: "normal" | "alternate";
  text: string;
}

interface ObservationOptions {
  allowUnchanged?: boolean;
  unchangedReason?: string;
}

export interface ActionSource {
  sourceRevision: number;
  allowStale?: boolean;
  staleReason?: string;
  label?: string;
}

interface PendingAction {
  id: number;
  type: string;
  executedRevision: number;
}

interface ProcessRecord {
  file: string;
  args: string[];
  cwd: string;
  pid: number;
  startedAt: string;
  endedAt: string | null;
  state: "running" | "exited";
  exitCode: number | null;
  signal: number | null;
  stdoutAndStderr: "merged by PTY";
  queryRepliesForwarded: number;
  controllerErrors: Array<{ at: string; message: string }>;
  application?: Record<string, unknown>;
}

export class VisualTerminalSession {
  readonly artifactDir: string;
  readonly screensDir: string;
  readonly profilePath: string;
  readonly transcriptPath: string;
  readonly actionsPath: string;
  readonly processPath: string;

  private readonly terminal: TerminalType;
  private readonly child: import("node-pty").IPty;
  private readonly processRecord: ProcessRecord;
  private parserRevision = 0;
  private visibleRevision = 0;
  private pendingWrites = 0;
  private lastScreenHash = "";
  private cursorVisible = true;
  private cursorShape: "block" | "underline" | "bar" = "block";
  private transcriptTail = "";
  private queryReplyCount = 0;
  private inputSource: string | null = null;
  private observationCount = 0;
  private actionCount = 0;
  private pendingAction: PendingAction | null = null;
  private lastObservationRevision: number | null = null;
  private exitInfo: { exitCode: number; signal?: number } | null = null;
  private exitResolve!: (value: { exitCode: number; signal?: number }) => void;
  private readonly exitPromise: Promise<{ exitCode: number; signal?: number }>;
  private closed = false;

  private constructor(options: VisualTerminalOptions) {
    this.artifactDir = path.resolve(options.artifactDir);
    this.screensDir = path.join(this.artifactDir, "screens");
    this.profilePath = path.join(this.artifactDir, "profile.json");
    this.transcriptPath = path.join(this.artifactDir, "transcript.log");
    this.actionsPath = path.join(this.artifactDir, "actions.jsonl");
    this.processPath = path.join(this.artifactDir, "process.json");

    mkdirSync(this.screensDir, { recursive: true });
    writeFileSync(this.transcriptPath, "");
    writeFileSync(this.actionsPath, "");

    const columns = options.columns ?? profileTemplate.terminal.columns;
    const rows = options.rows ?? profileTemplate.terminal.rows;
    this.terminal = new Terminal({
      allowProposedApi: true,
      cols: columns,
      rows,
      scrollback: profileTemplate.terminal.scrollback,
      convertEol: false,
      drawBoldTextInBrightColors: profileTemplate.renderer.drawBoldTextInBrightColors,
      theme: {
        foreground: profileTemplate.renderer.foreground,
        background: profileTemplate.renderer.background,
        cursor: profileTemplate.renderer.cursor,
        black: ANSI_16[0],
        red: ANSI_16[1],
        green: ANSI_16[2],
        yellow: ANSI_16[3],
        blue: ANSI_16[4],
        magenta: ANSI_16[5],
        cyan: ANSI_16[6],
        white: ANSI_16[7],
        brightBlack: ANSI_16[8],
        brightRed: ANSI_16[9],
        brightGreen: ANSI_16[10],
        brightYellow: ANSI_16[11],
        brightBlue: ANSI_16[12],
        brightMagenta: ANSI_16[13],
        brightCyan: ANSI_16[14],
        brightWhite: ANSI_16[15],
      },
    });
    this.terminal.loadAddon(new Unicode11Addon());
    this.terminal.unicode.activeVersion = profileTemplate.terminal.unicodeVersion;
    this.installPresentationTrackers();

    const args = options.args ?? [];
    const env = {
      ...environment(),
      TERM: profileTemplate.terminal.term,
      COLORTERM: profileTemplate.terminal.colorterm,
      CI: "false",
      FORCE_COLOR: "3",
      NODE_NO_WARNINGS: "1",
      ...options.env,
    };
    this.child = pty.spawn(options.file, args, {
      name: profileTemplate.terminal.term,
      cols: columns,
      rows,
      cwd: path.resolve(options.cwd),
      env,
    });

    this.exitPromise = new Promise((resolve) => {
      this.exitResolve = resolve;
    });
    this.processRecord = {
      file: options.file,
      args,
      cwd: path.resolve(options.cwd),
      pid: this.child.pid,
      startedAt: new Date().toISOString(),
      endedAt: null,
      state: "running",
      exitCode: null,
      signal: null,
      stdoutAndStderr: "merged by PTY",
      queryRepliesForwarded: 0,
      controllerErrors: [],
    };
    this.writeProcessRecord();
    this.writeProfile(columns, rows);
    this.lastScreenHash = this.screenHash(this.readScreenState());
    this.connectPtyAndTerminal();
  }

  static async create(options: VisualTerminalOptions): Promise<VisualTerminalSession> {
    return new VisualTerminalSession(options);
  }

  get revision(): number {
    this.refreshRevision();
    return this.visibleRevision;
  }

  get pid(): number {
    return this.child.pid;
  }

  private installPresentationTrackers(): void {
    this.terminal.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
      if (params.some((value) => value === 25)) this.cursorVisible = true;
      return false;
    });
    this.terminal.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
      if (params.some((value) => value === 25)) this.cursorVisible = false;
      return false;
    });
    this.terminal.parser.registerCsiHandler({ intermediates: " ", final: "q" }, (params) => {
      const value = typeof params[0] === "number" ? params[0] : 0;
      this.cursorShape =
        value === 3 || value === 4 ? "underline" : value === 5 || value === 6 ? "bar" : "block";
      return false;
    });
    this.terminal.parser.registerEscHandler({ final: "c" }, () => {
      this.cursorVisible = true;
      this.cursorShape = "block";
      return false;
    });
  }

  private connectPtyAndTerminal(): void {
    this.terminal.onData((data) => {
      if (this.inputSource === null) this.queryReplyCount++;
      this.processRecord.queryRepliesForwarded = this.queryReplyCount;
      this.child.write(data);
    });
    this.terminal.onBinary((data) => {
      this.queryReplyCount++;
      this.processRecord.queryRepliesForwarded = this.queryReplyCount;
      this.child.write(Buffer.from(data, "binary"));
    });
    this.child.onData((data) => {
      appendFileSync(this.transcriptPath, data);
      this.transcriptTail = `${this.transcriptTail}${data}`.slice(-65_536);
      this.parserRevision++;
      this.pendingWrites++;
      this.terminal.write(data, () => {
        this.pendingWrites--;
        if (!this.terminal.modes.synchronizedOutputMode) this.refreshRevision();
      });
    });
    this.child.onExit(({ exitCode, signal }) => {
      const exitInfo = { exitCode, signal };
      this.exitInfo = exitInfo;
      this.processRecord.state = "exited";
      this.processRecord.exitCode = exitCode;
      this.processRecord.signal = signal ?? null;
      this.processRecord.endedAt = new Date().toISOString();
      this.writeProcessRecord();
      this.exitResolve(exitInfo);
    });
  }

  private writeProfile(columns: number, rows: number): void {
    const profile = {
      ...profileTemplate,
      terminal: { ...profileTemplate.terminal, columns, rows },
      implementations: {
        emulator: `@xterm/headless ${packageVersion("@xterm/headless")}`,
        unicode: `@xterm/addon-unicode11 ${packageVersion("@xterm/addon-unicode11")}`,
        pty: `node-pty ${packageVersion("node-pty")}`,
        imageRenderer: `sharp ${packageVersion("sharp")}`,
      },
      host: {
        platform: process.platform,
        operatingSystem: `${os.type()} ${os.release()}`,
        architecture: os.arch(),
        node: process.version,
        ptyBackend: process.platform === "win32" ? "ConPTY" : "POSIX PTY",
        locale: process.env.LC_ALL ?? process.env.LANG ?? "unspecified",
      },
      behavior: {
        terminalQueryReplies: "emulator onData/onBinary is forwarded to the PTY",
        settling:
          "screen predicates plus parser drain and synchronized-output close; no quiet-window requirement",
        transcript: "decoded merged PTY stream; stdout and stderr are not separated",
      },
    };
    writeFileSync(this.profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  }

  private writeProcessRecord(): void {
    writeFileSync(this.processPath, `${JSON.stringify(this.processRecord, null, 2)}\n`);
  }

  private appendAction(value: Record<string, unknown>): void {
    appendFileSync(
      this.actionsPath,
      `${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`,
    );
  }

  private color(cell: IBufferCell, foreground: boolean): ColorRecord {
    const isDefault = foreground ? cell.isFgDefault() : cell.isBgDefault();
    if (isDefault) {
      return {
        kind: "default",
        value: null,
        hex: foreground ? profileTemplate.renderer.foreground : profileTemplate.renderer.background,
      };
    }
    const value = foreground ? cell.getFgColor() : cell.getBgColor();
    const isRgb = foreground ? cell.isFgRGB() : cell.isBgRGB();
    if (isRgb) {
      return { kind: "rgb", value, hex: `#${value.toString(16).padStart(6, "0")}` };
    }
    return { kind: "palette", value, hex: PALETTE[value] ?? "#ffffff" };
  }

  private cell(cell: IBufferCell, column: number): CellRecord {
    return {
      column,
      chars: cell.getChars() || " ",
      width: cell.getWidth(),
      codepoint: cell.getCode(),
      foreground: this.color(cell, true),
      background: this.color(cell, false),
      styles: {
        bold: Boolean(cell.isBold()),
        italic: Boolean(cell.isItalic()),
        dim: Boolean(cell.isDim()),
        underline: Boolean(cell.isUnderline()),
        blink: Boolean(cell.isBlink()),
        inverse: Boolean(cell.isInverse()),
        invisible: Boolean(cell.isInvisible()),
        strikethrough: Boolean(cell.isStrikethrough()),
        overline: Boolean(cell.isOverline()),
      },
    };
  }

  private readScreenState(): ScreenState {
    const buffer = this.terminal.buffer.active;
    const rows: RowRecord[] = [];
    for (let row = 0; row < this.terminal.rows; row++) {
      const absoluteRow = buffer.viewportY + row;
      const line = buffer.getLine(absoluteRow);
      const cells: CellRecord[] = [];
      if (line) {
        const reusable = buffer.getNullCell();
        for (let column = 0; column < this.terminal.cols; column++) {
          const cell = line.getCell(column, reusable);
          if (cell) cells.push(this.cell(cell, column));
        }
      }
      rows.push({
        row,
        absoluteRow,
        wrapped: line?.isWrapped ?? false,
        text:
          line?.translateToString(false, 0, this.terminal.cols) ?? " ".repeat(this.terminal.cols),
        cells,
      });
    }
    const scrollback: ScreenState["scrollback"] = [];
    for (let absoluteRow = 0; absoluteRow < buffer.viewportY; absoluteRow++) {
      const line = buffer.getLine(absoluteRow);
      scrollback.push({
        absoluteRow,
        wrapped: line?.isWrapped ?? false,
        text:
          line?.translateToString(false, 0, this.terminal.cols) ?? " ".repeat(this.terminal.cols),
      });
    }
    const modes = this.terminal.modes;
    const absoluteCursorRow = buffer.baseY + buffer.cursorY;
    return {
      activeBuffer: buffer.type,
      dimensions: { columns: this.terminal.cols, rows: this.terminal.rows },
      viewport: {
        offset: buffer.viewportY,
        base: buffer.baseY,
        bufferLength: buffer.length,
        selection: null,
      },
      cursor: {
        column: buffer.cursorX,
        row: absoluteCursorRow - buffer.viewportY,
        absoluteRow: absoluteCursorRow,
        visible: this.cursorVisible,
        shape: this.cursorShape,
      },
      modes: {
        applicationCursorKeys: modes.applicationCursorKeysMode,
        applicationKeypad: modes.applicationKeypadMode,
        bracketedPaste: modes.bracketedPasteMode,
        insert: modes.insertMode,
        mouseTracking: modes.mouseTrackingMode,
        origin: modes.originMode,
        reverseWraparound: modes.reverseWraparoundMode,
        sendFocus: modes.sendFocusMode,
        synchronizedOutput: modes.synchronizedOutputMode,
        wraparound: modes.wraparoundMode,
      },
      rows,
      scrollback,
    };
  }

  private screenHash(state: ScreenState): string {
    return createHash("sha256").update(JSON.stringify(state)).digest("hex");
  }

  private refreshRevision(): void {
    const hash = this.screenHash(this.readScreenState());
    if (hash !== this.lastScreenHash) {
      this.lastScreenHash = hash;
      this.visibleRevision++;
    }
  }

  private async drain(timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.pendingWrites === 0 && !this.terminal.modes.synchronizedOutputMode) {
        this.refreshRevision();
        return;
      }
      await delay(10);
    }
    throw new Error(
      `terminal parser did not drain within ${timeoutMs}ms (pending writes: ${this.pendingWrites}, synchronized output: ${this.terminal.modes.synchronizedOutputMode})`,
    );
  }

  private currentSnapshot(): ScreenSnapshot {
    this.refreshRevision();
    return {
      capturedAt: new Date().toISOString(),
      profileId: profileTemplate.id,
      revision: this.visibleRevision,
      parserRevision: this.parserRevision,
      ...this.readScreenState(),
      process: {
        pid: this.child.pid,
        state: this.exitInfo ? "exited" : "running",
        exitCode: this.exitInfo?.exitCode ?? null,
        signal: this.exitInfo?.signal ?? null,
      },
    };
  }

  private allText(snapshot = this.currentSnapshot()): string {
    return [
      ...snapshot.scrollback.map((row) => row.text),
      ...snapshot.rows.map((row) => row.text),
    ].join("\n");
  }

  private viewportText(snapshot = this.currentSnapshot()): string {
    return snapshot.rows.map((row) => row.text).join("\n");
  }

  private renderSvg(snapshot: ScreenSnapshot): string {
    const { cellWidthPx, cellHeightPx, fontFamily, fontSizePx, background, cursor } =
      profileTemplate.renderer;
    const width = snapshot.dimensions.columns * cellWidthPx;
    const height = snapshot.dimensions.rows * cellHeightPx;
    const elements = [`<rect width="${width}" height="${height}" fill="${background}"/>`];
    for (const row of snapshot.rows) {
      for (const cell of row.cells) {
        if (cell.width === 0) continue;
        const resolvedForeground =
          cell.styles.bold &&
          profileTemplate.renderer.drawBoldTextInBrightColors &&
          cell.foreground.kind === "palette" &&
          cell.foreground.value !== null &&
          cell.foreground.value < 8
            ? PALETTE[cell.foreground.value + 8]!
            : cell.foreground.hex;
        // xterm resolves bold's bright-foreground mapping before applying inverse video. This
        // keeps SGR 1;31;47;7 as white text on a bright-red background, not the reverse mapping.
        const foreground = cell.styles.inverse ? cell.background.hex : resolvedForeground;
        const cellBackground = cell.styles.inverse ? resolvedForeground : cell.background.hex;
        const x = cell.column * cellWidthPx;
        const y = row.row * cellHeightPx;
        if (cellBackground !== background) {
          elements.push(
            `<rect x="${x}" y="${y}" width="${Math.max(1, cell.width) * cellWidthPx}" height="${cellHeightPx}" fill="${cellBackground}"/>`,
          );
        }
        if (cell.chars !== " " && !cell.styles.invisible) {
          const decorations = [
            cell.styles.underline ? "underline" : "",
            cell.styles.strikethrough ? "line-through" : "",
            cell.styles.overline ? "overline" : "",
          ]
            .filter(Boolean)
            .join(" ");
          elements.push(
            `<text x="${x}" y="${y + fontSizePx}" fill="${foreground}" font-family="${xmlEscape(fontFamily)}" font-size="${fontSizePx}" font-weight="${cell.styles.bold ? 700 : 400}" font-style="${cell.styles.italic ? "italic" : "normal"}" opacity="${cell.styles.dim ? 0.58 : 1}"${decorations ? ` text-decoration="${decorations}"` : ""}>${xmlEscape(cell.chars)}</text>`,
          );
        }
      }
    }
    const caret = snapshot.cursor;
    if (
      caret.visible &&
      caret.row >= 0 &&
      caret.row < snapshot.dimensions.rows &&
      caret.column >= 0 &&
      caret.column < snapshot.dimensions.columns
    ) {
      const x = caret.column * cellWidthPx;
      const y = caret.row * cellHeightPx;
      if (caret.shape === "bar") {
        elements.push(
          `<rect x="${x}" y="${y}" width="2" height="${cellHeightPx}" fill="${cursor}" opacity="0.85"/>`,
        );
      } else if (caret.shape === "underline") {
        elements.push(
          `<rect x="${x}" y="${y + cellHeightPx - 2}" width="${cellWidthPx}" height="2" fill="${cursor}" opacity="0.85"/>`,
        );
      } else {
        elements.push(
          `<rect x="${x}" y="${y}" width="${cellWidthPx}" height="${cellHeightPx}" fill="${cursor}" opacity="0.45"/>`,
        );
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${xmlEscape(profileTemplate.id)} revision ${snapshot.revision}</title><g style="font-variant-ligatures:none;text-rendering:geometricPrecision">${elements.join("")}</g></svg>`;
  }

  async observe(name: string, options: ObservationOptions = {}): Promise<Observation> {
    await this.drain();
    const safeName = safeArtifactName(name);
    const snapshot = this.currentSnapshot();
    if (this.pendingAction && snapshot.revision === this.pendingAction.executedRevision) {
      if (!options.allowUnchanged) {
        throw new Error(
          `screen revision has not changed since action ${this.pendingAction.id}; wait for an explicit result before observe(), or allow an unchanged result with a reason`,
        );
      }
      if (!options.unchangedReason?.trim()) {
        throw new Error("allowUnchanged requires an unchangedReason");
      }
    }
    const sequence = String(++this.observationCount).padStart(4, "0");
    const base = path.join(this.screensDir, `${sequence}-${safeName}`);
    const jsonPath = `${base}.json`;
    const textPath = `${base}.txt`;
    const svgPath = `${base}.svg`;
    const pngPath = `${base}.png`;
    const svg = this.renderSvg(snapshot);
    writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    writeFileSync(
      textPath,
      `${snapshot.rows.map((row) => `${String(row.row).padStart(2, "0")}|${row.text}|`).join("\n")}\n`,
    );
    writeFileSync(svgPath, svg);
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    this.lastObservationRevision = snapshot.revision;
    if (this.pendingAction) {
      this.appendAction({
        event: "action-observed",
        actionId: this.pendingAction.id,
        actionType: this.pendingAction.type,
        executedRevision: this.pendingAction.executedRevision,
        resultRevision: snapshot.revision,
        screenChanged: snapshot.revision !== this.pendingAction.executedRevision,
        unchangedReason: options.unchangedReason ?? null,
        observation: safeName,
      });
      this.pendingAction = null;
    }
    this.appendAction({
      event: "observation",
      name: safeName,
      revision: snapshot.revision,
      jsonPath,
      pngPath,
    });
    return {
      name: safeName,
      revision: snapshot.revision,
      jsonPath,
      textPath,
      svgPath,
      pngPath,
      activeBuffer: snapshot.activeBuffer,
      text: this.viewportText(snapshot),
    };
  }

  async waitForText(
    text: string,
    options: { present?: boolean; scope?: "viewport" | "all"; timeoutMs?: number } = {},
  ): Promise<{ text: string; present: boolean; revision: number }> {
    const present = options.present ?? true;
    const scope = options.scope ?? "viewport";
    const timeoutMs = options.timeoutMs ?? 10_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.drain(500);
      } catch {
        // Keep trying until the caller's explicit deadline. A synchronized update may span chunks.
      }
      const snapshot = this.currentSnapshot();
      const haystack = scope === "all" ? this.allText(snapshot) : this.viewportText(snapshot);
      if (haystack.includes(text) === present) {
        return { text, present, revision: snapshot.revision };
      }
      if (this.exitInfo && present) break;
      await delay(20);
    }
    const message = `timed out after ${timeoutMs}ms waiting for ${JSON.stringify(text)} to be ${present ? "present" : "absent"}; transcript tail: ${JSON.stringify(this.transcriptTail.slice(-2000))}`;
    this.recordControllerError(message);
    throw new Error(message);
  }

  async waitForRevision(
    afterRevision: number,
    timeoutMs = 10_000,
  ): Promise<{ afterRevision: number; revision: number }> {
    if (!Number.isInteger(afterRevision) || afterRevision < 0) {
      throw new Error("afterRevision must be a non-negative integer");
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.drain(500);
      } catch {
        // Keep trying until the caller's explicit deadline. A synchronized update may span chunks.
      }
      const revision = this.revision;
      if (revision > afterRevision) return { afterRevision, revision };
      await delay(20);
    }
    const message = `timed out after ${timeoutMs}ms waiting for a visible revision after ${afterRevision}`;
    this.recordControllerError(message);
    throw new Error(message);
  }

  private async prepareAction(type: string, source: ActionSource): Promise<PendingAction> {
    if (this.pendingAction) {
      throw new Error(
        `action ${this.pendingAction.id} has not been observed; call observe() before another state-sensitive action`,
      );
    }
    if (
      this.lastObservationRevision === null ||
      source.sourceRevision !== this.lastObservationRevision
    ) {
      throw new Error(
        `action source revision ${source.sourceRevision} was not returned by the most recent observe() in this session`,
      );
    }
    await this.drain();
    const executedRevision = this.revision;
    const stale = executedRevision !== source.sourceRevision;
    if (stale && !source.allowStale) {
      throw new Error(
        `stale observation: action chose revision ${source.sourceRevision}, current revision is ${executedRevision}; observe again or provide allowStale with a reason`,
      );
    }
    if (stale && !source.staleReason?.trim()) {
      throw new Error(
        "allowStale requires a staleReason explaining why the intervening screen change is benign",
      );
    }
    const action: PendingAction = { id: ++this.actionCount, type, executedRevision };
    this.pendingAction = action;
    this.appendAction({
      event: "action-executed",
      actionId: action.id,
      type,
      label: source.label ?? null,
      sourceRevision: source.sourceRevision,
      executedRevision,
      stale,
      staleReason: source.staleReason ?? null,
    });
    return action;
  }

  private sendThroughTerminal(data: string, source: string): void {
    this.inputSource = source;
    try {
      this.terminal.input(data, true);
    } finally {
      this.inputSource = null;
    }
  }

  async input(
    data: string,
    source: ActionSource,
  ): Promise<{ actionId: number; executedRevision: number }> {
    const action = await this.prepareAction("input", source);
    this.appendAction({
      event: "action-payload",
      actionId: action.id,
      dataHex: Buffer.from(data).toString("hex"),
    });
    this.sendThroughTerminal(data, `user:${source.label ?? "input"}`);
    return { actionId: action.id, executedRevision: action.executedRevision };
  }

  async key(
    name: string,
    source: ActionSource,
  ): Promise<{ actionId: number; executedRevision: number; sequenceHex: string }> {
    const normalized = name.toLowerCase();
    const applicationCursor = this.terminal.modes.applicationCursorKeysMode;
    const sequences: Record<string, string> = {
      enter: "\r",
      escape: "\x1b",
      tab: "\t",
      backspace: "\x7f",
      delete: "\x1b[3~",
      up: applicationCursor ? "\x1bOA" : "\x1b[A",
      down: applicationCursor ? "\x1bOB" : "\x1b[B",
      right: applicationCursor ? "\x1bOC" : "\x1b[C",
      left: applicationCursor ? "\x1bOD" : "\x1b[D",
      home: applicationCursor ? "\x1bOH" : "\x1b[H",
      end: applicationCursor ? "\x1bOF" : "\x1b[F",
      pageup: "\x1b[5~",
      pagedown: "\x1b[6~",
      "ctrl-c": "\x03",
    };
    const sequence = name.length === 1 ? name : sequences[normalized];
    if (sequence === undefined) throw new Error(`unsupported key ${JSON.stringify(name)}`);
    const action = await this.prepareAction("key", source);
    this.appendAction({
      event: "action-payload",
      actionId: action.id,
      key: normalized,
      sequenceHex: Buffer.from(sequence).toString("hex"),
    });
    this.sendThroughTerminal(sequence, `user:key:${normalized}`);
    return {
      actionId: action.id,
      executedRevision: action.executedRevision,
      sequenceHex: Buffer.from(sequence).toString("hex"),
    };
  }

  async paste(
    text: string,
    source: ActionSource,
  ): Promise<{ actionId: number; executedRevision: number; bracketed: boolean }> {
    const action = await this.prepareAction("paste", source);
    const bracketed = this.terminal.modes.bracketedPasteMode;
    const data = bracketed ? `\x1b[200~${text}\x1b[201~` : text;
    this.appendAction({
      event: "action-payload",
      actionId: action.id,
      bracketed,
      textLength: text.length,
    });
    this.sendThroughTerminal(data, "user:paste");
    return { actionId: action.id, executedRevision: action.executedRevision, bracketed };
  }

  async resize(
    columns: number,
    rows: number,
    source: ActionSource,
  ): Promise<{ actionId: number; executedRevision: number; columns: number; rows: number }> {
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
      throw new Error(`invalid terminal size ${columns}x${rows}`);
    }
    const action = await this.prepareAction("resize", source);
    this.child.resize(columns, rows);
    this.terminal.resize(columns, rows);
    this.refreshRevision();
    this.appendAction({ event: "action-payload", actionId: action.id, columns, rows });
    return { actionId: action.id, executedRevision: action.executedRevision, columns, rows };
  }

  async localScroll(
    lines: number,
    source: ActionSource,
  ): Promise<{ actionId: number; executedRevision: number; viewportOffset: number }> {
    if (!Number.isInteger(lines)) throw new Error("localScroll lines must be an integer");
    const action = await this.prepareAction("local-scroll", source);
    this.terminal.scrollLines(lines);
    this.refreshRevision();
    this.appendAction({ event: "action-payload", actionId: action.id, lines });
    return {
      actionId: action.id,
      executedRevision: action.executedRevision,
      viewportOffset: this.terminal.buffer.active.viewportY,
    };
  }

  async signal(
    signal: string,
    source: ActionSource,
  ): Promise<{ actionId: number; executedRevision: number; signal: string }> {
    const action = await this.prepareAction("signal", source);
    this.child.kill(signal);
    this.appendAction({ event: "action-payload", actionId: action.id, signal });
    return { actionId: action.id, executedRevision: action.executedRevision, signal };
  }

  sendSystem(data: string, label: string): void {
    this.appendAction({ event: "system-input", label, dataHex: Buffer.from(data).toString("hex") });
    this.sendThroughTerminal(data, `system:${label}`);
  }

  status(): Record<string, unknown> {
    const snapshot = this.currentSnapshot();
    return {
      revision: snapshot.revision,
      parserRevision: snapshot.parserRevision,
      pendingWrites: this.pendingWrites,
      activeBuffer: snapshot.activeBuffer,
      dimensions: snapshot.dimensions,
      cursor: snapshot.cursor,
      modes: snapshot.modes,
      process: snapshot.process,
      queryRepliesForwarded: this.queryReplyCount,
      pendingAction: this.pendingAction,
      transcriptTail: this.transcriptTail.slice(-2000),
    };
  }

  setApplicationResult(value: Record<string, unknown>): void {
    this.processRecord.application = value;
    this.writeProcessRecord();
  }

  async waitForExit(timeoutMs = 10_000): Promise<{ exitCode: number; signal?: number }> {
    if (this.exitInfo) return this.exitInfo;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`PTY process did not exit within ${timeoutMs}ms`)),
        timeoutMs,
      );
      void this.exitPromise.then((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }

  recordControllerError(message: string): void {
    this.processRecord.controllerErrors.push({ at: new Date().toISOString(), message });
    this.writeProcessRecord();
    this.appendAction({ event: "controller-error", message });
  }

  async close(options: { gracefulInput?: string; timeoutMs?: number } = {}): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (!this.exitInfo && options.gracefulInput)
      this.sendSystem(options.gracefulInput, "controller-close");
    if (!this.exitInfo) {
      try {
        await this.waitForExit(options.timeoutMs ?? 3000);
      } catch {
        try {
          this.child.kill();
          await this.waitForExit(1000);
        } catch {
          // node-pty can already be gone when cleanup races a natural exit.
        }
      }
    }
    this.writeProcessRecord();
    this.terminal.dispose();
  }
}
